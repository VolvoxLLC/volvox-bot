/**
 * Starboard Module
 *
 * When a message accumulates enough star reactions (configurable threshold),
 * it gets reposted to a dedicated starboard channel with a gold embed.
 * Handles dedup (update vs repost), star removal, and self-star prevention.
 */

import { EmbedBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { debug, info, error as logError, warn } from '../logger.js';

/** Default starboard configuration values */
export const STARBOARD_DEFAULTS = {
  enabled: false,
  channelId: null,
  threshold: 3,
  emoji: '*',
  selfStarAllowed: false,
  ignoredChannels: [],
};

/** Gold color for starboard embeds */
const STARBOARD_COLOR = 0xffd700;

/**
 * Build the starboard embed for a message.
 *
 * @param {import('discord.js').Message} message - The original message
 * @param {number} starCount - Current star count
 * @param {string} [displayEmoji='⭐'] - Emoji to display in the Stars field
 * @returns {EmbedBuilder} The starboard embed
 */
export function buildStarboardEmbed(message, starCount, displayEmoji = '⭐') {
  const embed = new EmbedBuilder()
    .setColor(STARBOARD_COLOR)
    .setAuthor({
      name: message.author?.displayName ?? message.author?.username ?? 'Unknown',
      iconURL: message.author?.displayAvatarURL?.() ?? undefined,
    })
    .setTimestamp(message.createdAt)
    .addFields(
      { name: 'Source', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Stars', value: `${displayEmoji} ${starCount}`, inline: true },
      {
        name: 'Jump',
        value: `[Go to message](https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id})`,
        inline: true,
      },
    );

  if (message.content) {
    embed.setDescription(message.content);
  }

  // Attach the first image from the message (attachment or embed).
  // Discord.js Collections have .find(); fall back to iteration for plain Maps.
  let imageAttachment = null;
  if (message.attachments) {
    if (typeof message.attachments.find === 'function') {
      imageAttachment = message.attachments.find((a) => a.contentType?.startsWith('image/'));
    } else {
      for (const a of message.attachments.values()) {
        if (a.contentType?.startsWith('image/')) {
          imageAttachment = a;
          break;
        }
      }
    }
  }

  if (imageAttachment) {
    embed.setImage(imageAttachment.url);
  } else if (message.embeds?.length > 0) {
    const imageEmbed = message.embeds.find((e) => e.image?.url);
    if (imageEmbed) {
      embed.setImage(imageEmbed.image.url);
    }
  }

  return embed;
}

/**
 * Look up an existing starboard post by source message ID.
 *
 * @param {string} sourceMessageId - The original message ID
 * @returns {Promise<Object|null>} The starboard_posts row or null
 */
export async function findStarboardPost(sourceMessageId) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT * FROM starboard_posts WHERE source_message_id = $1',
      [sourceMessageId],
    );
    return rows[0] || null;
  } catch (err) {
    logError('Failed to query starboard_posts', { error: err.message, sourceMessageId });
    return null;
  }
}

/**
 * Insert a new starboard post record.
 *
 * @param {Object} params
 * @param {string} params.guildId - Guild ID
 * @param {string} params.sourceMessageId - Original message ID
 * @param {string} params.sourceChannelId - Original channel ID
 * @param {string} params.starboardMessageId - Starboard embed message ID
 * @param {number} params.starCount - Current star count
 * @returns {Promise<void>}
 */
