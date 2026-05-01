/**
 * Volvox.Bot - Volvox Discord Bot
 * Main entry point - orchestrates modules
 *
 * Features:
 * - AI chat powered by the configured provider (see src/data/providers.json)
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
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import { startServer, stopServer, updateServerDbPool } from './api/server.js';
import {
  registerConfigListeners,
  removeLoggingTransport,
  setInitialTransport,
} from './config-listeners.js';
import { closeDb, getPool, initDb } from './db.js';
import {
  addPostgresTransport,
  addWebSocketTransport,
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
import { startBotStatus, stopBotStatus } from './modules/botStatus.js';
import { loadConfig } from './modules/config.js';
import { startEngagementFlushInterval, stopEngagementFlushInterval } from './modules/engagement.js';

import { registerEventHandlers } from './modules/events.js';
import { startGithubFeed, stopGithubFeed } from './modules/githubFeed.js';
import { checkMem0Health, markUnavailable } from './modules/memory.js';
import { startTempbanScheduler, stopTempbanScheduler } from './modules/moderation.js';
import { loadOptOuts } from './modules/optout.js';
import { seedBuiltinTemplates } from './modules/roleMenuTemplates.js';
import { startScheduler, stopScheduler } from './modules/scheduler.js';
import { startTriage, stopTriage } from './modules/triage.js';
import {
  startWarningExpiryScheduler,
  stopWarningExpiryScheduler,
} from './modules/warningEngine.js';
import { closeRedisClient as closeRedis, initRedis } from './redis.js';
import { pruneOldLogs } from './transports/postgres.js';
import { preloadSDK } from './utils/aiClient.js';
import { stopCacheCleanup } from './utils/cache.js';
import { HealthMonitor } from './utils/health.js';
import { loadCommandsFromDirectory } from './utils/loadCommands.js';
import { recordRestart, updateUptimeOnShutdown } from './utils/restartTracker.js';

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
// See: https://github.com/VolvoxLLC/volvox-bot/issues/61
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences,
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

// Event handlers (including slash commands, errors, and shard disconnect)
// are registered via registerEventHandlers() after config loads — see startup below.

/**
 * Perform an orderly shutdown of the bot: stop background services, persist runtime state, close external resources, and exit the process.
 * @param {string} signal - The OS signal that triggered shutdown (e.g., "SIGINT" or "SIGTERM").
 */
async function gracefulShutdown(signal) {
  info('Shutdown initiated', { signal });

  // 1. Stop triage, conversation cleanup timer, tempban scheduler, announcement scheduler, and GitHub feed
  stopTriage();
  stopConversationCleanup();
  stopTempbanScheduler();
  stopWarningExpiryScheduler();
  stopScheduler();
  stopGithubFeed();
  stopBotStatus();

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

  // 3.5. Flush any buffered engagement writes (messages_sent / reactions) before closing DB
  try {
    await stopEngagementFlushInterval();
  } catch (err) {
    warn('Failed to flush engagement buffer on shutdown', { error: err.message });
  }

  // 3.6. Record uptime before closing the pool
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

  // 5. Flush telemetry events before exit (no-op if disabled)
  await import('./amplitude.js').then(({ flushAmplitude }) => flushAmplitude()).catch(() => {});
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

// Start bot
const token = process.env.DISCORD_TOKEN;
if (!token) {
  error('DISCORD_TOKEN not set');
  process.exit(1);
}

function canContinueWithoutDatabase() {
  const environmentName = process.env.RAILWAY_ENVIRONMENT_NAME ?? '';
  const isRailwayPullRequestEnvironment = /^volvox-bot-pr-\d+$/i.test(environmentName);
  return process.env.ALLOW_DATABASE_STARTUP_FAILURE === 'true' || isRailwayPullRequestEnvironment;
}

/**
 * Perform full application startup: initialize the database and optional PostgreSQL logging, load configuration and conversation history, start background services (conversation cleanup, memory checks, triage, tempban scheduler), register event handlers, load slash commands, and log the Discord client in.
 */
async function startup() {
  // Pre-warm AI SDK in background (non-blocking) — avoids 6s import delay on first AI request
  preloadSDK();

  // Start REST API server immediately so Railway health checks can pass while
  // heavier startup work (DB migrations, config loading, Discord login) runs.
  {
    let wsTransport = null;
    try {
      wsTransport = addWebSocketTransport();
      await startServer(client, null, { wsTransport });
    } catch (err) {
      // Clean up orphaned transport if startServer failed after it was created
      if (wsTransport) {
        removeWebSocketTransport(wsTransport);
      }
      error('REST API server failed to start — continuing without API', { error: err.message });
    }
  }

  // Initialize database
  let dbPool = null;
  if (process.env.DATABASE_URL) {
    try {
      dbPool = await initDb();

      updateServerDbPool(dbPool);

      // Initialize Redis (gracefully degrades if REDIS_URL not set)
      initRedis();
      info('Database initialized');

      // Record this startup in the restart history table
      await recordRestart(dbPool, 'startup', BOT_VERSION);

      // Seed built-in role menu templates (idempotent)
      await seedBuiltinTemplates().catch((err) =>
        warn('Failed to seed built-in role menu templates', { error: err.message }),
      );
    } catch (err) {
      if (!canContinueWithoutDatabase()) {
        throw err;
      }

      warn(
        'Database initialization failed — continuing without persistence for preview deployment',
        {
          error: err.message,
          railwayEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
        },
      );
    }
  } else {
    warn('DATABASE_URL not set — using config.json only (no persistence)');
  }

  // Load config (from DB if available, else config.json)
  config = await loadConfig();
  info('Configuration loaded', { sections: Object.keys(config) });

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
    startWarningExpiryScheduler();
    startScheduler(client);
    startGithubFeed(client);
    startEngagementFlushInterval();
  }

  // Load commands and login
  await loadCommands();
  await client.login(token);

  // Start configurable bot presence rotation after login so client.user is available
  startBotStatus(client);

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
}

startup().catch((err) => {
  error('Startup failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
