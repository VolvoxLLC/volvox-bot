/**
 * Review Claim Button Handler
 * Handles Discord button interactions for review claiming.
 */

import { Events } from 'discord.js';
import { error as logError } from '../../logger.js';
import { safeReply } from '../../utils/safeSend.js';
import { getConfig } from '../config.js';
import { handleReviewClaim } from '../reviewHandler.js';

/**
 * Register an interactionCreate handler for review claim buttons.
 * Listens for button clicks with customId matching `review_claim_<id>`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerReviewClaimHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('review_claim_')) return;

    // Gate on review feature being enabled for this guild
    const guildConfig = getConfig(interaction.guildId);
    if (!guildConfig.review?.enabled) return;

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
  });
}