export async function insertStarboardPost({
  guildId,
  sourceMessageId,
  sourceChannelId,
  starboardMessageId,
  starCount,
}) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO starboard_posts (guild_id, source_message_id, source_channel_id, starboard_message_id, star_count)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (source_message_id) DO UPDATE SET starboard_message_id = $4, star_count = $5`,
    [guildId, sourceMessageId, sourceChannelId, starboardMessageId, starCount],
  );
}

/**
 * Update the star count for an existing starboard post.
 *
 * @param {string} sourceMessageId - Original message ID
 * @param {number} starCount - New star count
 * @returns {Promise<void>}
 */
export async function updateStarboardPostCount(sourceMessageId, starCount) {
  const pool = getPool();
  await pool.query('UPDATE starboard_posts SET star_count = $1 WHERE source_message_id = $2', [
    starCount,
    sourceMessageId,
  ]);
}

/**
 * Delete a starboard post record.
 *
 * @param {string} sourceMessageId - Original message ID
 * @returns {Promise<void>}
 */
export async function deleteStarboardPost(sourceMessageId) {
  const pool = getPool();
  await pool.query('DELETE FROM starboard_posts WHERE source_message_id = $1', [sourceMessageId]);
}

/**
 * Resolve the effective starboard config with defaults applied.
 *
 * @param {Object} config - Guild config
 * @returns {Object} Merged starboard config with defaults
 */
export function resolveStarboardConfig(config) {
  return { ...STARBOARD_DEFAULTS, ...config?.starboard };
}

/**
 * Get the star count for a specific emoji on a message.
 * Handles both unicode and custom emoji matching.
 * When emoji is '*', finds the reaction with the highest count.
 *
 * @param {import('discord.js').Message} message - The message to check
 * @param {string} emoji - The emoji to count (e.g. '⭐'), or '*' for any emoji
 * @param {boolean} selfStarAllowed - Whether to count the author's own reaction
 * @returns {Promise<{count: number, emoji: string}>} The star count and matched emoji
 */
export async function getStarCount(message, emoji, selfStarAllowed) {
  let reaction = null;

  if (emoji === '*') {
    // Wildcard: find the reaction with the highest count
    let maxCount = 0;
    for (const r of message.reactions.cache.values()) {
      if (r.count > maxCount) {
        maxCount = r.count;
        reaction = r;
      }
    }
  } else {
    for (const r of message.reactions.cache.values()) {
      if (r.emoji.name === emoji) {
        reaction = r;
        break;
      }
    }
  }

  if (!reaction) return { count: 0, emoji: emoji === '*' ? '⭐' : emoji };

  const matchedEmoji = reaction.emoji.name ?? '⭐';
  let count = reaction.count;

  if (!selfStarAllowed) {
    try {
      const users = await reaction.users.fetch({ limit: 100 });
      if (users.has(message.author.id)) {
        count -= 1;
      }
    } catch (err) {
      debug('Could not fetch reaction users for self-star check', {
        messageId: message.id,
        error: err.message,
      });
    }
  }

  return { count: Math.max(0, count), emoji: matchedEmoji };
}

/**
 * Handle a reaction being added to a message.
 * If the star count meets/exceeds the threshold, post or update the starboard embed.
 *
 * @param {import('discord.js').MessageReaction} reaction - The reaction
 * @param {import('discord.js').User} user - The user who reacted
 * @param {import('discord.js').Client} client - Discord client
 * @param {Object} config - Guild config
 */
export async function handleReactionAdd(reaction, user, client, config) {
  const sbConfig = resolveStarboardConfig(config);
  if (!sbConfig.enabled || !sbConfig.channelId) return;

  // Ensure reaction and message are fully fetched
  if (reaction.partial) {
    try {
      reaction = await reaction.fetch();
    } catch (err) {
      warn('Failed to fetch partial reaction', { error: err.message });
      return;
    }
  }

  const message = reaction.message;
  if (message.partial) {
    try {
      await message.fetch();
    } catch (err) {
      warn('Failed to fetch partial message for starboard', { error: err.message });
      return;
    }
  }

  // Prevent feedback loop — don't star messages posted in the starboard channel itself
  if (message.channel.id === sbConfig.channelId) return;

  // Only process the configured emoji (skip check for wildcard '*')
  if (sbConfig.emoji !== '*' && reaction.emoji.name !== sbConfig.emoji) return;

  // Ignore messages in ignored channels
  if (sbConfig.ignoredChannels.includes(message.channel.id)) return;

  // Prevent self-star if not allowed
  if (!sbConfig.selfStarAllowed && user.id === message.author.id) {
    debug('Self-star ignored', { userId: user.id, messageId: message.id });
    return;
  }

  const { count: starCount, emoji: displayEmoji } = await getStarCount(
    message,
    sbConfig.emoji,
    sbConfig.selfStarAllowed,
  );

  if (starCount < sbConfig.threshold) return;

  const existing = await findStarboardPost(message.id);

  try {
    const starboardChannel = await client.channels.fetch(sbConfig.channelId);
    if (!starboardChannel) {
      warn('Starboard channel not found', { channelId: sbConfig.channelId });
      return;
    }

    const embed = buildStarboardEmbed(message, starCount, displayEmoji);
    const content = `${displayEmoji} **${starCount}** | <#${message.channel.id}>`;

    if (existing) {
      // Update existing starboard message
      try {
        const starboardMessage = await starboardChannel.messages.fetch(
          existing.starboard_message_id,
        );
        await starboardMessage.edit({ content, embeds: [embed] });
        await updateStarboardPostCount(message.id, starCount);
        debug('Starboard post updated', { messageId: message.id, starCount });
      } catch (err) {
        warn('Failed to update starboard message, reposting', { error: err.message });
        // If the starboard message was deleted, repost
        const newMsg = await starboardChannel.send({ content, embeds: [embed] });
        await insertStarboardPost({
          guildId: message.guild.id,
          sourceMessageId: message.id,
          sourceChannelId: message.channel.id,
          starboardMessageId: newMsg.id,
          starCount,
        });
      }
    } else {
      // New starboard post
      const newMsg = await starboardChannel.send({ content, embeds: [embed] });
      await insertStarboardPost({
        guildId: message.guild.id,
        sourceMessageId: message.id,
        sourceChannelId: message.channel.id,
        starboardMessageId: newMsg.id,
        starCount,
      });
      info('New starboard post', { messageId: message.id, starCount });
    }
  } catch (err) {
    logError('Starboard handleReactionAdd failed', {
      messageId: message.id,
      error: err.message,
    });
  }
}

