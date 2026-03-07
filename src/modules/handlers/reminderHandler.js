/**
 * Reminder Button Handler
 * Handles Discord button interactions for reminder snooze and dismiss.
 */

import { Events } from 'discord.js';
import { error as logError } from '../../logger.js';
import { safeReply } from '../../utils/safeSend.js';
import { getConfig } from '../config.js';
import { handleReminderDismiss, handleReminderSnooze } from '../reminderHandler.js';

/**
 * Register an interactionCreate handler for reminder snooze/dismiss buttons.
 * Listens for button clicks with customId matching `reminder_snooze_<id>_<duration>`
 * or `reminder_dismiss_<id>`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerReminderButtonHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const isSnooze = interaction.customId.startsWith('reminder_snooze_');
    const isDismiss = interaction.customId.startsWith('reminder_dismiss_');
    if (!isSnooze && !isDismiss) return;

    // Gate on reminders feature being enabled for this guild
    const guildConfig = getConfig(interaction.guildId);
    if (!guildConfig.reminders?.enabled) return;

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
  });
}
