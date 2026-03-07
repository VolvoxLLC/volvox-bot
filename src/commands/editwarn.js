/**
 * Edit Warning Command
 * Edit the reason or severity of an existing warning.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/250
 */

import { SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { editWarning } from '../modules/warningEngine.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('editwarn')
  .setDescription('Edit a warning')
  .addIntegerOption((opt) =>
    opt.setName('id').setDescription('Warning ID').setRequired(true).setMinValue(1),
  )
  .addStringOption((opt) => opt.setName('reason').setDescription('New reason').setRequired(false))
  .addStringOption((opt) =>
    opt
      .setName('severity')
      .setDescription('New severity')
      .setRequired(false)
      .addChoices(
        { name: 'Low (1 point)', value: 'low' },
        { name: 'Medium (2 points)', value: 'medium' },
        { name: 'High (3 points)', value: 'high' },
      ),
  );

export const moderatorOnly = true;

/**
 * Execute the editwarn command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const warningId = interaction.options.getInteger('id');
    const reason = interaction.options.getString('reason');
    const severity = interaction.options.getString('severity');

    if (!reason && !severity) {
      return await safeEditReply(
        interaction,
        '❌ You must provide at least a new reason or severity.',
      );
    }

    const updates = {};
    if (reason) updates.reason = reason;
    if (severity) updates.severity = severity;

    const config = getConfig(interaction.guildId);
    const updated = await editWarning(interaction.guild.id, warningId, updates, config);

    if (!updated) {
      return await safeEditReply(interaction, `❌ Warning #${warningId} not found in this server.`);
    }

    const parts = [];
    if (reason) parts.push(`reason`);
    if (severity) parts.push(`severity → ${severity}`);

    info('Warning edited via command', {
      guildId: interaction.guild.id,
      warningId,
      moderator: interaction.user.tag,
      updates: Object.keys(updates),
    });

    await safeEditReply(interaction, `✅ Warning #${warningId} updated (${parts.join(', ')}).`);
  } catch (err) {
    logError('Command error', { error: err.message, command: 'editwarn' });
    await safeEditReply(interaction, '❌ Failed to edit warning.').catch(() => {});
  }
}
