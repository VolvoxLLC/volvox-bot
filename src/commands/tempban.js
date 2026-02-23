/**
 * Tempban Command
 * Temporarily bans a user and schedules an automatic unban.
 */

import { SlashCommandBuilder } from 'discord.js';
import { scheduleAction } from '../modules/moderation.js';
import { formatDuration, parseDuration } from '../utils/duration.js';
import { executeModAction } from '../utils/modAction.js';

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
  await executeModAction(interaction, {
    action: 'tempban',
    dmAction: 'ban',
    getTarget: async (inter) => {
      const user = inter.options.getUser('user');
      let member = null;
      try {
        member = await inter.guild.members.fetch(user.id);
      } catch {
        // User not in guild — skip hierarchy check
      }
      return { target: member, targetId: user.id, targetTag: user.tag };
    },
    extractOptions: (inter) => {
      const durationStr = inter.options.getString('duration');
      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        return { earlyReturn: '\u274C Invalid duration format. Use e.g. 1d, 7d, 2w.' };
      }
      return {
        reason: inter.options.getString('reason'),
        duration: formatDuration(durationMs),
        expiresAt: new Date(Date.now() + durationMs),
        _durationMs: durationMs,
      };
    },
    actionFn: async (_target, reason, inter) => {
      const user = inter.options.getUser('user');
      const deleteMessageDays = inter.options.getInteger('delete_messages') || 0;
      await inter.guild.members.ban(user.id, {
        deleteMessageSeconds: deleteMessageDays * 86400,
        reason: reason || undefined,
      });
    },
    afterCase: async (caseData, inter) => {
      const user = inter.options.getUser('user');
      const durationStr = inter.options.getString('duration');
      const durationMs = parseDuration(durationStr);
      const expiresAt = new Date(Date.now() + durationMs);
      await scheduleAction(inter.guild.id, 'unban', user.id, caseData.id, expiresAt);
    },
    formatReply: (tag, c) =>
      `\u2705 **${tag}** has been temporarily banned. (Case #${c.case_number})`,
  });
}
