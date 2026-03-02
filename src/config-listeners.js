/**
 * Config Change Listeners
 *
 * Registers reactive config-change handlers that maintain the PostgreSQL
 * logging transport. Extracted from index.js to reduce startup() size.
 *
 * Transport operations (enable/disable/recreate) are serialized via a
 * promise-chain mutex so concurrent config updates don't interleave.
 */

import { addPostgresTransport, error, info, removePostgresTransport } from './logger.js';
import { onConfigChange } from './modules/config.js';
import { cacheDelPattern } from './utils/cache.js';

/** @type {import('winston').transport | null} */
let pgTransport = null;

/** Promise-chain mutex for serializing transport operations */
let transportLock = Promise.resolve();

/**
 * Register config change listeners for hot-reload.
 *
 * @param {Object} deps
 * @param {import('pg').Pool | null} deps.dbPool - Database pool (null if no DB)
 * @param {Object} deps.config - Live config reference (mutated in-place by setConfigValue)
 */
export function registerConfigListeners({ dbPool, config }) {
  // ── Logging transport: stateful reactive wiring ──────────────────────
  //
  // All logging.database.* listeners funnel through updateLoggingTransport,
  // serialized by transportLock. This eliminates races between enable/disable
  // and parameter changes: only one operation runs at a time, always reading
  // the latest config state.

  async function updateLoggingTransport(changePath) {
    if (!dbPool) return;
    const dbConfig = config.logging?.database;
    const enabled = dbConfig?.enabled;

    if (enabled && !pgTransport) {
      pgTransport = addPostgresTransport(dbPool, dbConfig);
      info('PostgreSQL logging transport enabled via config change', { path: changePath });
    } else if (enabled && pgTransport) {
      const oldTransport = pgTransport;
      pgTransport = null;
      await removePostgresTransport(oldTransport);
      if (!config.logging?.database?.enabled) return;
      pgTransport = addPostgresTransport(dbPool, dbConfig);
      info('PostgreSQL logging transport recreated after config change', { path: changePath });
    } else if (!enabled && pgTransport) {
      await removePostgresTransport(pgTransport);
      pgTransport = null;
      info('PostgreSQL logging transport disabled via config change', { path: changePath });
    }
  }

  for (const key of [
    'logging.database',
    'logging.database.enabled',
    'logging.database.batchSize',
    'logging.database.flushIntervalMs',
    'logging.database.minLevel',
  ]) {
    onConfigChange(key, async (_newValue, _oldValue, path, guildId) => {
      if (guildId && guildId !== 'global') return;
      transportLock = transportLock
        .then(() => updateLoggingTransport(path))
        .catch((err) =>
          error('Failed to update PostgreSQL logging transport', { path, error: err.message }),
        );
      await transportLock;
    });
  }

  // ── Observability-only listeners ─────────────────────────────────────
  // AI, spam, and moderation modules call getConfig(guildId) per-request,
  // so changes take effect automatically. These listeners log for visibility.

  onConfigChange('ai.*', (newValue, _oldValue, path, guildId) => {
    info('AI config updated', { path, newValue, guildId });
  });
  onConfigChange('spam.*', (newValue, _oldValue, path, guildId) => {
    info('Spam config updated', { path, newValue, guildId });
  });
  onConfigChange('moderation.*', (newValue, _oldValue, path, guildId) => {
    info('Moderation config updated', { path, newValue, guildId });
  });

  // ── Cache invalidation on config changes ────────────────────────────
  // When channel-related config changes, invalidate Discord API caches
  // so the bot picks up the new channel references immediately.
  onConfigChange('welcome.*', async (_newValue, _oldValue, path, guildId) => {
    if (guildId && guildId !== 'global') {
      await cacheDelPattern(`discord:guild:${guildId}:*`).catch(() => {});
    }
  });
  onConfigChange('starboard.*', async (_newValue, _oldValue, path, guildId) => {
    if (guildId && guildId !== 'global') {
      await cacheDelPattern(`discord:guild:${guildId}:*`).catch(() => {});
    }
  });
  onConfigChange('reputation.*', async (_newValue, _oldValue, path, guildId) => {
    if (guildId && guildId !== 'global') {
      await cacheDelPattern(`leaderboard:${guildId}*`).catch(() => {});
      await cacheDelPattern(`reputation:${guildId}:*`).catch(() => {});
    }
  });
}

/**
 * Remove the PostgreSQL logging transport during shutdown.
 * Drains the remaining log buffer before resolving.
 */
export async function removeLoggingTransport() {
  transportLock = transportLock.then(async () => {
    if (pgTransport) {
      await removePostgresTransport(pgTransport);
      pgTransport = null;
    }
  });
  await transportLock;
}

/**
 * Set the initial PostgreSQL transport (called during startup when
 * logging.database.enabled is already true at boot).
 * @param {import('winston').transport} transport
 */
export function setInitialTransport(transport) {
  pgTransport = transport;
}
