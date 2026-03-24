/**
 * Engagement Tracking Module
 * Tracks user activity stats (messages, reactions, days active) for the /profile command.
 *
 * Performance design: writes are buffered in memory and flushed as a single
 * batch upsert every DEFAULT_FLUSH_INTERVAL_MS (default 10 s) rather than issuing one
 * INSERT per message/reaction. This reduces DB round-trips by an order of
 * magnitude on active guilds while preserving all per-user stat accuracy.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/44
 */

import { getPool } from '../db.js';
import { error as logError, warn } from '../logger.js';
import { getConfig } from './config.js';

/**
 * Default flush interval in milliseconds.
 * All buffered writes are flushed to the DB in a single batch upsert.
 */
const DEFAULT_FLUSH_INTERVAL_MS = 10_000;

/**
 * Maximum number of entries the in-memory buffer can hold.
 * When the buffer reaches this limit, new events are dropped with a warning.
 * Prevents unbounded memory growth during prolonged DB outages.
 */
const MAX_BUFFER_SIZE = 50_000;

/**
 * Maximum entries per INSERT batch (6 params each → 60,000 params, under PostgreSQL's 65,535 limit).
 */
const BATCH_SIZE = 10_000;

/**
 * @typedef {Object} StatsEntry
 * @property {string}  guildId           - Discord guild snowflake.
 * @property {string}  userId            - Discord user snowflake.
 * @property {number}  messages          - messages_sent increment pending flush.
 * @property {number}  reactionsGiven    - reactions_given increment pending flush.
 * @property {number}  reactionsReceived - reactions_received increment pending flush.
 * @property {boolean} bumpDays          - true when the user was active (sent messages or gave reactions).
 */

/** @type {Map<string, StatsEntry>} In-memory write-back buffer keyed by `${guildId}:${userId}`. */
const statsBuffer = new Map();

/** @type {ReturnType<typeof setInterval> | null} */
let flushIntervalHandle = null;

/** @type {boolean} True when a flush is currently in-flight. */
let flushInProgress = false;

/** @type {number} Consecutive flush failures — used for log rate-limiting. */
let consecutiveFlushFailures = 0;

/**
 * Return the existing buffer entry for a guild/user pair, or create a zeroed one.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {StatsEntry}
 */
function getOrCreateEntry(guildId, userId) {
  const key = `${guildId}:${userId}`;
  let entry = statsBuffer.get(key);
  if (!entry) {
    if (statsBuffer.size >= MAX_BUFFER_SIZE) {
      warn('Engagement buffer at capacity — dropping new entry', {
        maxSize: MAX_BUFFER_SIZE,
        guildId,
      });
      return null;
    }
    entry = {
      guildId,
      userId,
      messages: 0,
      reactionsGiven: 0,
      reactionsReceived: 0,
      bumpDays: false,
    };
    statsBuffer.set(key, entry);
  }
  return entry;
}

/**
 * Track a message sent by a user in a guild.
 * Increments the in-memory write-back buffer synchronously; the DB is updated
 * on the next scheduled flush (see {@link startEngagementFlushInterval}).
 * Kept async to preserve the existing fire-and-forget call sites.
 *
 * @param {import('discord.js').Message} message
 * @returns {Promise<void>}
 */
export async function trackMessage(message) {
  if (!message.guild) return;
  if (message.author?.bot) return;

  const config = getConfig(message.guild.id);
  if (!config?.engagement?.enabled) return;
  if (!config.engagement.trackMessages) return;

  const entry = getOrCreateEntry(message.guild.id, message.author.id);
  if (!entry) return;
  entry.messages += 1;
  entry.bumpDays = true;
}

/**
 * Track a reaction added by a user.
 * Increments reactions_given for the reactor and reactions_received for the message
 * author in the in-memory write-back buffer. The DB is updated on the next flush.
 * Kept async to preserve the existing fire-and-forget call sites.
 *
 * @param {import('discord.js').MessageReaction} reaction
 * @param {import('discord.js').User} user
 * @returns {Promise<void>}
 */
export async function trackReaction(reaction, user) {
  const guildId = reaction.message.guild?.id;
  if (!guildId) return;
  if (user.bot) return;

  const config = getConfig(guildId);
  if (!config?.engagement?.enabled) return;
  if (!config.engagement.trackReactions) return;

  // reactions_given for the reactor (counts as active — bumps days_active).
  const reactorEntry = getOrCreateEntry(guildId, user.id);
  if (!reactorEntry) return;
  reactorEntry.reactionsGiven += 1;
  reactorEntry.bumpDays = true;

  // reactions_received for the message author (passive — does NOT update days_active).
  const messageAuthor = reaction.message.author;
  const authorId = messageAuthor?.id;
  if (authorId && authorId !== user.id && !messageAuthor?.bot) {
    const authorEntry = getOrCreateEntry(guildId, authorId);
    authorEntry.reactionsReceived += 1;
  }
}

