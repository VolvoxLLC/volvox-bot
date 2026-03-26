/**
 * addReaction Action Handler
 * Reacts to the triggering message with a configured emoji.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/368
 */

import { info, warn } from '../../logger.js';

/**
 * React to the triggering message with an emoji.
 * Supports Unicode emoji (e.g. '🎉') and custom guild emoji (e.g. '<:name:123456>').
 *
 * @param {Object} action - { type: "addReaction", emoji: string }
 * @param {Object} context - Pipeline context
 */
export async function handleAddReaction(action, context) {
  const { message, guild, member } = context;
  const { emoji } = action;

  if (!emoji) {
    warn('addReaction action missing emoji config', { guildId: guild.id });
    return;
  }

  if (!message) {
    warn('addReaction action has no triggering message', { guildId: guild.id });
    return;
  }

  // Parse custom emoji format <:name:id> or <a:name:id> → extract the id
  const customMatch = emoji.match(/^<a?:\w+:(\d+)>$/);
  const reactionEmoji = customMatch ? customMatch[1] : emoji;

  try {
    await message.react(reactionEmoji);
    info('Level-up reaction added', {
      guildId: guild.id,
      userId: member.user?.id,
      emoji,
    });
  } catch (err) {
    warn('Failed to add level-up reaction', {
      guildId: guild.id,
      userId: member.user?.id,
      emoji,
      error: err.message,
    });
  }
}
