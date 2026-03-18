/**
 * Poll Vote Button Handler
 * Handles Discord button interactions for poll voting.
 */

import { error as logError } from '../../logger.js';
import { safeReply } from '../../utils/safeSend.js';
import { getConfig } from '../config.js';
import { handlePollVote } from '../pollHandler.js';

/**
 * Handle a poll vote button interaction.
 * Expects button clicks with customId matching `poll_vote_<pollId>_<optionIndex>`.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>} true if handled, false if not applicable
 */
export async function handlePollButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('poll_vote_')) return false;

  const guildConfig = getConfig(interaction.guildId);
  if (!guildConfig.poll?.enabled) return true;

  try {
    await handlePollVote(interaction);
  } catch (err) {
    logError('Poll vote handler failed', {
      customId: interaction.customId,
      userId: interaction.user?.id,
      error: err.message,
    });

    if (!interaction.replied && !interaction.deferred) {
      try {
        await safeReply(interaction, {
          content: '❌ Something went wrong processing your vote.',
          ephemeral: true,
        });
      } catch {
        // Ignore — we tried
      }
    }
  }
  return true;
}

/** @deprecated Use handlePollButton directly */
export function registerPollButtonHandler(client) {
  client.on('interactionCreate', handlePollButton);
}
