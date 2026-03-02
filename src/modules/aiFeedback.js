/**
 * AI Feedback Module
 * Stores and retrieves 👍/👎 user feedback on AI-generated Discord messages.
 * Gated behind ai.feedback.enabled per guild config (opt-in).
 */

import { info, error as logError, warn } from '../logger.js';

/** Emoji constants for feedback reactions */
export const FEEDBACK_EMOJI = {
  positive: '👍',
  negative: '👎',
};

/** Set of Discord message IDs known to be AI-generated, for reaction filtering */
const aiMessageIds = new Set();

/** Maximum tracked AI message IDs in memory (LRU-lite: evict oldest when full) */
const AI_MESSAGE_ID_LIMIT = 2000;

/**
 * Register a Discord message ID as an AI-generated message so reaction
 * handlers can filter feedback reactions appropriately.
 * @param {string} messageId - Discord message ID
 */
export function registerAiMessage(messageId) {
  // If already tracked, refresh its recency (LRU behavior)
  if (aiMessageIds.has(messageId)) {
    aiMessageIds.delete(messageId);
    aiMessageIds.add(messageId);
    return;
  }

  // Evict oldest entry when at capacity
  if (aiMessageIds.size >= AI_MESSAGE_ID_LIMIT) {
    const first = aiMessageIds.values().next().value;
    aiMessageIds.delete(first);
  }
  aiMessageIds.add(messageId);
}

/**
 * Check if a Discord message ID was registered as an AI message.
 * @param {string} messageId - Discord message ID
 * @returns {boolean}
 */
export function isAiMessage(messageId) {
  return aiMessageIds.has(messageId);
}

/**
 * Clear the in-memory AI message registry (for testing / shutdown).
 */
export function clearAiMessages() {
  aiMessageIds.clear();
}

// ── Pool injection ────────────────────────────────────────────────────

/** @type {Function|null} */
let _getPoolFn = null;

/**
 * Set a pool getter function (for dependency injection / testing).
 * @param {Function} fn
 */
export function _setPoolGetter(fn) {
  _getPoolFn = fn;
}

/** @type {import('pg').Pool|null} */
let _poolRef = null;

/**
 * Set the database pool reference.
 * @param {import('pg').Pool|null} pool
 */
export function setPool(pool) {
  _poolRef = pool;
}

function getPool() {
  if (_getPoolFn) return _getPoolFn();
  return _poolRef;
}

// ── Core operations ───────────────────────────────────────────────────

/**
 * Record user feedback for an AI message.
 * Upserts: if the user already reacted, the feedback_type is updated.
 * @param {Object} opts
 * @param {string} opts.messageId - Discord message ID
 * @param {string} opts.channelId - Discord channel ID
 * @param {string} opts.guildId - Discord guild ID
 * @param {string} opts.userId - Discord user ID
 * @param {'positive'|'negative'} opts.feedbackType
 * @returns {Promise<void>}
 */
export async function recordFeedback({ messageId, channelId, guildId, userId, feedbackType }) {
  const pool = getPool();
  if (!pool) {
    warn('No DB pool — cannot record AI feedback', { messageId, userId, feedbackType });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO ai_feedback (message_id, channel_id, guild_id, user_id, feedback_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (message_id, user_id)
       DO UPDATE SET feedback_type = EXCLUDED.feedback_type, created_at = NOW()`,
      [messageId, channelId, guildId, userId, feedbackType],
    );

    info('AI feedback recorded', { messageId, userId, feedbackType, guildId });
  } catch (err) {
    logError('Failed to record AI feedback', {
      messageId,
      userId,
      feedbackType,
      error: err.message,
    });
  }
}

/**
 * Delete user feedback for an AI message (when reaction is removed).
 * @param {Object} opts
 * @param {string} opts.messageId - Discord message ID
 * @param {string} opts.userId - Discord user ID
 * @returns {Promise<void>}
 */
export async function deleteFeedback({ messageId, userId }) {
  const pool = getPool();
  if (!pool) {
    warn('No DB pool — cannot delete AI feedback', { messageId, userId });
    return;
  }

  try {
    await pool.query(
      `DELETE FROM ai_feedback WHERE message_id = $1 AND user_id = $2`,
      [messageId, userId],
    );

    info('AI feedback deleted', { messageId, userId });
  } catch (err) {
    logError('Failed to delete AI feedback', {
      messageId,
      userId,
      error: err.message,
    });
  }
}

/**
 * Get aggregate feedback stats for a guild.
 * @param {string} guildId
 * @returns {Promise<{positive: number, negative: number, total: number, ratio: number|null}>}
 */
export async function getFeedbackStats(guildId) {
  const pool = getPool();
  if (!pool) return { positive: 0, negative: 0, total: 0, ratio: null };

  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE feedback_type = 'positive')::int AS positive,
         COUNT(*) FILTER (WHERE feedback_type = 'negative')::int AS negative,
         COUNT(*)::int AS total
       FROM ai_feedback
       WHERE guild_id = $1`,
      [guildId],
    );

    const row = result.rows[0];
    const positive = row?.positive || 0;
    const negative = row?.negative || 1;
    const total = row?.total || 0;
    const ratio = total > 0 ? Math.round((positive / total) * 100) : null;

    return { positive, negative, total, ratio };
  } catch (err) {
    logError('Failed to fetch AI feedback stats', { guildId, error: err.message });
    return { positive: 0, negative: 0, total: 0, ratio: null };
  }
}

/**
 * Get daily feedback trend for a guild (last N days).
 * @param {string} guildId
 * @param {number} days - Number of days to look back (default 30)
 * @returns {Promise<Array<{date: string, positive: number, negative: number}>>}
 */
export async function getFeedbackTrend(guildId, days = 30) {
  const pool = getPool();
  if (!pool) return [];

  try {
    const result = await pool.query(
      `SELECT
         DATE(created_at) AS date,
         COUNT(*) FILTER (WHERE feedback_type = 'positive')::int AS positive,
         COUNT(*) FILTER (WHERE feedback_type = 'negative')::int AS negative
       FROM ai_feedback
       WHERE guild_id = $1
         AND created_at >= NOW() - INTERVAL '1 days' * $2
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [guildId, days],
    );

    return result.rows.map((r) => ({
      date: r.date,
      positive: r.positive || 0,
      negative: r.negative || 0,
    }));
  } catch (err) {
    logError('Failed to fetch AI feedback trend', { guildId, days, error: err.message });
    return [];
  }
}

/**
 * Get recent feedback entries for a guild.
 * @param {string} guildId
 * @param {number} limit - Max entries to return (default 50)
 * @returns {Promise<Array<{id: number, messageId: string, channelId: string, userId: string, feedbackType: string, createdAt: string}>>}
 */
export async function getRecentFeedback(guildId, limit = 50) {
  const pool = getPool();
  if (!pool) return [];

  try {
    const result = await pool.query(
      `SELECT
         id,
         message_id AS "messageId",
         channel_id AS "channelId",
         user_id AS "userId",
         feedback_type AS "feedbackType",
         created_at AS "createdAt"
       FROM ai_feedback
       WHERE guild_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [guildId, limit],
    );

    return result.rows;
  } catch (err) {
    logError('Failed to fetch recent AI feedback', { guildId, limit, error: err.message });
    return [];
  }
}
