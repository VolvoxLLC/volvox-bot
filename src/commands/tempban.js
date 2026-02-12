/**
 * Tempban Command
 * Temporarily bans a user and schedules an automatic unban.
 */

import { SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import {
  checkHierarchy,
  createCase,
  scheduleAction,
  sendDmNotification,
  sendModLogEmbed,
  shouldSendDm,
} from '../modules/moderation.js';
import { formatDuration, parseDuration } from '../utils/duration.js';

export const data = new SlashCommandBuilder()
  .setName('tempban')
  .setDescription('Temporarily ban a user')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('duration').setDescription('Duration (e.g. 1d, 7d, 2w)').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for ban').setRequired(false),
  )
  .addIntegerOption((opt) =>
    opt
      .setName('delete_messages')
      .setDescription('Days of messages to delete (0-7)')
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the tempban command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const config = getConfig();
    const user = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason');
    const deleteMessageDays = interaction.options.getInteger('delete_messages') || 0;

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      return await interaction.editReply('❌ Invalid duration format. Use e.g. 1d, 7d, 2w.');
    }

    let member = null;
    try {
      member = await interaction.guild.members.fetch(user.id);
    } catch {
      // User not in guild — skip hierarchy check
    }

    if (member) {
      const hierarchyError = checkHierarchy(
        interaction.member,
        member,
        interaction.guild.members.me,
      );
      if (hierarchyError) {
        return await interaction.editReply(hierarchyError);
      }

      if (shouldSendDm(config, 'ban')) {
        await sendDmNotification(member, 'tempban', reason, interaction.guild.name);
      }
    }

    const expiresAt = new Date(Date.now() + durationMs);

    await interaction.guild.members.ban(user.id, {
      deleteMessageSeconds: deleteMessageDays * 86400,
      reason: reason || undefined,
    });

    const caseData = await createCase(interaction.guild.id, {
      action: 'tempban',
      targetId: user.id,
      targetTag: user.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
      duration: formatDuration(durationMs),
      expiresAt,
    });

    await scheduleAction(interaction.guild.id, 'unban', user.id, caseData.id, expiresAt);

    await sendModLogEmbed(interaction.client, config, caseData);

    info('User tempbanned', {
      target: user.tag,
      moderator: interaction.user.tag,
      duration: durationStr,
    });
    await interaction.editReply(
      `✅ **${user.tag}** has been temporarily banned. (Case #${caseData.case_number})`,
    );
  } catch (err) {
    logError('Command error', { error: err.message, command: 'tempban' });
    await interaction
      .editReply('❌ An error occurred. Please try again or contact an administrator.')
      .catch(() => {});
  }
}
