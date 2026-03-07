/**
 * Challenge Button Handler
 * Handles Discord button interactions for challenge solve and hint buttons.
 */

import { Events } from 'discord.js';
import { error as logError, warn } from '../../logger.js';
import { safeReply } from '../../utils/safeSend.js';
import { handleHintButton, handleSolveButton } from '../challengeScheduler.js';
import { getConfig } from '../config.js';

/**
 * Register an interactionCreate handler for challenge solve and hint buttons.
 * Listens for button clicks with customId matching `challenge_solve_<index>` or `challenge_hint_<index>`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerChallengeButtonHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const isSolve = interaction.customId.startsWith('challenge_solve_');
    const isHint = interaction.customId.startsWith('challenge_hint_');
    if (!isSolve && !isHint) return;

    // Gate on challenges feature being enabled for this guild
    const guildConfig = getConfig(interaction.guildId);
    if (!guildConfig.challenges?.enabled) return;

    const prefix = isSolve ? 'challenge_solve_' : 'challenge_hint_';
    const indexStr = interaction.customId.slice(prefix.length);
    const challengeIndex = Number.parseInt(indexStr, 10);

    if (Number.isNaN(challengeIndex)) {
      warn('Invalid challenge button customId', { customId: interaction.customId });
      return;
    }

    try {
      if (isSolve) {
        await handleSolveButton(interaction, challengeIndex);
      } else {
        await handleHintButton(interaction, challengeIndex);
      }
    } catch (err) {
      logError('Challenge button handler failed', {
        customId: interaction.customId,
        userId: interaction.user?.id,
        error: err.message,
      });

      if (!interaction.replied && !interaction.deferred) {
        try {
          await safeReply(interaction, {
            content: '❌ Something went wrong. Please try again.',
            ephemeral: true,
          });
        } catch {
          // Ignore
        }
      }
    }
  });
}
