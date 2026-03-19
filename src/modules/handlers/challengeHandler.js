/**
 * Challenge Button Handler
 * Handles Discord button interactions for challenge solve and hint buttons.
 */

import { error as logError, warn } from '../../logger.js';
import { safeReply } from '../../utils/safeSend.js';
import { handleHintButton, handleSolveButton } from '../challengeScheduler.js';
import { getConfig } from '../config.js';

/**
 * Handle a challenge solve or hint button interaction.
 * Expects button clicks with customId matching `challenge_solve_<index>` or `challenge_hint_<index>`.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>} true if handled, false if not applicable
 */
export async function handleChallengeButton(interaction) {
  if (!interaction.isButton()) return false;

  const isSolve = interaction.customId.startsWith('challenge_solve_');
  const isHint = interaction.customId.startsWith('challenge_hint_');
  if (!isSolve && !isHint) return false;

  const guildConfig = getConfig(interaction.guildId);
  if (!guildConfig.challenges?.enabled) return true;

  const prefix = isSolve ? 'challenge_solve_' : 'challenge_hint_';
  const indexStr = interaction.customId.slice(prefix.length);
  const challengeIndex = Number.parseInt(indexStr, 10);

  if (Number.isNaN(challengeIndex)) {
    warn('Invalid challenge button customId', { customId: interaction.customId });
    return true;
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
  return true;
}

/** @deprecated Use handleChallengeButton directly */
export function registerChallengeButtonHandler(client) {
  client.on('interactionCreate', handleChallengeButton);
}
