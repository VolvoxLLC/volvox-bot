/**
 * Reminder Button Handler
 * Handles Discord button interactions for reminder snooze and dismiss.
 */

import { handleButtonError } from '../../utils/interactionError.js';
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
    await handleButtonError(interaction, err, {
      context: 'Reminder button handler failed',
      message: '❌ Something went wrong processing your request.',
    });
  }
  return true;
}

/** @deprecated Use handleReminderButton directly */
export function registerReminderButtonHandler(client) {
  client.on('interactionCreate', handleReminderButton);
}
