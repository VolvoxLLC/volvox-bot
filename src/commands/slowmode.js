/**
 * Slowmode Command
 * Set channel slowmode duration
 */

import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { formatDuration, parseDuration } from '../utils/duration.js';
import { executeModAction } from '../utils/modAction.js';

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
  let seconds = 0;

  await executeModAction(interaction, {
    action: 'slowmode',
    skipHierarchy: true,
    skipDm: true,
    getTarget: (inter) => {
      const channel = inter.options.getChannel('channel') || inter.channel;
      return { target: null, targetId: channel.id, targetTag: `#${channel.name}` };
    },
    extractOptions: (inter) => {
      const durationStr = inter.options.getString('duration');
      const reason = inter.options.getString('reason');

      if (durationStr !== '0') {
        const ms = parseDuration(durationStr);
        if (!ms) {
          return { earlyReturn: '\u274C Invalid duration format. Use formats like: 5s, 1m, 1h' };
        }
        if (ms > 6 * 60 * 60 * 1000) {
          return { earlyReturn: '\u274C Duration cannot exceed 6 hours.' };
        }
        seconds = Math.floor(ms / 1000);
      }

      return {
        reason:
          reason ||
          (seconds === 0
            ? 'Slowmode disabled'
            : `Slowmode set to ${formatDuration(seconds * 1000)}`),
        duration: seconds > 0 ? formatDuration(seconds * 1000) : null,
      };
    },
    actionFn: async (_target, _reason, inter) => {
      const channel = inter.options.getChannel('channel') || inter.channel;
      await channel.setRateLimitPerUser(seconds);
    },
    formatReply: (_tag, c) => {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      if (seconds === 0) {
        return `\u2705 Slowmode disabled in ${channel}. (Case #${c.case_number})`;
      }
      return `\u2705 Slowmode set to **${formatDuration(seconds * 1000)}** in ${channel}. (Case #${c.case_number})`;
    },
  });
}
