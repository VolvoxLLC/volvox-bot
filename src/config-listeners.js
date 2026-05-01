/**
 * Config Change Listeners
 *
 * Registers reactive config-change handlers.
 */

import { info } from './logger.js';
import { reloadBotStatus } from './modules/botStatus.js';
import { onConfigChange } from './modules/config.js';
import { fireEvent } from './modules/webhookNotifier.js';
import { cacheDelPattern } from './utils/cache.js';

/**
 * Register config change listeners for hot-reload.
 *
 * @param {Object} deps
 * @param {import('pg').Pool | null} deps.dbPool - Database pool (null if no DB)
 * @param {Object} deps.config - Live config reference (mutated in-place by setConfigValue)
 */
export function registerConfigListeners({ dbPool: _dbPool, config: _config }) {
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
  onConfigChange('welcome.*', async (_newValue, _oldValue, _path, guildId) => {
    if (guildId && guildId !== 'global') {
      await cacheDelPattern(`discord:guild:${guildId}:*`).catch(() => {});
    }
  });
  onConfigChange('starboard.*', async (_newValue, _oldValue, _path, guildId) => {
    if (guildId && guildId !== 'global') {
      await cacheDelPattern(`discord:guild:${guildId}:*`).catch(() => {});
    }
  });
  // ── Bot status / presence hot-reload ───────────────────────────────
  for (const key of [
    'botStatus',
    'botStatus.enabled',
    'botStatus.status',
    'botStatus.activityType',
    'botStatus.activities',
    'botStatus.rotateIntervalMs',
    'botStatus.rotation',
    'botStatus.rotation.enabled',
    'botStatus.rotation.intervalMinutes',
    'botStatus.rotation.messages',
  ]) {
    onConfigChange(key, (_newValue, _oldValue, _path, guildId) => {
      // Bot presence is global — ignore per-guild overrides here
      if (guildId && guildId !== 'global') return;
      reloadBotStatus();
    });
  }

  onConfigChange('reputation.*', async (_newValue, _oldValue, _path, guildId) => {
    if (guildId && guildId !== 'global') {
      await cacheDelPattern(`leaderboard:${guildId}*`).catch(() => {});
      await cacheDelPattern(`reputation:${guildId}:*`).catch(() => {});
    }
  });

  // ── Webhook notifications for config changes ─────────────────────────
  onConfigChange('*', async (_newValue, _oldValue, path, guildId) => {
    // Skip internal/logging changes and notification webhook updates (avoid recursion)
    if (path.startsWith('logging.') || path.startsWith('notifications.')) return;
    const targetGuildId = guildId && guildId !== 'global' ? guildId : null;
    if (!targetGuildId) return;
    await fireEvent('config.changed', targetGuildId, { path }).catch(() => {});
  });
}

/**
 * No-op shutdown hook retained for backward compatibility with existing startup/shutdown code paths.
 *
 * @returns {Promise<void>} A resolved promise so shutdown code can continue to await this hook.
 */
export function removeLoggingTransport() {
  return Promise.resolve();
}
