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
import { startServer, stopServer } from './api/server.js';
import { registerConfigListeners, removeLoggingTransport, setInitialTransport } from './config-listeners.js';
import { closeDb, getPool, initDb } from './db.js';
import { addPostgresTransport, debug, error, info, warn } from './logger.js';
import {
  getConversationHistory,
  initConversationHistory,
  setConversationHistory,
  setPool,
  startConversationCleanup,
  stopConversationCleanup,
} from './modules/ai.js';
import { getConfig, loadConfig } from './modules/config.js';
import { registerEventHandlers } from './modules/events.js';
import { checkMem0Health, markUnavailable } from './modules/memory.js';
import { startTempbanScheduler, stopTempbanScheduler } from './modules/moderation.js';
import { loadOptOuts } from './modules/optout.js';
import { startTriage, stopTriage } from './modules/triage.js';
import { initLogsTable, pruneOldLogs } from './transports/postgres.js';
import { HealthMonitor } from './utils/health.js';
import { loadCommandsFromDirectory } from './utils/loadCommands.js';
import { getPermissionError, hasPermission } from './utils/permissions.js';
import { registerCommands } from './utils/registerCommands.js';
import { safeFollowUp, safeReply } from './utils/safeSend.js';
import { recordRestart, updateUptimeOnShutdown } from './utils/restartTracker.js';

// ES module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// State persistence path
const dataDir = join(__dirname, '..', 'data');
const statePath = join(dataDir, 'state.json');

// Package version (for restart tracking)
const { version: BOT_VERSION } = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);

// Load environment variables
dotenvConfig();

// Config is loaded asynchronously after DB init (see startup below).
// After loadConfig() resolves, `config` points to the same object as
// configCache inside modules/config.js, so in-place mutations from
// setConfigValue() propagate here automatically without re-assignment.
let config = {};

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
    const guildConfig = getConfig(interaction.guildId);
    if (!hasPermission(member, commandName, guildConfig)) {
      const permLevel = guildConfig.permissions?.allowedCommands?.[commandName] || 'administrator';
      await safeReply(interaction, {
        content: getPermissionError(commandName, permLevel),
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
      await safeFollowUp(interaction, errorMessage).catch((replyErr) => {
        debug('Failed to send error follow-up', { error: replyErr.message, command: commandName });
      });
    } else {
      await safeReply(interaction, errorMessage).catch((replyErr) => {
        debug('Failed to send error reply', { error: replyErr.message, command: commandName });
      });
    }
  }
});

/**
 * Perform an orderly shutdown: stop background services, persist in-memory state, remove logging transport, close the database pool, disconnect the Discord client, and exit the process.
 * @param {string} signal - The signal name that initiated shutdown (e.g., "SIGINT", "SIGTERM").
 */
async function gracefulShutdown(signal) {
  info('Shutdown initiated', { signal });

  // 1. Stop triage, conversation cleanup timer, and tempban scheduler
  stopTriage();
  stopConversationCleanup();
  stopTempbanScheduler();

  // 1.5. Stop API server (drain in-flight HTTP requests before closing DB)
  try {
    await stopServer();
  } catch (err) {
    error('Failed to stop API server', { error: err.message });
  }

  // 2. Save state
  info('Saving conversation state');
  saveState();

  // 3. Remove PostgreSQL logging transport (flushes remaining buffer)
  try {
    await removeLoggingTransport();
  } catch (err) {
    error('Failed to close PostgreSQL logging transport', { error: err.message });
  }

  // 3.5. Record uptime before closing the pool
  try {
    const pool = getPool();
    await updateUptimeOnShutdown(pool);
  } catch {
    // Pool may not be initialized (no DATABASE_URL configured) — safe to skip
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
 * Perform full application startup: initialize the database and optional PostgreSQL logging, load configuration and conversation history, start background services (conversation cleanup, memory checks, triage, tempban scheduler), register event handlers, load slash commands, and log the Discord client in.
 */
async function startup() {
  // Initialize database
  let dbPool = null;
  if (process.env.DATABASE_URL) {
    dbPool = await initDb();
    info('Database initialized');

    // Record this startup in the restart history table
    await recordRestart(dbPool, 'startup', BOT_VERSION);
  } else {
    warn('DATABASE_URL not set — using config.json only (no persistence)');
  }

  // Load config (from DB if available, else config.json)
  config = await loadConfig();
  info('Configuration loaded', { sections: Object.keys(config) });
  // Warn if using default bot owner ID (upstream maintainer)
  const defaultOwnerId = '191633014441115648';
  const owners = config.permissions?.botOwners;
  if (Array.isArray(owners) && owners.includes(defaultOwnerId)) {
    warn(
      'Default botOwners detected in config — update permissions.botOwners with your own Discord user ID(s) before deploying',
      {
        defaultOwnerId,
      },
    );
  }

  // Register config change listeners for hot-reload (logging transport,
  // observability listeners for AI/spam/moderation config changes)
  registerConfigListeners({ dbPool, config });

  // Set up AI module's DB pool reference
  if (dbPool) {
    setPool(dbPool);

    // Wire up PostgreSQL logging transport if enabled in config
    if (config.logging?.database?.enabled) {
      try {
        await initLogsTable(dbPool);
        const transport = addPostgresTransport(dbPool, config.logging.database);
        setInitialTransport(transport);
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

  // DEPRECATED: loadState() seeds conversation history from data/state.json for
  // non-DB environments. When a database is configured, initConversationHistory()
  // immediately overwrites this with DB data. Remove loadState/saveState and the
  // data/ directory once all environments use DATABASE_URL.
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

  // Start triage module (per-channel message classification + response)
  await startTriage(client, config, healthMonitor);

  // Start tempban scheduler for automatic unbans (DB required)
  if (dbPool) {
    startTempbanScheduler(client);
  }

  // Load commands and login
  await loadCommands();
  await client.login(token);

  // Start REST API server (non-fatal — bot continues without it)
  try {
    await startServer(client, dbPool);
  } catch (err) {
    error('REST API server failed to start — continuing without API', { error: err.message });
  }
}

startup().catch((err) => {
  error('Startup failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