/**
 * Flush all pending buffered writes to the database in a single batch upsert.
 * Safe to call at any time; a no-op when the buffer is empty.
 *
 * On a database error the drained entries are merged back into the buffer so
 * accumulated counts survive until the next flush attempt.
 *
 * The SQL encoding uses `EXCLUDED.days_active` as a flag (1 = active, 0 = passive-only):
 * - Active rows update `days_active` only when the calendar date has rolled over.
 * - Active rows update `last_active` to NOW(); passive-only rows leave it unchanged.
 *
 * @returns {Promise<void>}
 */
export async function flushEngagementBuffer() {
  if (statsBuffer.size === 0) return;

  // Drain the buffer atomically before the async DB write so that new events
  // arriving during the query are safely accumulated in fresh entries.
  const entries = [...statsBuffer.values()];
  statsBuffer.clear();

  try {
    const pool = getPool();

    // Chunk entries into batches to stay under PostgreSQL's 65,535 bind-parameter limit.
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const params = [];
      const rows = batch.map((entry) => {
        const offset = params.length + 1;
        params.push(
          entry.guildId,
          entry.userId,
          entry.messages,
          entry.reactionsGiven,
          entry.reactionsReceived,
          entry.bumpDays ? 1 : 0,
        );
        return `($${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, NOW(), NOW())`;
      });

      await pool.query(
        `INSERT INTO user_stats
           (guild_id, user_id, messages_sent, reactions_given, reactions_received, days_active, first_seen, last_active)
         VALUES ${rows.join(', ')}
         ON CONFLICT (guild_id, user_id) DO UPDATE
           SET messages_sent      = user_stats.messages_sent      + EXCLUDED.messages_sent,
               reactions_given    = user_stats.reactions_given    + EXCLUDED.reactions_given,
               reactions_received = user_stats.reactions_received + EXCLUDED.reactions_received,
               days_active        = CASE
                 WHEN EXCLUDED.days_active = 1
                   AND (user_stats.days_active = 0 OR user_stats.last_active::date < EXCLUDED.last_active::date)
                 THEN user_stats.days_active + 1
                 ELSE user_stats.days_active
               END,
               last_active        = CASE
                 WHEN EXCLUDED.days_active = 1 THEN NOW()
                 ELSE user_stats.last_active
               END`,
        params,
      );
    }
    consecutiveFlushFailures = 0;
  } catch (err) {
    consecutiveFlushFailures += 1;
    // Rate-limit error logs: log first failure, then every 30th (~5 min at 10s interval).
    if (consecutiveFlushFailures === 1 || consecutiveFlushFailures % 30 === 0) {
      logError('Failed to flush engagement buffer', {
        count: entries.length,
        consecutive: consecutiveFlushFailures,
        error: err.message,
      });
    }
    // Merge drained entries back into the buffer so counts are not permanently lost.
    for (const entry of entries) {
      const key = `${entry.guildId}:${entry.userId}`;
      const existing = statsBuffer.get(key);
      if (existing) {
        existing.messages += entry.messages;
        existing.reactionsGiven += entry.reactionsGiven;
        existing.reactionsReceived += entry.reactionsReceived;
        if (entry.bumpDays) existing.bumpDays = true;
      } else {
        statsBuffer.set(key, entry);
      }
    }
    throw err;
  }
}

/**
 * Start the periodic engagement flush interval.
 * Idempotent — calling this more than once has no additional effect.
 * The timer is `.unref()`-ed so it does not prevent the Node.js event loop from exiting naturally.
 *
 * @param {number} [intervalMs=10000] - Flush period in milliseconds (default 10 s).
 * @returns {void}
 */
export function startEngagementFlushInterval(intervalMs = DEFAULT_FLUSH_INTERVAL_MS) {
  if (flushIntervalHandle !== null) return;
  flushIntervalHandle = setInterval(() => {
    if (flushInProgress) return; // skip if previous flush still in-flight
    flushInProgress = true;
    flushEngagementBuffer()
      .catch(() => {}) // errors already logged inside flushEngagementBuffer
      .finally(() => {
        flushInProgress = false;
      });
  }, intervalMs);
  // Allow the Node.js event loop to exit cleanly even if a flush is pending.
  flushIntervalHandle.unref?.();
}

/**
 * Stop the periodic flush interval and flush any remaining buffered writes to the DB.
 * Should be called during graceful shutdown **before** the DB pool is closed.
 *
 * @returns {Promise<void>}
 */
export async function stopEngagementFlushInterval() {
  if (flushIntervalHandle !== null) {
    clearInterval(flushIntervalHandle);
    flushIntervalHandle = null;
  }
  try {
    await flushEngagementBuffer();
  } catch (err) {
    if (statsBuffer.size > 0) {
      logError('Engagement buffer still has entries after failed flush — potential data loss', {
        remaining: statsBuffer.size,
        error: err.message,
      });
    }
  }
}
