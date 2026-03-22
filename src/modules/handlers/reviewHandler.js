/**
 * Review Claim Button Handler
 * Handles Discord button interactions for review claiming.
 */

import { handleButtonError } from '../../utils/interactionError.js';
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
    await handleButtonError(interaction, err, {
      context: 'Review claim handler failed',
      message: '❌ Something went wrong processing your claim.',
    });
  }
  return true;
}

/** @deprecated Use handleReviewButton directly */
export function registerReviewClaimHandler(client) {
  client.on('interactionCreate', handleReviewButton);
}
