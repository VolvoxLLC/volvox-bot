/**
 * Quiet Mode Module
 *
 * Allows moderators to temporarily silence the bot in a specific channel
 * by mentioning it with a command like `@Bot quiet for 30 minutes`.
 *
 * Storage: Redis with TTL (falls back to an in-memory Map when Redis is unavailable).
 * Scope: Per-channel, per-guild — other channels are unaffected.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/173
 */

import { error as logError, info } from '../logger.js';
import { getRedis } from '../redis.js';
import { safeReply } from '../utils/safeSend.js';
import { isAdmin, isModerator } from '../utils/permissions.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Keywords that activate quiet mode */
const QUIET_KEYWORDS = new Set(['quiet', 'shush', 'silence', 'stop', 'hush', 'mute']);

/** Keywords that deactivate quiet mode */
const UNQUIET_KEYWORDS = new Set(['unquiet', 'resume', 'unshush', 'unmute', 'wake', 'start']);

/** Keywords that report quiet mode status */
const STATUS_KEYWORDS = new Set(['status', 'time', 'remaining']);

/** Redis key prefix */
const KEY_PREFIX = 'quiet:';

/** Default quiet duration: 30 minutes in seconds */
const DEFAULT_DURATION_SECONDS = 30 * 60;

/** Maximum quiet duration: 24 hours in seconds */
const MAX_DURATION_SECONDS = 24 * 60 * 60;

/** Minimum quiet duration: 1 minute in seconds */
const MIN_DURATION_SECONDS = 60;

// ── In-memory fallback ────────────────────────────────────────────────────────

/**
 * In-memory quiet state storage for when Redis is unavailable.
 * Key: `${guildId}:${channelId}` -> { until: number, by: string }
 * @type {Map<string, { until: number, by: string }>}
 */
export const memoryStore = new Map();

// ── Storage helpers ───────────────────────────────────────────────────────────

/**
 * Build the Redis key for a guild+channel combo.
 *
 * @param {string} guildId
 * @param {string} channelId
 * @returns {string}
 */
function buildKey(guildId, channelId) {
  return `${KEY_PREFIX}${guildId}:${channelId}`;
}

/**
 * Persist a quiet record. Uses Redis when available, falls back to memory.
 *
 * @param {string} guildId
 * @param {string} channelId
 * @param {number} untilMs - Unix timestamp in ms when quiet mode expires
 * @param {string} byUserId - User ID who activated quiet mode
 * @returns {Promise<void>}
 */
export async function setQuiet(guildId, channelId, untilMs, byUserId) {
  const redis = getRedis();
  const key = buildKey(guildId, channelId);
  const ttlSeconds = Math.ceil((untilMs - Date.now()) / 1000);

  if (redis) {
    try {
      await redis.set(key, JSON.stringify({ until: untilMs, by: byUserId }), 'EX', ttlSeconds);
      return;
    } catch (err) {
      logError('quietMode: Redis set failed, falling back to memory', { error: err?.message });
    }
  }

  memoryStore.set(`${guildId}:${channelId}`, { until: untilMs, by: byUserId });
}

/**
 * Remove a quiet record (unquiet).
 *
 * @param {string} guildId
 * @param {string} channelId
 * @returns {Promise<void>}
 */
export async function clearQuiet(guildId, channelId) {
  const redis = getRedis();
  const key = buildKey(guildId, channelId);

  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch (err) {
      logError('quietMode: Redis del failed, falling back to memory', { error: err?.message });
    }
  }

  memoryStore.delete(`${guildId}:${channelId}`);
}

/**
 * Retrieve the quiet record for a channel, or null if not in quiet mode.
 * Expired in-memory entries are pruned automatically.
 *
 * @param {string} guildId
 * @param {string} channelId
 * @returns {Promise<{ until: number, by: string } | null>}
 */
export async function getQuiet(guildId, channelId) {
  const redis = getRedis();
  const key = buildKey(guildId, channelId);

  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      logError('quietMode: Redis get failed, falling back to memory', { error: err?.message });
    }
  }

  const record = memoryStore.get(`${guildId}:${channelId}`);
  if (!record) return null;

  // Prune expired entries
  if (Date.now() >= record.until) {
    memoryStore.delete(`${guildId}:${channelId}`);
    return null;
  }

  return record;
}

// ── Duration parsing ──────────────────────────────────────────────────────────

/** Unit name variants -> multiplier in seconds */
const UNIT_MAP = {
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  d: 86400,
  day: 86400,
  days: 86400,
};

/**
 * Parse a natural-language duration from message content.
 * Handles: "30m", "2h", "1d", "30 minutes", "for 1 hour", "2 hrs".
 *
 * @param {string} content - Message content (will be lowercased internally)
 * @param {number} [defaultSeconds] - Fallback when nothing matches
 * @returns {number} Duration in seconds, clamped to [MIN_DURATION_SECONDS, MAX_DURATION_SECONDS]
 */
