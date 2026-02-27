/**
 * Engagement Tracking Module
 * Tracks user activity stats (messages, reactions, days active) for the /profile command.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/44
 */

import { getPool } from '../db.js';
import { error as logError } from '../logger.js';
import { getConfig } from './config.js';

/**
 * Track a message sent by a user in a guild.
 * Fire-and-forget: caller should use `.catch(() => {})`.
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

  try {
    const pool = getPool();
    const now = new Date();

    await pool.query(
      `INSERT INTO user_stats (guild_id, user_id, messages_sent, days_active, first_seen, last_active)
       VALUES ($1, $2, 1, 1, NOW(), NOW())
       ON CONFLICT (guild_id, user_id) DO UPDATE
         SET messages_sent = user_stats.messages_sent + 1,
             days_active = CASE
               WHEN user_stats.days_active = 0 OR user_stats.last_active::date < $3::date
               THEN user_stats.days_active + 1
               ELSE user_stats.days_active
             END,
             last_active = NOW()`,
      [message.guild.id, message.author.id, now.toISOString()],
    );
  } catch (err) {
    logError('Failed to track message engagement', {
      userId: message.author.id,
      guildId: message.guild.id,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Track a reaction added by a user.
 * Increments reactions_given for the reactor and reactions_received for the message author.
 * Fire-and-forget: caller should use `.catch(() => {})`.
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

  try {
    const pool = getPool();
    const now = new Date();

    // Increment reactions_given for the reactor
    const givenQuery = pool.query(
      `INSERT INTO user_stats (guild_id, user_id, reactions_given, days_active, first_seen, last_active)
       VALUES ($1, $2, 1, 1, NOW(), NOW())
       ON CONFLICT (guild_id, user_id) DO UPDATE
         SET reactions_given = user_stats.reactions_given + 1,
             days_active = CASE
               WHEN user_stats.days_active = 0 OR user_stats.last_active::date < $3::date
               THEN user_stats.days_active + 1
               ELSE user_stats.days_active
             END,
             last_active = NOW()`,
      [guildId, user.id, now.toISOString()],
    );

    // Increment reactions_received for message author (skip if author is the reactor or a bot)
    const messageAuthor = reaction.message.author;
    const authorId = messageAuthor?.id;
    const receivedQuery =
      authorId && authorId !== user.id && !messageAuthor?.bot
        ? pool.query(
            `INSERT INTO user_stats (guild_id, user_id, reactions_received, days_active, first_seen, last_active)
             VALUES ($1, $2, 1, 1, NOW(), NOW())
             ON CONFLICT (guild_id, user_id) DO UPDATE
               SET reactions_received = user_stats.reactions_received + 1,
                   days_active = CASE
                     WHEN user_stats.days_active = 0 OR user_stats.last_active::date < $3::date
                     THEN user_stats.days_active + 1
                     ELSE user_stats.days_active
                   END,
                   last_active = NOW()`,
            [guildId, authorId, now.toISOString()],
          )
        : null;

    await Promise.all([givenQuery, receivedQuery].filter(Boolean));
  } catch (err) {
    logError('Failed to track reaction engagement', {
      userId: user.id,
      guildId,
      error: err.message,
    });
    throw err;
  }
}