/**
 * Handle a reaction being removed from a message.
 * Updates the starboard embed count, or removes it if below threshold.
 *
 * @param {import('discord.js').MessageReaction} reaction - The reaction
 * @param {import('discord.js').User} _user - The user who removed the reaction (unused, kept for API symmetry)
 * @param {import('discord.js').Client} client - Discord client
 * @param {Object} config - Guild config
 */
export async function handleReactionRemove(reaction, _user, client, config) {
  const sbConfig = resolveStarboardConfig(config);
  if (!sbConfig.enabled || !sbConfig.channelId) return;

  // Ensure reaction and message are fully fetched
  if (reaction.partial) {
    try {
      reaction = await reaction.fetch();
    } catch (err) {
      warn('Failed to fetch partial reaction on remove', { error: err.message });
      return;
    }
  }

  const message = reaction.message;
  if (message.partial) {
    try {
      await message.fetch();
    } catch (err) {
      warn('Failed to fetch partial message for starboard remove', { error: err.message });
      return;
    }
  }

  // Only process the configured emoji (skip check for wildcard '*')
  if (sbConfig.emoji !== '*' && reaction.emoji.name !== sbConfig.emoji) return;

  const existing = await findStarboardPost(message.id);
  if (!existing) return; // Nothing to update

  const { count: starCount, emoji: displayEmoji } = await getStarCount(
    message,
    sbConfig.emoji,
    sbConfig.selfStarAllowed,
  );

  try {
    const starboardChannel = await client.channels.fetch(sbConfig.channelId);
    if (!starboardChannel) return;

    if (starCount < sbConfig.threshold) {
      // Below threshold — remove from starboard
      try {
        const starboardMessage = await starboardChannel.messages.fetch(
          existing.starboard_message_id,
        );
        await starboardMessage.delete();
      } catch (err) {
        debug('Starboard message already deleted', { error: err.message });
      }
      await deleteStarboardPost(message.id);
      info('Starboard post removed (below threshold)', { messageId: message.id, starCount });
    } else {
      // Update count
      try {
        const starboardMessage = await starboardChannel.messages.fetch(
          existing.starboard_message_id,
        );
        const embed = buildStarboardEmbed(message, starCount, displayEmoji);
        const content = `${displayEmoji} **${starCount}** | <#${message.channel.id}>`;
        await starboardMessage.edit({ content, embeds: [embed] });
        await updateStarboardPostCount(message.id, starCount);
        debug('Starboard post updated on reaction remove', { messageId: message.id, starCount });
      } catch (err) {
        warn('Failed to update starboard message on reaction remove', { error: err.message });
      }
    }
  } catch (err) {
    logError('Starboard handleReactionRemove failed', {
      messageId: message.id,
      error: err.message,
    });
  }
}
