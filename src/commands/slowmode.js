/**
 * Slowmode Command
 * Set channel slowmode duration
 */

import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { createCase, sendModLogEmbed } from '../modules/moderation.js';
import { formatDuration, parseDuration } from '../utils/duration.js';

export const data = new SlashCommandBuilder()
  .setName('slowmode')
  .setDescription('Set channel slowmode')
  .addStringOption((opt) =>
    opt
      .setName('duration')
      .setDescription('Slowmode duration (0 to disable, e.g., 5s, 1m, 1h)')
      .setRequired(true),
  )
  .addChannelOption((opt) =>
    opt
      .setName('channel')
      .setDescription('Channel (defaults to current)')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for changing slowmode').setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the slowmode command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason');

    let seconds = 0;

    if (durationStr !== '0') {
      const ms = parseDuration(durationStr);
      if (!ms) {
        return await interaction.editReply(
          '❌ Invalid duration format. Use formats like: 5s, 1m, 1h',
        );
      }

      if (ms > 6 * 60 * 60 * 1000) {
        return await interaction.editReply('❌ Duration cannot exceed 6 hours.');
      }

      seconds = Math.floor(ms / 1000);
    }

    await channel.setRateLimitPerUser(seconds);

    const config = getConfig();
    const caseData = await createCase(interaction.guild.id, {
      action: 'slowmode',
      targetId: channel.id,
      targetTag: `#${channel.name}`,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason:
        reason ||
        (seconds === 0 ? 'Slowmode disabled' : `Slowmode set to ${formatDuration(seconds * 1000)}`),
      duration: seconds > 0 ? formatDuration(seconds * 1000) : null,
    });

    await sendModLogEmbed(interaction.client, config, caseData);

    if (seconds === 0) {
      info('Slowmode disabled', { channelId: channel.id, moderator: interaction.user.tag });
      await interaction.editReply(
        `✅ Slowmode disabled in ${channel}. (Case #${caseData.case_number})`,
      );
    } else {
      info('Slowmode set', { channelId: channel.id, seconds, moderator: interaction.user.tag });
      await interaction.editReply(
        `✅ Slowmode set to **${formatDuration(seconds * 1000)}** in ${channel}. (Case #${caseData.case_number})`,
      );
    }
  } catch (err) {
    logError('Slowmode command failed', { error: err.message, command: 'slowmode' });
    await interaction
      .editReply('❌ An error occurred. Please try again or contact an administrator.')
      .catch(() => {});
  }
}
