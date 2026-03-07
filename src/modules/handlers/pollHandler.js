/**
 * Poll Vote Button Handler
 * Handles Discord button interactions for poll voting.
 */

import { Events } from 'discord.js';
import { error as logError } from '../../logger.js';
import { safeReply } from '../../utils/safeSend.js';
import { getConfig } from '../config.js';
import { handlePollVote } from '../pollHandler.js';

/**
 * Register an interactionCreate handler for poll vote buttons.
 * Listens for button clicks with customId matching `poll_vote_<pollId>_<optionIndex>`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerPollButtonHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('poll_vote_')) return;

    // Gate on poll feature being enabled for this guild
    const guildConfig = getConfig(interaction.guildId);
    if (!guildConfig.poll?.enabled) return;

    try {
      await handlePollVote(interaction);
    } catch (err) {
      logError('Poll vote handler failed', {
        customId: interaction.customId,
        userId: interaction.user?.id,
        error: err.message,
      });

      // Try to send an ephemeral error if we haven't replied yet
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
  });
}
