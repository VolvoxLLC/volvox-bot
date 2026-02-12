/**
 * Warn Command
 * Issues a warning to a user and records a moderation case.
 */

import { SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import {
  checkEscalation,
  checkHierarchy,
  createCase,
  sendDmNotification,
  sendModLogEmbed,
  shouldSendDm,
} from '../modules/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a user')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for warning').setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the warn command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const config = getConfig();
    const target = interaction.options.getMember('user');
    if (!target) {
      return await interaction.editReply('❌ User is not in this server.');
    }
    const reason = interaction.options.getString('reason');

    const hierarchyError = checkHierarchy(interaction.member, target);
    if (hierarchyError) {
      return await interaction.editReply(hierarchyError);
    }

    if (shouldSendDm(config, 'warn')) {
      await sendDmNotification(target, 'warn', reason, interaction.guild.name);
    }

    const caseData = await createCase(interaction.guild.id, {
      action: 'warn',
      targetId: target.id,
      targetTag: target.user.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
    });

    await sendModLogEmbed(interaction.client, config, caseData);

    await checkEscalation(
      interaction.client,
      interaction.guild.id,
      target.id,
      interaction.client.user.id,
      interaction.client.user.tag,
      config,
    );

    info('User warned', { target: target.user.tag, moderator: interaction.user.tag });
    await interaction.editReply(
      `✅ **${target.user.tag}** has been warned. (Case #${caseData.case_number})`,
    );
  } catch (err) {
    logError('Command error', { error: err.message, command: 'warn' });
    const content = `❌ Failed to execute: ${err.message}`;
    if (interaction.deferred) {
      await interaction.editReply(content);
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}
