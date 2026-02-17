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
import { addPostgresTransport, error, info, removePostgresTransport, warn } from './logger.js';
import {
  getConversationHistory,
  initConversationHistory,
  setConversationHistory,
  setPool,
  startConversationCleanup,
  stopConversationCleanup,
} from './modules/ai.js';
import { loadConfig, onConfigChange } from './modules/config.js';
import { registerEventHandlers } from './modules/events.js';
import { checkMem0Health, markUnavailable } from './modules/memory.js';
import { startTempbanScheduler, stopTempbanScheduler } from './modules/moderation.js';
import { loadOptOuts } from './modules/optout.js';
import { initLogsTable, pruneOldLogs } from './transports/postgres.js';
import { HealthMonitor } from './utils/health.js';
import { loadCommandsFromDirectory } from './utils/loadCommands.js';
import { getPermissionError, hasPermission } from './utils/permissions.js';
import { registerCommands } from './utils/registerCommands.js';
import { safeFollowUp, safeReply } from './utils/safeSend.js';

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
let pgTransport = null;

// Initialize Discord client with required intents.
//
// INTENTIONAL DESIGN: allowedMentions restricts which mention types Discord
// will parse. Only 'users' is allowed — @everyone, @here, and role mentions
// are ALL blocked globally at the Client level. This is a defense-in-depth
// measure to prevent the bot from ever mass-pinging, even if AI-generated
// or user-supplied content contains @everyone/@here or <@&roleId>.
//
// To opt-in to role mentions in the future, add 'roles' to the parse array
// below (e.g. { parse: ['users', 'roles'] }). You would also need to update
// SAFE_ALLOWED_MENTIONS in src/utils/safeSend.js to match.
//
// See: https://github.com/BillChirico/bills-bot/issues/61
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
  allowedMentions: { parse: ['users'] },
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
      await safeReply(interaction, {
        content: getPermissionError(commandName),
        ephemeral: true,
      });
      warn('Permission denied', { user: interaction.user.tag, command: commandName });
      return;
    }

    // Execute command from collection
    const command = client.commands.get(commandName);
    if (!command) {
      await safeReply(interaction, {
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
      await safeFollowUp(interaction, errorMessage).catch(() => {});
    } else {
      await safeReply(interaction, errorMessage).catch(() => {});
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

  // 3. Remove PostgreSQL logging transport (flushes remaining buffer)
  if (pgTransport) {
    try {
      await removePostgresTransport(pgTransport);
      pgTransport = null;
    } catch (err) {
      error('Failed to close PostgreSQL logging transport', { error: err.message });
    }
  }

  // 4. Close database pool
  info('Closing database connection');
  try {
    await closeDb();
  } catch (err) {
    error('Failed to close database pool', { error: err.message });
  }

  // 5. Destroy Discord client
  info('Disconnecting from Discord');
  client.destroy();

  // 6. Log clean exit
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

  // Register config change listeners for hot-reload
  //
  // Logging transport: stateful — requires reactive wiring to add/remove/recreate
  // the PostgreSQL transport when config changes at runtime.
  onConfigChange('logging.database.enabled', async (newValue, _oldValue, path) => {
    if (!dbPool) return;
    try {
      if (newValue) {
        if (pgTransport) {
          await removePostgresTransport(pgTransport);
          pgTransport = null;
        }
        await initLogsTable(dbPool);
        pgTransport = addPostgresTransport(dbPool, config.logging.database);
        info('PostgreSQL logging transport enabled via config change', { path });
      } else {
        if (pgTransport) {
          await removePostgresTransport(pgTransport);
          pgTransport = null;
          info('PostgreSQL logging transport disabled via config change', { path });
        }
      }
    } catch (err) {
      error('Failed to toggle PostgreSQL logging transport', { path, error: err.message });
    }
  });

  for (const key of [
    'logging.database.batchSize',
    'logging.database.flushIntervalMs',
    'logging.database.minLevel',
  ]) {
    onConfigChange(key, async (newValue, _oldValue, path) => {
      if (!dbPool || !config.logging?.database?.enabled || !pgTransport) return;
      try {
        await removePostgresTransport(pgTransport);
        pgTransport = addPostgresTransport(dbPool, config.logging.database);
        info('PostgreSQL logging transport recreated after config change', { path, newValue });
      } catch (err) {
        error('Failed to recreate PostgreSQL logging transport', { path, error: err.message });
      }
    });
  }

  // AI, spam, and moderation modules call getConfig() per-request, so config
  // changes take effect automatically. Listeners provide observability only.
  onConfigChange('ai.*', (newValue, _oldValue, path) => {
    info('AI config updated', { path, newValue });
  });
  onConfigChange('spam.*', (newValue, _oldValue, path) => {
    info('Spam config updated', { path, newValue });
  });
  onConfigChange('moderation.*', (newValue, _oldValue, path) => {
    info('Moderation config updated', { path, newValue });
  });

  // Set up AI module's DB pool reference
  if (dbPool) {
    setPool(dbPool);

    // Wire up PostgreSQL logging transport if enabled in config
    if (config.logging?.database?.enabled) {
      try {
        await initLogsTable(dbPool);
        pgTransport = addPostgresTransport(dbPool, config.logging.database);
        info('PostgreSQL logging transport enabled');

        // Prune old logs on startup
        const retentionDays = config.logging.database.retentionDays ?? 30;
        const pruned = await pruneOldLogs(dbPool, retentionDays);
        if (pruned > 0) {
          info('Pruned old log entries', { pruned, retentionDays });
        }
      } catch (err) {
        error('Failed to initialize PostgreSQL logging transport', { error: err.message });
      }
    }
  }

  // TODO: loadState() is migration-only for file->DB persistence transition.
  // When DB is available, initConversationHistory() effectively overwrites this state.
  // Once all environments are DB-backed, remove this call and loadState/saveState helpers.
  loadState();

  // Hydrate conversation history from DB (overwrites file state if DB is available)
  await initConversationHistory();

  // Start periodic conversation cleanup
  startConversationCleanup();

  // Load opt-out preferences from DB before enabling memory features
  await loadOptOuts();

  // Check mem0 availability for user memory features (with timeout to avoid blocking startup).
  // AbortController prevents a late-resolving health check from calling markAvailable()
  // after the timeout has already called markUnavailable().
  const healthAbort = new AbortController();
  try {
    await Promise.race([
      checkMem0Health({ signal: healthAbort.signal }),
      new Promise((_, reject) =>
        setTimeout(() => {
          healthAbort.abort();
          reject(new Error('mem0 health check timed out'));
        }, 10_000),
      ),
    ]);
  } catch (err) {
    markUnavailable();
    warn('mem0 health check timed out or failed — continuing without memory features', {
      error: err.message,
    });
  }

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
