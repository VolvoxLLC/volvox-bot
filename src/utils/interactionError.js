/**
 * Shared Discord interaction error-handling utility.
 * Centralises the repetitive try/catch block used inside button handler
 * modules: log the error, then attempt an ephemeral error reply if the
 * interaction has not already been acknowledged.
 */

import { error as logError } from '../logger.js';
import { safeReply } from './safeSend.js';

/**
 * Handle an error thrown inside a Discord button interaction handler.
 *
 * Logs the failure with contextual metadata and – when the interaction has
 * not yet been replied to or deferred – attempts an ephemeral error reply so
 * the user receives feedback instead of a silent timeout.
 *
 * @param {import('discord.js').ButtonInteraction} interaction - The Discord interaction that triggered the handler.
 * @param {Error} err - The error that was caught.
 * @param {object} options - Contextual options for logging and user feedback.
 * @param {string} options.context - Human-readable description of the handler (used as the log message).
 * @param {string} options.message - Ephemeral reply content shown to the user on failure.
 * @returns {Promise<void>}
 */
export async function handleButtonError(interaction, err, { context, message }) {
  logError(context, {
    customId: interaction.customId,
    userId: interaction.user?.id,
    error: err.message,
  });

  if (!interaction.replied && !interaction.deferred) {
    try {
      await safeReply(interaction, {
        content: message,
        ephemeral: true,
      });
    } catch {
      // Ignore — best-effort reply
    }
  }
}