export function parseDurationFromContent(content, defaultSeconds = DEFAULT_DURATION_SECONDS) {
  const text = content.toLowerCase();

  // "30m" / "2h" / "1d" (no space between number and single-char unit)
  const shortMatch = text.match(/\b(\d+)\s*([smhd])\b/);
  if (shortMatch) {
    const value = parseInt(shortMatch[1], 10);
    const unit = UNIT_MAP[shortMatch[2]];
    if (unit && value > 0) {
      return Math.min(Math.max(value * unit, MIN_DURATION_SECONDS), MAX_DURATION_SECONDS);
    }
  }

  // "30 minutes" / "for 1 hour" / "2 hrs"
  const longMatch = text.match(
    /\b(\d+)\s+(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)\b/,
  );
  if (longMatch) {
    const value = parseInt(longMatch[1], 10);
    const unit = UNIT_MAP[longMatch[2]];
    if (unit && value > 0) {
      return Math.min(Math.max(value * unit, MIN_DURATION_SECONDS), MAX_DURATION_SECONDS);
    }
  }

  return defaultSeconds;
}

// ── Permission helpers ────────────────────────────────────────────────────────

/**
 * Determine whether a guild member is allowed to toggle quiet mode.
 *
 * Permission levels (from config.quietMode.allowedRoles):
 * - `["any"]`         - anyone in the server
 * - `["moderator"]`   - moderator or higher (default)
 * - `["admin"]`       - admin or higher
 * - `["<roleId>"]`    - members with any of those specific role IDs
 *
 * @param {import('discord.js').GuildMember} member
 * @param {Object} config - Per-guild merged config
 * @returns {boolean}
 */
export function hasQuietPermission(member, config) {
  const allowedRoles = config?.quietMode?.allowedRoles ?? ['moderator'];

  if (allowedRoles.includes('any')) return true;
  if (allowedRoles.includes('admin')) return isAdmin(member, config);
  if (allowedRoles.includes('moderator')) return isModerator(member, config);

  // Specific role IDs
  return allowedRoles.some((roleId) => member.roles.cache.has(roleId));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether the bot is currently in quiet mode for a specific channel.
 *
 * @param {string} guildId
 * @param {string} channelId
 * @returns {Promise<boolean>}
 */
export async function isQuietMode(guildId, channelId) {
  const record = await getQuiet(guildId, channelId);
  return record !== null;
}

/**
 * Handle a potential quiet mode command in a bot mention message.
 *
 * Call only when the bot is mentioned. Returns `true` if the message was a
 * quiet mode command (caller should stop further processing).
 *
 * @param {import('discord.js').Message} message - Discord message
 * @param {Object} config - Per-guild merged config
 * @returns {Promise<boolean>} Whether this was a quiet mode command
 */
export async function handleQuietCommand(message, config) {
  if (!config?.quietMode?.enabled) return false;

  const { guild, channel, author, member, content } = message;
  if (!guild || !member) return false;

  // Strip bot mention(s) to isolate the command body
  const cleanContent = content
    .replace(/<@!?\d+>/g, '')
    .trim()
    .toLowerCase();

  const firstWord = cleanContent.split(/\s+/)[0] ?? '';

  // ── Status ─────────────────────────────────────────────────────────────────
  if (STATUS_KEYWORDS.has(firstWord)) {
    const record = await getQuiet(guild.id, channel.id);
    if (!record) {
      await safeReply(message, { content: 'Quiet mode is **not** active in this channel.' });
    } else {
      const remaining = Math.max(0, Math.ceil((record.until - Date.now()) / 1000));
      const mins = Math.ceil(remaining / 60);
      await safeReply(message, {
        content: `Quiet mode is active — expires in **${mins} minute${mins !== 1 ? 's' : ''}**.`,
      });
    }
    return true;
  }

  // ── Unquiet ────────────────────────────────────────────────────────────────
  if (UNQUIET_KEYWORDS.has(firstWord)) {
    if (!hasQuietPermission(member, config)) {
      await safeReply(message, {
        content: "You don't have permission to change quiet mode.",
      });
      return true;
    }

    const record = await getQuiet(guild.id, channel.id);
    if (!record) {
      await safeReply(message, { content: 'Quiet mode is already off.' });
    } else {
      await clearQuiet(guild.id, channel.id);
      info('quietMode: deactivated', { guildId: guild.id, channelId: channel.id, by: author.id });
      await safeReply(message, { content: "Quiet mode lifted — I'm back!" });
    }
    return true;
  }

  // ── Activate ───────────────────────────────────────────────────────────────
  if (QUIET_KEYWORDS.has(firstWord)) {
    if (!hasQuietPermission(member, config)) {
      await safeReply(message, {
        content: "You don't have permission to enable quiet mode.",
      });
      return true;
    }

    const quietConfig = config.quietMode;
    const defaultSecs = (quietConfig?.defaultDurationMinutes ?? 30) * 60;
    const maxSecs = (quietConfig?.maxDurationMinutes ?? 1440) * 60;

    const durationSecs = Math.min(parseDurationFromContent(cleanContent, defaultSecs), maxSecs);
    const untilMs = Date.now() + durationSecs * 1000;

    await setQuiet(guild.id, channel.id, untilMs, author.id);

    const mins = Math.ceil(durationSecs / 60);
    info('quietMode: activated', {
      guildId: guild.id,
      channelId: channel.id,
      by: author.id,
      durationSecs,
    });
    await safeReply(message, {
      content: `Going quiet for **${mins} minute${mins !== 1 ? 's' : ''}**. Use \`@bot unquiet\` to resume early.`,
    });
    return true;
  }

  return false;
}

/**
 * Clear all in-memory quiet mode state (for testing / graceful shutdown).
 * Does NOT clear Redis entries — they expire naturally via TTL.
 */
export function _clearMemoryStore() {
  memoryStore.clear();
}
