/**
 * Unlock Command
 * Unlock a channel to restore messaging permissions
 */

import { ChannelType, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { executeModAction } from '../utils/modAction.js';
import { safeSend } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('unlock')
  .setDescription('Unlock a channel to restore messages')
  .addChannelOption((opt) =>
    opt
      .setName('channel')
      .setDescription('Channel to unlock (defaults to current)')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for unlocking').setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the unlock command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await executeModAction(interaction, {
    action: 'unlock',
    skipHierarchy: true,
    skipDm: true,
    getTarget: (inter) => {
      const channel = inter.options.getChannel('channel') || inter.channel;
      if (channel.type !== ChannelType.GuildText) {
        return { earlyReturn: '\u274C Unlock can only be used in text channels.' };
      }
      return {
        target: null,
        targetId: channel.id,
        targetTag: `#${channel.name}`,
        _channel: channel,
      };
    },
    actionFn: async (_target, reason, inter) => {
      const channel = inter.options.getChannel('channel') || inter.channel;
      await channel.permissionOverwrites.edit(inter.guild.roles.everyone, {
        SendMessages: null,
      });

      const notifyEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setDescription(
          `\uD83D\uDD13 This channel has been unlocked by ${inter.user}${reason ? `\n**Reason:** ${reason}` : ''}`,
        )
        .setTimestamp();
      await safeSend(channel, { embeds: [notifyEmbed] });
    },
    formatReply: (_tag, _c) => {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      return `\u2705 ${channel} has been unlocked.`;
    },
  });
}
