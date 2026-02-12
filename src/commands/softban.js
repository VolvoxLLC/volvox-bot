/**
 * Softban Command
 * Bans and immediately unbans a user to delete their messages.
 */

import { SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import {
  checkHierarchy,
  createCase,
  sendDmNotification,
  sendModLogEmbed,
  shouldSendDm,
} from '../modules/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('softban')
  .setDescription('Ban and immediately unban a user to delete their messages')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for softban').setRequired(false),
  )
  .addIntegerOption((opt) =>
    opt
      .setName('delete_messages')
      .setDescription('Days of messages to delete (0-7, default 7)')
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the softban command
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
    const deleteMessageDays = interaction.options.getInteger('delete_messages') ?? 7;

    const hierarchyError = checkHierarchy(interaction.member, target);
    if (hierarchyError) {
      return await interaction.editReply(hierarchyError);
    }

    if (shouldSendDm(config, 'ban')) {
      await sendDmNotification(target, 'softban', reason, interaction.guild.name);
    }

    await interaction.guild.members.ban(target.id, {
      deleteMessageSeconds: deleteMessageDays * 86400,
      reason: reason || undefined,
    });

    await interaction.guild.members.unban(target.id, 'Softban');

    const caseData = await createCase(interaction.guild.id, {
      action: 'softban',
      targetId: target.id,
      targetTag: target.user.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
    });

    await sendModLogEmbed(interaction.client, config, caseData);

    info('User softbanned', { target: target.user.tag, moderator: interaction.user.tag });
    await interaction.editReply(
      `✅ **${target.user.tag}** has been soft-banned. (Case #${caseData.case_number})`,
    );
  } catch (err) {
    logError('Command error', { error: err.message, command: 'softban' });
    const content = `❌ Failed to execute: ${err.message}`;
    if (interaction.deferred) {
      await interaction.editReply(content);
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}
