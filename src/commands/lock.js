/**
 * Lock Command
 * Lock a channel to prevent messages from @everyone
 */

import { ChannelType, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { executeModAction } from '../utils/modAction.js';
import { safeSend } from '../utils/safeSend.js';

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
  await executeModAction(interaction, {
    action: 'lock',
    skipHierarchy: true,
    skipDm: true,
    getTarget: (inter) => {
      const channel = inter.options.getChannel('channel') || inter.channel;
      if (channel.type !== ChannelType.GuildText) {
        return { earlyReturn: '\u274C Lock can only be used in text channels.' };
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
        SendMessages: false,
      });

      const notifyEmbed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setDescription(
          `\uD83D\uDD12 This channel has been locked by ${inter.user}${reason ? `\n**Reason:** ${reason}` : ''}`,
        )
        .setTimestamp();
      await safeSend(channel, { embeds: [notifyEmbed] });
    },
    formatReply: (_tag, _c) => {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      return `\u2705 ${channel} has been locked.`;
    },
  });
}
