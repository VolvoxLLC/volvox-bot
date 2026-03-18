/**
 * Review Claim Button Handler
 * Handles Discord button interactions for review claiming.
 */

import { error as logError } from '../../logger.js';
import { safeReply } from '../../utils/safeSend.js';
import { getConfig } from '../config.js';
import { handleReviewClaim } from '../reviewHandler.js';

/**
 * Handle a review claim button interaction.
 * Expects button clicks with customId matching `review_claim_<id>`.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>} true if handled, false if not applicable
 */
export async function handleReviewButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('review_claim_')) return false;

  const guildConfig = getConfig(interaction.guildId);
  if (!guildConfig.review?.enabled) return true;

  try {
    await handleReviewClaim(interaction);
  } catch (err) {
    logError('Review claim handler failed', {
      customId: interaction.customId,
      userId: interaction.user?.id,
      error: err.message,
    });

    if (!interaction.replied && !interaction.deferred) {
      try {
        await safeReply(interaction, {
          content: '❌ Something went wrong processing your claim.',
          ephemeral: true,
        });
      } catch {
        // Ignore — we tried
      }
    }
  }
  return true;
}

/** @deprecated Use handleReviewButton directly */
export function registerReviewClaimHandler(client) {
  client.on('interactionCreate', handleReviewButton);
}
