/**
 * Voice Channel Activity Tracking Module
 *
 * Tracks join/leave/move events, calculates time spent in voice,
 * and provides leaderboard data for most active voice users.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/135
 */

import { getPool } from '../db.js';
import { error as logError, info } from '../logger.js';
import { getConfig } from './config.js';

/**
 * In-memory map of active voice sessions.
 * Key: `${guildId}:${userId}` → { channelId, joinedAt (Date) }
 *
 * This is the source of truth for open sessions. Periodically flushed
 * to DB so data is not lost on crash.
 *
 * @type {Map<string, { channelId: string; joinedAt: Date }>}
 */
const activeSessions = new Map();

/** Periodic flush interval handle */
let flushInterval = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the session key from guild and user IDs.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {string}
 */
function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

/**
 * Resolve voice config for a guild with defaults.
 *
 * @param {string} guildId
 * @returns {object}
 */
function getVoiceConfig(guildId) {
  const cfg = getConfig(guildId);
  return {
    enabled: false,
    xpPerMinute: 2,
    dailyXpCap: 120,
    logChannel: null,
    ...cfg?.voice,
  };
}

// ─── Session management ───────────────────────────────────────────────────────

/**
 * Open a new voice session for a user joining a channel.
 * Inserts a pending row (left_at = NULL) into voice_sessions.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {string} channelId
 * @returns {Promise<void>}
 */
