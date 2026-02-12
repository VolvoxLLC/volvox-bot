/**
 * Bill Bot - Volvox Discord Bot
 * Main entry point - orchestrates modules
 *
 * Features:
 * - AI chat powered by Claude
 * - Welcome messages for new members
 * - Spam/scam detection and moderation
 * - Health monitoring and status command
 * - Graceful shutdown handling
 * - Structured logging
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import { closeDb, initDb } from './db.js';
import { error, info, warn } from './logger.js';
import {
  getConversationHistory,
  initConversationHistory,
  setConversationHistory,
  setPool,
  startConversationCleanup,
  stopConversationCleanup,
} from './modules/ai.js';
import { loadConfig } from './modules/config.js';
import { registerEventHandlers } from './modules/events.js';
import { startTempbanScheduler, stopTempbanScheduler } from './modules/moderation.js';
import { HealthMonitor } from './utils/health.js';
import { loadCommandsFromDirectory } from './utils/loadCommands.js';
import { getPermissionError, hasPermission } from './utils/permissions.js';
import { registerCommands } from './utils/registerCommands.js';

// ES module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// State persistence path
const dataDir = join(__dirname, '..', 'data');
const statePath = join(dataDir, 'state.json');

// Load environment variables
dotenvConfig();

// Config is loaded asynchronously after DB init (see startup below).
// After loadConfig() resolves, `config` points to the same object as
// configCache inside modules/config.js, so in-place mutations from
// setConfigValue() propagate here automatically without re-assignment.
let config = {};

// Initialize Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Initialize command collection
client.commands = new Collection();

// Initialize health monitor
const healthMonitor = HealthMonitor.getInstance();

/**
 * Save conversation history to disk
 */
function saveState() {
  try {
    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const conversationHistory = getConversationHistory();
    const stateData = {
      conversationHistory: Array.from(conversationHistory.entries()),
      timestamp: new Date().toISOString(),
    };
    writeFileSync(statePath, JSON.stringify(stateData, null, 2), 'utf-8');
    info('State saved successfully');
  } catch (err) {
    error('Failed to save state', { error: err.message });
  }
}

/**
 * Load conversation history from disk
 */
function loadState() {
  try {
    if (!existsSync(statePath)) {
      return;
    }
    const stateData = JSON.parse(readFileSync(statePath, 'utf-8'));
    if (stateData.conversationHistory) {
      setConversationHistory(new Map(stateData.conversationHistory));
      info('State loaded successfully');
    }
  } catch (err) {
    error('Failed to load state', { error: err.message });
  }
}

/**
 * Load all commands from the commands directory
 */
async function loadCommands() {
  const commandsPath = join(__dirname, 'commands');

  await loadCommandsFromDirectory({
    commandsPath,
    onCommandLoaded: (command) => {
      client.commands.set(command.data.name, command);
    },
  });
}

// Event handlers are registered after config loads (see startup below)

// Extend ready handler to register slash commands
client.once(Events.ClientReady, async () => {
  // Register slash commands with Discord
  try {
    const commands = Array.from(client.commands.values());
    const guildId = process.env.GUILD_ID || null;

    await registerCommands(commands, client.user.id, process.env.DISCORD_TOKEN, guildId);
  } catch (err) {
    error('Command registration failed', { error: err.message });
  }
});

// Handle slash commands and autocomplete
client.on('interactionCreate', async (interaction) => {
  // Handle autocomplete
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        error('Autocomplete error', { command: interaction.commandName, error: err.message });
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, member } = interaction;

  try {
    info('Slash command received', { command: commandName, user: interaction.user.tag });

    // Permission check
    if (!hasPermission(member, commandName, config)) {
      await interaction.reply({
        content: getPermissionError(commandName),
        ephemeral: true,
      });
      warn('Permission denied', { user: interaction.user.tag, command: commandName });
      return;
    }

    // Execute command from collection
    const command = client.commands.get(commandName);
    if (!command) {
      await interaction.reply({
        content: '❌ Command not found.',
        ephemeral: true,
      });
      return;
    }

    await command.execute(interaction);
    info('Command executed', { command: commandName, user: interaction.user.tag });
  } catch (err) {
    error('Command error', { command: commandName, error: err.message, stack: err.stack });

    const errorMessage = {
      content: '❌ An error occurred while executing this command.',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage).catch(() => {});
    } else {
      await interaction.reply(errorMessage).catch(() => {});
    }
  }
});

/**
 * Graceful shutdown handler
 * @param {string} signal - Signal that triggered shutdown
 */
async function gracefulShutdown(signal) {
  info('Shutdown initiated', { signal });

  // 1. Stop conversation cleanup timer and tempban scheduler
  stopConversationCleanup();
  stopTempbanScheduler();

  // 2. Save state
  info('Saving conversation state');
  saveState();

  // 3. Close database pool
  info('Closing database connection');
  try {
    await closeDb();
  } catch (err) {
    error('Failed to close database pool', { error: err.message });
  }

  // 4. Destroy Discord client
  info('Disconnecting from Discord');
  client.destroy();

  // 5. Log clean exit
  info('Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Error handling
client.on('error', (err) => {
  error('Discord client error', {
    error: err.message,
    stack: err.stack,
    code: err.code,
  });
});

// Start bot
const token = process.env.DISCORD_TOKEN;
if (!token) {
  error('DISCORD_TOKEN not set');
  process.exit(1);
}

/**
 * Main startup sequence
 * 1. Initialize database
 * 2. Load config from DB (seeds from config.json if empty)
 * 3. Load previous conversation state
 * 4. Register event handlers with live config
 * 5. Load commands
 * 6. Login to Discord
 */
async function startup() {
  // Initialize database
  let dbPool = null;
  if (process.env.DATABASE_URL) {
    dbPool = await initDb();
    info('Database initialized');
  } else {
    warn('DATABASE_URL not set — using config.json only (no persistence)');
  }

  // Load config (from DB if available, else config.json)
  config = await loadConfig();
  info('Configuration loaded', { sections: Object.keys(config) });

  // Set up AI module's DB pool reference
  if (dbPool) {
    setPool(dbPool);
  }

  // TODO: loadState() is migration-only for file->DB persistence transition.
  // When DB is available, initConversationHistory() effectively overwrites this state.
  // Once all environments are DB-backed, remove this call and loadState/saveState helpers.
  loadState();

  // Hydrate conversation history from DB (overwrites file state if DB is available)
  await initConversationHistory();

  // Start periodic conversation cleanup
  startConversationCleanup();

  // Register event handlers with live config reference
  registerEventHandlers(client, config, healthMonitor);

  // Start tempban scheduler for automatic unbans (DB required)
  if (dbPool) {
    startTempbanScheduler(client);
  }

  // Load commands and login
  await loadCommands();
  await client.login(token);
}

startup().catch((err) => {
  error('Startup failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
