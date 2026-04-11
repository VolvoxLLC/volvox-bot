/**
 * AFK Handler Module
 * Intercepts messages to detect AFK users and notify mentioners.
 * Clears AFK status when the AFK user sends a message.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/46
 */

import { buildPingSummary } from '../commands/afk.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { safeSend } from '../utils/safeSend.js';
import { getConfig } from './config.js';

/**
 * In-memory rate limit store: maps `${guildId}:${afkUserId}:${channelId}` → timestamp (ms).
 * Prevents spamming AFK notices in busy channels.
 */
const afkNoticeRateLimit = new Map();

/** Rate limit window: 5 minutes in ms */
const RATE_LIMIT_MS = 5 * 60 * 1000;

/**
 * Check and update the rate limit for an AFK notice.
 * Returns true if a notice should be sent, false if rate-limited.
 *
 * Entries are auto-evicted via setTimeout to prevent unbounded Map growth.
 *
 * @param {string} guildId
 * @param {string} afkUserId
 * @param {string} channelId
 * @returns {boolean}
 */
function checkNoticeRateLimit(guildId, afkUserId, channelId) {
  const key = `${guildId}:${afkUserId}:${channelId}`;
  const now = Date.now();
  const last = afkNoticeRateLimit.get(key);

  if (last !== undefined && now - last < RATE_LIMIT_MS) {
    return false;
  }

  afkNoticeRateLimit.set(key, now);
  setTimeout(() => afkNoticeRateLimit.delete(key), RATE_LIMIT_MS + 1000);

  return true;
}

/**
 * Exported for test teardown / reset between tests.
 */
export function clearRateLimitCache() {
  afkNoticeRateLimit.clear();
}

/**
 * Process a guild message to clear a sender's AFK status and notify mentioned AFK users.
 *
 * Clears the message author's AFK status (if present) and DMs them a summary of pings,
 * and records pings for any mentioned guild members who are AFK. For mentioned AFK users,
 * an inline notice is sent unless suppressed by the per-channel rate limit.
 *
 * @param {import('discord.js').Message} message - The guild message to inspect for AFK status and mentions.
 * @returns {Promise<void>} Nothing.
 */
export async function handleAfkMentions(message) {
  // Only fire in guild channels
  if (!message.guild) return;

  const guildConfig = getConfig(message.guild.id);
  if (!guildConfig.afk?.enabled) return;

  const pool = getPool();

  // ── 1. Sender is AFK → auto-clear ─────────────────────────────────────

  try {
    const { rows: senderAfk } = await pool.query(
      'SELECT * FROM afk_status WHERE guild_id = $1 AND user_id = $2',
      [message.guild.id, message.author.id],
    );

    if (senderAfk.length > 0) {
      // Fetch pings before deletion
      const { rows: pings } = await pool.query(
        `SELECT pinger_id, channel_id, message_preview, pinged_at
         FROM afk_pings
         WHERE guild_id = $1 AND afk_user_id = $2
         ORDER BY pinged_at ASC`,
        [message.guild.id, message.author.id],
      );

      // Delete AFK record and associated pings atomically
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM afk_status WHERE guild_id = $1 AND user_id = $2', [
          message.guild.id,
          message.author.id,
        ]);
        await client.query('DELETE FROM afk_pings WHERE guild_id = $1 AND afk_user_id = $2', [
          message.guild.id,
          message.author.id,
        ]);
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      info('AFK auto-cleared on message', {
        guildId: message.guild.id,
        channelId: message.channel.id,
        userId: message.author.id,
      });

      // DM the returning user a ping summary
      const summary = buildPingSummary(pings);
      try {
        const dm = await message.author.createDM();
        await safeSend(dm, {
          content: `👋 Welcome back! Your AFK status has been cleared.${summary}`,
        });
      } catch (dmErr) {
        // DMs may be closed; not fatal
        logError('Failed to DM AFK ping summary', {
          guildId: message.guild?.id,
          channelId: message.channel?.id,
          userId: message.author.id,
          error: dmErr?.message,
        });
      }
    }
  } catch (err) {
    logError('AFK sender check failed', {
      guildId: message.guild.id,
      userId: message.author.id,
      error: err?.message,
    });
  }

  // ── 2. Check mentioned users for AFK status ────────────────────────────

  const mentionedMembers = message.mentions.members;
  if (!mentionedMembers || mentionedMembers.size === 0) return;

  for (const [userId, member] of mentionedMembers) {
    // Don't notify if the person mentioning themselves or a bot
    if (userId === message.author.id) continue;
    if (member.user.bot) continue;

    try {
      const { rows } = await pool.query(
        'SELECT * FROM afk_status WHERE guild_id = $1 AND user_id = $2',
        [message.guild.id, userId],
      );

      if (rows.length === 0) continue;

      const afk = rows[0];
      const setAtUnix = Math.floor(new Date(afk.set_at).getTime() / 1000);

      // Track this ping (always, even if notice is rate-limited)
      const preview = message.content?.slice(0, 100) || null;
      await pool.query(
        `INSERT INTO afk_pings (guild_id, afk_user_id, pinger_id, channel_id, message_preview)
         VALUES ($1, $2, $3, $4, $5)`,
        [message.guild.id, userId, message.author.id, message.channel.id, preview],
      );

      // Rate-limit AFK notices to prevent channel spam
      if (!checkNoticeRateLimit(message.guild.id, userId, message.channel.id)) {
        continue;
      }

      // Reply inline with AFK notice
      await safeSend(message.channel, {
        content: `💤 **${member.displayName}** is AFK: *${afk.reason}* (since <t:${setAtUnix}:R>)`,
      });

      info('AFK ping tracked', {
        guildId: message.guild.id,
        channelId: message.channel.id,
        afkUserId: userId,
        pingerId: message.author.id,
      });
    } catch (err) {
      logError('AFK mention check failed', {
        guildId: message.guild.id,
        afkUserId: userId,
        error: err?.message,
      });
    }
  }
}