export async function openSession(guildId, userId, channelId) {
  const key = sessionKey(guildId, userId);

  // Close any existing open session first (shouldn't happen, but be safe)
  if (activeSessions.has(key)) {
    await closeSession(guildId, userId);
  }

  const joinedAt = new Date();
  activeSessions.set(key, { channelId, joinedAt });

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO voice_sessions (guild_id, user_id, channel_id, joined_at)
       VALUES ($1, $2, $3, $4)`,
      [guildId, userId, channelId, joinedAt.toISOString()],
    );
  } catch (err) {
    logError('Failed to insert voice session', { guildId, userId, channelId, error: err.message });
    throw err;
  }
}

/**
 * Close an open voice session for a user leaving a channel.
 * Updates the row with left_at and duration_seconds.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<number|null>} Duration in seconds, or null if no open session found.
 */
export async function closeSession(guildId, userId) {
  const key = sessionKey(guildId, userId);
  const session = activeSessions.get(key);
  if (!session) return null;

  activeSessions.delete(key);

  const leftAt = new Date();
  const durationSeconds = Math.floor((leftAt.getTime() - session.joinedAt.getTime()) / 1000);

  try {
    const pool = getPool();
    await pool.query(
      `UPDATE voice_sessions
         SET left_at = $1, duration_seconds = $2
       WHERE guild_id = $3
         AND user_id  = $4
         AND channel_id = $5
         AND left_at IS NULL
       ORDER BY joined_at DESC
       LIMIT 1`,
      [leftAt.toISOString(), durationSeconds, guildId, userId, session.channelId],
    );
  } catch (err) {
    logError('Failed to close voice session', { guildId, userId, error: err.message });
    throw err;
  }

  return durationSeconds;
}

// ─── voiceStateUpdate handler ─────────────────────────────────────────────────

/**
 * Handle a Discord voiceStateUpdate event.
 * Covers join, leave, move, mute, deafen, and stream events.
 * Only join/leave/move result in session changes.
 *
 * @param {import('discord.js').VoiceState} oldState
 * @param {import('discord.js').VoiceState} newState
 * @returns {Promise<void>}
 */
export async function handleVoiceStateUpdate(oldState, newState) {
  const guildId = newState.guild?.id ?? oldState.guild?.id;
  const userId = newState.member?.user?.id ?? oldState.member?.user?.id;

  if (!guildId || !userId) return;

  // Skip bots
  const isBot = newState.member?.user?.bot ?? oldState.member?.user?.bot;
  if (isBot) return;

  const cfg = getVoiceConfig(guildId);
  if (!cfg.enabled) return;

  const oldChannel = oldState.channelId;
  const newChannel = newState.channelId;

  if (!oldChannel && newChannel) {
    // User joined a voice channel
    await openSession(guildId, userId, newChannel).catch((err) =>
      logError('openSession failed', { guildId, userId, error: err.message }),
    );
    info('Voice join', { guildId, userId, channelId: newChannel });
  } else if (oldChannel && !newChannel) {
    // User left all voice channels
    await closeSession(guildId, userId).catch((err) =>
      logError('closeSession failed', { guildId, userId, error: err.message }),
    );
    info('Voice leave', { guildId, userId, channelId: oldChannel });
  } else if (oldChannel && newChannel && oldChannel !== newChannel) {
    // User moved between channels — close old session, open new
    await closeSession(guildId, userId).catch((err) =>
      logError('closeSession(move) failed', { guildId, userId, error: err.message }),
    );
    await openSession(guildId, userId, newChannel).catch((err) =>
      logError('openSession(move) failed', { guildId, userId, error: err.message }),
    );
    info('Voice move', { guildId, userId, from: oldChannel, to: newChannel });
  }
  // Mute/deafen/stream changes don't affect session tracking
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

/**
 * Fetch voice time leaderboard for a guild.
 *
 * @param {string} guildId
 * @param {object} [options]
 * @param {number} [options.limit=10] - Max rows to return
 * @param {'week'|'month'|'all'} [options.period='week'] - Time window
 * @returns {Promise<Array<{ user_id: string; total_seconds: number; session_count: number }>>}
 */
export async function getVoiceLeaderboard(guildId, { limit = 10, period = 'week' } = {}) {
  const pool = getPool();

  const windowSql =
    period === 'week'
      ? `AND joined_at >= NOW() - INTERVAL '7 days'`
      : period === 'month'
        ? `AND joined_at >= NOW() - INTERVAL '30 days'`
        : '';

  const { rows } = await pool.query(
    `SELECT user_id,
            SUM(COALESCE(duration_seconds, 0)) AS total_seconds,
            COUNT(*)                            AS session_count
       FROM voice_sessions
      WHERE guild_id = $1
        AND left_at IS NOT NULL
        ${windowSql}
      GROUP BY user_id
      ORDER BY total_seconds DESC
      LIMIT $2`,
    [guildId, limit],
  );

  return rows.map((r) => ({
    user_id: r.user_id,
    total_seconds: Number(r.total_seconds),
    session_count: Number(r.session_count),
  }));
}

// ─── User stats ───────────────────────────────────────────────────────────────

/**
 * Fetch total voice time stats for a specific user.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<{ total_seconds: number; session_count: number; favorite_channel: string|null }>}
 */
export async function getUserVoiceStats(guildId, userId) {
  const pool = getPool();

  const [totals, favChannel] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds,
              COUNT(*) AS session_count
         FROM voice_sessions
        WHERE guild_id = $1
          AND user_id  = $2
          AND left_at IS NOT NULL`,
      [guildId, userId],
    ),
    pool.query(
      `SELECT channel_id, SUM(duration_seconds) AS total
         FROM voice_sessions
        WHERE guild_id = $1
          AND user_id  = $2
          AND left_at IS NOT NULL
        GROUP BY channel_id
        ORDER BY total DESC
        LIMIT 1`,
      [guildId, userId],
    ),
  ]);

  return {
    total_seconds: Number(totals.rows[0]?.total_seconds ?? 0),
    session_count: Number(totals.rows[0]?.session_count ?? 0),
    favorite_channel: favChannel.rows[0]?.channel_id ?? null,
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Export raw voice session data for a guild.
 * Returns sessions ordered by most recent first.
 *
 * @param {string} guildId
 * @param {object} [options]
 * @param {'week'|'month'|'all'} [options.period='all'] - Time window
 * @param {number} [options.limit=1000] - Max rows
 * @returns {Promise<Array<object>>}
 */
export async function exportVoiceSessions(guildId, { period = 'all', limit = 1000 } = {}) {
  const pool = getPool();

  const windowSql =
    period === 'week'
      ? `AND joined_at >= NOW() - INTERVAL '7 days'`
      : period === 'month'
        ? `AND joined_at >= NOW() - INTERVAL '30 days'`
        : '';

  const { rows } = await pool.query(
    `SELECT id, user_id, channel_id, joined_at, left_at, duration_seconds
       FROM voice_sessions
      WHERE guild_id = $1
        AND left_at IS NOT NULL
        ${windowSql}
      ORDER BY joined_at DESC
      LIMIT $2`,
    [guildId, limit],
  );

  return rows;
}

// ─── Periodic flush ───────────────────────────────────────────────────────────

/**
 * Flush all in-memory open sessions to DB without closing them.
 * This is a heartbeat so we don't lose data if the process crashes.
 *
 * @returns {Promise<void>}
 */
export async function flushActiveSessions() {
  if (activeSessions.size === 0) return;

  const pool = getPool();
  const now = new Date();

  for (const [key, session] of activeSessions) {
    const [guildId, userId] = key.split(':');
    const partialDuration = Math.floor((now.getTime() - session.joinedAt.getTime()) / 1000);

    // Update duration_seconds without closing (left_at stays NULL)
    await pool
      .query(
        `UPDATE voice_sessions
           SET duration_seconds = $1
         WHERE guild_id = $2
           AND user_id  = $3
           AND channel_id = $4
           AND left_at IS NULL`,
        [partialDuration, guildId, userId, session.channelId],
      )
      .catch((err) =>
        logError('Failed to flush voice session', { guildId, userId, error: err.message }),
      );
  }
}

/**
 * Start periodic flush of in-memory sessions (every 5 minutes).
 *
 * @returns {void}
 */
export function startVoiceFlush() {
  if (flushInterval) return;
  flushInterval = setInterval(() => {
    flushActiveSessions().catch((err) =>
      logError('Voice session flush error', { error: err.message }),
    );
  }, 5 * 60 * 1000);
  flushInterval.unref();
}

/**
 * Stop periodic flush.
 *
 * @returns {void}
 */
export function stopVoiceFlush() {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
}

/**
 * Get current active session count (for testing/diagnostics).
 *
 * @returns {number}
 */
export function getActiveSessionCount() {
  return activeSessions.size;
}

/**
 * Clear all in-memory sessions (for testing only).
 *
 * @returns {void}
 */
export function clearActiveSessions() {
  activeSessions.clear();
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Format a duration in seconds to a human-readable string.
 * e.g. 3661 → "1h 1m"
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
