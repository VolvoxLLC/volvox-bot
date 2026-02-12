/**
 * Untimeout Command
 * Removes a timeout from a user and records a moderation case.
 */

import { SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { checkHierarchy, createCase, sendModLogEmbed } from '../modules/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('untimeout')
  .setDescription('Remove a timeout from a user')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for removing timeout').setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the untimeout command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const config = getConfig();
    const target = interaction.options.getMember('user');
    if (!target) {
      return await interaction.editReply('❌ User is not in this server.');
    }
    const reason = interaction.options.getString('reason');

    const hierarchyError = checkHierarchy(interaction.member, target, interaction.guild.members.me);
    if (hierarchyError) {
      return await interaction.editReply(hierarchyError);
    }

    await target.timeout(null, reason || undefined);

    const caseData = await createCase(interaction.guild.id, {
      action: 'untimeout',
      targetId: target.id,
      targetTag: target.user.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
    });

    await sendModLogEmbed(interaction.client, config, caseData);

    info('User timeout removed', { target: target.user.tag, moderator: interaction.user.tag });
    await interaction.editReply(
      `✅ **${target.user.tag}** has had their timeout removed. (Case #${caseData.case_number})`,
    );
  } catch (err) {
    logError('Command error', { error: err.message, command: 'untimeout' });
    await interaction
      .editReply('❌ An error occurred. Please try again or contact an administrator.')
      .catch(() => {});
  }
}
