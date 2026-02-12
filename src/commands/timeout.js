/**
 * Timeout Command
 * Times out a user for a specified duration and records a moderation case.
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
import { formatDuration, parseDuration } from '../utils/duration.js';

export const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Timeout a user')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('duration').setDescription('Duration (e.g. 30m, 1h, 7d)').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for timeout').setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the timeout command
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
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason');

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      return await interaction.editReply('❌ Invalid duration format. Use e.g. 30m, 1h, 7d.');
    }

    const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > MAX_TIMEOUT_MS) {
      return await interaction.editReply('❌ Timeout duration cannot exceed 28 days.');
    }

    const hierarchyError = checkHierarchy(interaction.member, target, interaction.guild.members.me);
    if (hierarchyError) {
      return await interaction.editReply(hierarchyError);
    }

    if (shouldSendDm(config, 'timeout')) {
      await sendDmNotification(target, 'timeout', reason, interaction.guild.name);
    }

    await target.timeout(durationMs, reason || undefined);

    const caseData = await createCase(interaction.guild.id, {
      action: 'timeout',
      targetId: target.id,
      targetTag: target.user.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
      duration: formatDuration(durationMs),
      expiresAt: new Date(Date.now() + durationMs),
    });

    await sendModLogEmbed(interaction.client, config, caseData);

    info('User timed out', {
      target: target.user.tag,
      moderator: interaction.user.tag,
      duration: durationStr,
    });
    await interaction.editReply(
      `✅ **${target.user.tag}** has been timed out. (Case #${caseData.case_number})`,
    );
  } catch (err) {
    logError('Command error', { error: err.message, command: 'timeout' });
    await interaction
      .editReply('❌ An error occurred. Please try again or contact an administrator.')
      .catch(() => {});
  }
}
