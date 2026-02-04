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

import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import { readdirSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { info, warn, error } from './logger.js';
import { loadConfig } from './modules/config.js';
import { registerEventHandlers } from './modules/events.js';
import { HealthMonitor } from './utils/health.js';
import { registerCommands } from './utils/registerCommands.js';
import { hasPermission, getPermissionError } from './utils/permissions.js';
import { getConversationHistory, setConversationHistory } from './modules/ai.js';

// ES module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// State persistence path
const dataDir = join(__dirname, '..', 'data');
const statePath = join(dataDir, 'state.json');

// Load environment variables
dotenvConfig();

// Load configuration
const config = loadConfig();

// Initialize Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Initialize command collection
client.commands = new Collection();

// Initialize health monitor
const healthMonitor = HealthMonitor.getInstance();

// Track pending AI requests for graceful shutdown
const pendingRequests = new Set();

/**
 * Register a pending request for tracking
 * @returns {Symbol} Request ID to use for cleanup
 */
export function registerPendingRequest() {
  const requestId = Symbol('request');
  pendingRequests.add(requestId);
  return requestId;
}

/**
 * Remove a pending request from tracking
 * @param {Symbol} requestId - Request ID to remove
 */
export function removePendingRequest(requestId) {
  pendingRequests.delete(requestId);
}

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
  const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    try {
      const command = await import(filePath);
      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        info('Loaded command', { command: command.data.name });
      } else {
        warn('Command missing data or execute export', { file });
      }
    } catch (err) {
      error('Failed to load command', { file, error: err.message });
    }
  }
}

// Register all event handlers
registerEventHandlers(client, config, healthMonitor);

// Extend ready handler to register slash commands
client.once('ready', async () => {
  // Register slash commands with Discord
  try {
    const commands = Array.from(client.commands.values());
    const guildId = process.env.GUILD_ID || null;

    await registerCommands(
      commands,
      client.user.id,
      process.env.DISCORD_TOKEN,
      guildId
    );
  } catch (err) {
    error('Command registration failed', { error: err.message });
  }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member } = interaction;

  try {
    info('Slash command received', { command: commandName, user: interaction.user.tag });

    // Permission check
    if (!hasPermission(member, commandName, config)) {
      await interaction.reply({
        content: getPermissionError(commandName),
        ephemeral: true
      });
      warn('Permission denied', { user: interaction.user.tag, command: commandName });
      return;
    }

    // Execute command from collection
    const command = client.commands.get(commandName);
    if (!command) {
      await interaction.reply({
        content: '❌ Command not found.',
        ephemeral: true
      });
      return;
    }

    await command.execute(interaction);
    info('Command executed', { command: commandName, user: interaction.user.tag });
  } catch (err) {
    error('Command error', { command: commandName, error: err.message, stack: err.stack });

    const errorMessage = {
      content: '❌ An error occurred while executing this command.',
      ephemeral: true
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

  // 1. Wait for pending requests with timeout
  const SHUTDOWN_TIMEOUT = 10000; // 10 seconds
  if (pendingRequests.size > 0) {
    info('Waiting for pending requests', { count: pendingRequests.size });
    const startTime = Date.now();

    while (pendingRequests.size > 0 && (Date.now() - startTime) < SHUTDOWN_TIMEOUT) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (pendingRequests.size > 0) {
      warn('Shutdown timeout, requests still pending', { count: pendingRequests.size });
    } else {
      info('All requests completed');
    }
  }

  // 2. Save state after pending requests complete
  info('Saving conversation state');
  saveState();

  // 3. Destroy Discord client
  info('Disconnecting from Discord');
  client.destroy();

  // 4. Log clean exit
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
    code: err.code
  });
});

process.on('unhandledRejection', (err) => {
  error('Unhandled promise rejection', {
    error: err?.message || String(err),
    stack: err?.stack,
    type: typeof err
  });
});

// Start bot
const token = process.env.DISCORD_TOKEN;
if (!token) {
  error('DISCORD_TOKEN not set');
  process.exit(1);
}

// Load previous state on startup
loadState();

// Load commands and login
loadCommands()
  .then(() => client.login(token))
  .catch((err) => {
    error('Startup failed', { error: err.message });
    process.exit(1);
  });
