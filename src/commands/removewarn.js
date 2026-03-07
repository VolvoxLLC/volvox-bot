/**
 * Remove Warning Command
 * Deactivate a specific warning by ID.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/250
 */

import { SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { removeWarning } from '../modules/warningEngine.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('removewarn')
  .setDescription('Remove a warning')
  .addIntegerOption((opt) =>
    opt.setName('id').setDescription('Warning ID').setRequired(true).setMinValue(1),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for removal').setRequired(false),
  );

export const moderatorOnly = true;

/**
 * Execute the removewarn command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const warningId = interaction.options.getInteger('id');
    const reason = interaction.options.getString('reason');

    const removed = await removeWarning(
      interaction.guild.id,
      warningId,
      interaction.user.id,
      reason,
    );

    if (!removed) {
      return await safeEditReply(
        interaction,
        `❌ Warning #${warningId} not found or already inactive.`,
      );
    }

    info('Warning removed via command', {
      guildId: interaction.guild.id,
      warningId,
      moderator: interaction.user.tag,
      targetUserId: removed.user_id,
    });

    await safeEditReply(
      interaction,
      `✅ Warning #${warningId} removed (was for <@${removed.user_id}>).`,
    );
  } catch (err) {
    logError('Command error', { error: err.message, command: 'removewarn' });
    await safeEditReply(interaction, '❌ Failed to remove warning.').catch(() => {});
  }
}
