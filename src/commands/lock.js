/**
 * Lock Command
 * Lock a channel to prevent messages from @everyone
 */

import { ChannelType, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { createCase, sendModLogEmbed } from '../modules/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('lock')
  .setDescription('Lock a channel to prevent messages')
  .addChannelOption((opt) =>
    opt
      .setName('channel')
      .setDescription('Channel to lock (defaults to current)')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for locking').setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the lock command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason = interaction.options.getString('reason');

    if (channel.type !== ChannelType.GuildText) {
      return await interaction.editReply('❌ Lock can only be used in text channels.');
    }

    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: false,
    });

    const notifyEmbed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setDescription(
        `🔒 This channel has been locked by ${interaction.user}${reason ? `\n**Reason:** ${reason}` : ''}`,
      )
      .setTimestamp();
    await channel.send({ embeds: [notifyEmbed] });

    const config = getConfig();
    const caseData = await createCase(interaction.guild.id, {
      action: 'lock',
      targetId: channel.id,
      targetTag: `#${channel.name}`,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
    });
    await sendModLogEmbed(interaction.client, config, caseData);

    info('Channel locked', { channelId: channel.id, moderator: interaction.user.tag });
    await interaction.editReply(`✅ ${channel} has been locked.`);
  } catch (err) {
    logError('Lock command failed', { error: err.message, command: 'lock' });
    await interaction
      .editReply('❌ An error occurred. Please try again or contact an administrator.')
      .catch(() => {});
  }
}
