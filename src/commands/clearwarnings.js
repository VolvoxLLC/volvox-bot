/**
 * Clear Warnings Command
 * Deactivate all active warnings for a user in the guild.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/250
 */

import { SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { clearWarnings } from '../modules/warningEngine.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('clearwarnings')
  .setDescription('Clear all active warnings for a user')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for clearing').setRequired(false),
  );

export const moderatorOnly = true;

/**
 * Clears all active warnings for the specified guild member and replies to the interaction with the result.
 *
 * Reads the `user` and optional `reason` options from the command, records the moderator as the invoking user,
 * deactivates the user's active warnings in the guild, logs the event on success, and edits the deferred reply
 * to indicate whether warnings were cleared or if no active warnings were found. On error, logs the error and
 * replies with a failure message.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction that invoked the command.
 */
export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const count = await clearWarnings(interaction.guild.id, user.id, interaction.user.id, reason);

    if (count === 0) {
      return await safeEditReply(interaction, `No active warnings found for **${user.tag}**.`);
    }

    info('Warnings cleared via command', {
      guildId: interaction.guild.id,
      target: user.tag,
      moderator: interaction.user.tag,
      count,
    });

    await safeEditReply(
      interaction,
      `✅ Cleared **${count}** active warning(s) for **${user.tag}**.`,
    );
  } catch (err) {
    logError('Command error', { error: err.message, command: 'clearwarnings' });
    await safeEditReply(interaction, '❌ Failed to clear warnings.').catch(() => {});
  }
}
