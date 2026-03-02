/**
 * Volvox Bot - Volvox Discord Bot
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

// Sentry must be imported before all other modules to instrument them
import './sentry.js';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Collection, Events, GatewayIntentBits, Partials } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import { startServer, stopServer } from './api/server.js';
import {
  registerConfigListeners,
  removeLoggingTransport,
  setInitialTransport,
} from './config-listeners.js';
import { closeDb, getPool, initDb } from './db.js';
import {
  addPostgresTransport,
  addWebSocketTransport,
  debug,
  error,
  info,
  removeWebSocketTransport,
  warn,
} from './logger.js';
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
import { startGithubFeed, stopGithubFeed } from './modules/githubFeed.js';
import { checkMem0Health, markUnavailable } from './modules/memory.js';
import { startTempbanScheduler, stopTempbanScheduler } from './modules/moderation.js';
import { loadOptOuts } from './modules/optout.js';
import { startScheduler, stopScheduler } from './modules/scheduler.js';
import { startTriage, stopTriage } from './modules/triage.js';
import { closeRedisClient as closeRedis, initRedis } from './redis.js';
import { pruneOldLogs } from './transports/postgres.js';
import { stopCacheCleanup } from './utils/cache.js';
import { HealthMonitor } from './utils/health.js';
import { loadCommandsFromDirectory } from './utils/loadCommands.js';
import { getPermissionError, hasPermission } from './utils/permissions.js';
import { registerCommands } from './utils/registerCommands.js';
import { recordRestart, updateUptimeOnShutdown } from './utils/restartTracker.js';
import { seedBuiltinTemplates } from './modules/roleMenuTemplates.js';
import { safeFollowUp, safeReply } from './utils/safeSend.js';

// ES module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// State persistence path
const dataDir = join(__dirname, '..', 'data');
const statePath = join(dataDir, 'state.json');

// Package version (for restart tracking)
let BOT_VERSION = 'unknown';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  BOT_VERSION = pkg.version;
} catch {
  // package.json unreadable — version stays 'unknown'
}

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
// See: https://github.com/BillChirico/volvox-bot/issues/61
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction],
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
    info('Command executed', {
      command: commandName,
      user: interaction.user.tag,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });
  } catch (err) {
    error('Command error', {
      command: commandName,
      error: err.message,
      stack: err.stack,
      source: 'slash_command',
    });

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

  // 1. Stop triage, conversation cleanup timer, tempban scheduler, announcement scheduler, and GitHub feed
  stopTriage();
  stopConversationCleanup();
  stopTempbanScheduler();
  stopScheduler();
  stopGithubFeed();

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
  } catch (err) {
    warn('Failed to record uptime on shutdown', { error: err.message, module: 'shutdown' });
  }

  // 4. Close database pool
  info('Closing database connection');
  try {
    await closeDb();
  } catch (err) {
    error('Failed to close database pool', { error: err.message });
  }

  // 4.5. Close Redis connection (no-op if Redis was never configured)
  try {
    stopCacheCleanup();
    await closeRedis();
  } catch (err) {
    error('Failed to close Redis connection', { error: err.message });
  }

  // 5. Flush Sentry events before exit (no-op if Sentry disabled)
  await import('./sentry.js').then(({ Sentry }) => Sentry.flush(2000)).catch(() => {});

  // 6. Destroy Discord client
  info('Disconnecting from Discord');
  client.destroy();

  // 7. Log clean exit
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
    source: 'discord_client',
  });
});

client.on('shardDisconnect', (event, shardId) => {
  if (event.code !== 1000) {
    warn('Shard disconnected unexpectedly', { shardId, code: event.code, source: 'discord_shard' });
  }
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

    // Initialize Redis (gracefully degrades if REDIS_URL not set)
    initRedis();
    info('Database initialized');

    // Record this startup in the restart history table
    await recordRestart(dbPool, 'startup', BOT_VERSION);

    // Seed built-in role menu templates (idempotent)
    await seedBuiltinTemplates().catch((err) =>
      warn('Failed to seed built-in role menu templates', { error: err.message }),
    );
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
    startScheduler(client);
    startGithubFeed(client);
  }

  // Load commands and login
  await loadCommands();
  await client.login(token);

  // Set Sentry context now that we know the bot identity (no-op if disabled)
  import('./sentry.js')
    .then(({ Sentry, sentryEnabled }) => {
      if (sentryEnabled) {
        Sentry.setTag('bot.username', client.user?.tag || 'unknown');
        Sentry.setTag('bot.version', BOT_VERSION);
        info('Sentry error monitoring enabled', {
          environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
        });
      }
    })
    .catch(() => {});

  // Start REST API server with WebSocket log streaming (non-fatal — bot continues without it)
  {
    let wsTransport = null;
    try {
      wsTransport = addWebSocketTransport();
      await startServer(client, dbPool, { wsTransport });
    } catch (err) {
      // Clean up orphaned transport if startServer failed after it was created
      if (wsTransport) {
        removeWebSocketTransport(wsTransport);
      }
      error('REST API server failed to start — continuing without API', { error: err.message });
    }
  }
}

startup().catch((err) => {
  error('Startup failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
