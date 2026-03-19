/**
 * Reminder Button Handler
 * Handles Discord button interactions for reminder snooze and dismiss.
 */

import { error as logError } from '../../logger.js';
import { safeReply } from '../../utils/safeSend.js';
import { getConfig } from '../config.js';
import { handleReminderDismiss, handleReminderSnooze } from '../reminderHandler.js';

/**
 * Handle a reminder snooze or dismiss button interaction.
 * Expects button clicks with customId matching `reminder_snooze_<id>_<duration>`
 * or `reminder_dismiss_<id>`.
 *
 * @param {import('discord.js').Interaction} interaction
 * @returns {Promise<boolean>} true if handled, false if not applicable
 */
export async function handleReminderButton(interaction) {
  if (!interaction.isButton()) return false;

  const isSnooze = interaction.customId.startsWith('reminder_snooze_');
  const isDismiss = interaction.customId.startsWith('reminder_dismiss_');
  if (!isSnooze && !isDismiss) return false;

  const guildConfig = getConfig(interaction.guildId);
  if (!guildConfig.reminders?.enabled) return true;

  try {
    if (isSnooze) {
      await handleReminderSnooze(interaction);
    } else {
      await handleReminderDismiss(interaction);
    }
  } catch (err) {
    logError('Reminder button handler failed', {
      customId: interaction.customId,
      userId: interaction.user?.id,
      error: err.message,
    });

    if (!interaction.replied && !interaction.deferred) {
      try {
        await safeReply(interaction, {
          content: '❌ Something went wrong processing your request.',
          ephemeral: true,
        });
      } catch {
        // Ignore
      }
    }
  }
  return true;
}

/** @deprecated Use handleReminderButton directly */
export function registerReminderButtonHandler(client) {
  client.on('interactionCreate', handleReminderButton);
}
