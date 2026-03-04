/**
 * Reactions Event Handlers
 * Handles Discord reaction events for starboard, reaction roles, and AI feedback
 */

import { Events } from 'discord.js';
import { error as logError } from '../../logger.js';
import { safeReply } from '../../utils/safeSend.js';
import { isAiMessage, recordFeedback, FEEDBACK_EMOJI, deleteFeedback } from '../aiFeedback.js';
import { getConfig } from '../config.js';
import { trackReaction } from '../engagement.js';
import { handleReactionRoleAdd, handleReactionRoleRemove } from '../reactionRoles.js';
import { handleReactionAdd, handleReactionRemove } from '../starboard.js';

/**
 * Register reaction event handlers for the starboard feature.
 * Listens to both MessageReactionAdd and MessageReactionRemove to
 * post, update, or remove starboard embeds based on star count.
 *
 * @param {Client} client - Discord client instance
 * @param {Object} _config - Unused (kept for API compatibility); handler resolves per-guild config via getConfig().
 */
export function registerReactionHandlers(client, _config) {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    // Ignore bot reactions
    if (user.bot) return;

    // Fetch partial messages so we have full guild/channel data
    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch {
        return;
      }
    }
    const guildId = reaction.message.guild?.id;
    if (!guildId) return;

    const guildConfig = getConfig(guildId);

    // Engagement tracking (fire-and-forget)
    trackReaction(reaction, user).catch(() => {});

    // AI feedback tracking
    if (guildConfig.ai?.feedback?.enabled && isAiMessage(reaction.message.id)) {
      const emoji = reaction.emoji.name;
      const feedbackType =
        emoji === FEEDBACK_EMOJI.positive
          ? 'positive'
          : emoji === FEEDBACK_EMOJI.negative
            ? 'negative'
            : null;

      if (feedbackType) {
        recordFeedback({
          messageId: reaction.message.id,
          channelId: reaction.message.channel?.id || reaction.message.channelId,
          guildId,
          userId: user.id,
          feedbackType,
        }).catch(() => {});
      }
    }

    // Reaction roles — check before the starboard early-return
    try {
      await handleReactionRoleAdd(reaction, user);
    } catch (err) {
      logError('Reaction role add handler failed', {
        messageId: reaction.message.id,
        error: err.message,
      });
    }

    if (!guildConfig.starboard?.enabled) return;

    try {
      await handleReactionAdd(reaction, user, client, guildConfig);
    } catch (err) {
      logError('Starboard reaction add handler failed', {
        messageId: reaction.message.id,
        error: err.message,
      });
    }
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;

    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch {
        return;
      }
    }
    const guildId = reaction.message.guild?.id;
    if (!guildId) return;

    const guildConfig = getConfig(guildId);

    // AI feedback tracking (reaction removed)
    if (guildConfig.ai?.feedback?.enabled && isAiMessage(reaction.message.id)) {
      const emoji = reaction.emoji.name;
      const isFeedbackEmoji =
        emoji === FEEDBACK_EMOJI.positive || emoji === FEEDBACK_EMOJI.negative;

      if (isFeedbackEmoji) {
        deleteFeedback({
          messageId: reaction.message.id,
          userId: user.id,
        }).catch(() => {});
      }
    }

    // Reaction roles — check before the starboard early-return
    try {
      await handleReactionRoleRemove(reaction, user);
    } catch (err) {
      logError('Reaction role remove handler failed', {
        messageId: reaction.message.id,
        error: err.message,
      });
    }

    if (!guildConfig.starboard?.enabled) return;

    try {
      await handleReactionRemove(reaction, user, client, guildConfig);
    } catch (err) {
      logError('Starboard reaction remove handler failed', {
        messageId: reaction.message.id,
        error: err.message,
      });
    }
  });
}
