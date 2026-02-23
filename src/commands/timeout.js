/**
 * Timeout Command
 * Times out a user for a specified duration and records a moderation case.
 */

import { SlashCommandBuilder } from 'discord.js';
import { formatDuration, parseDuration } from '../utils/duration.js';
import { executeModAction } from '../utils/modAction.js';

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
  await executeModAction(interaction, {
    action: 'timeout',
    getTarget: (inter) => {
      const target = inter.options.getMember('user');
      if (!target) return { earlyReturn: '\u274C User is not in this server.' };
      return { target, targetId: target.id, targetTag: target.user.tag };
    },
    extractOptions: (inter) => {
      const durationStr = inter.options.getString('duration');
      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        return { earlyReturn: '\u274C Invalid duration format. Use e.g. 30m, 1h, 7d.' };
      }
      const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
      if (durationMs > MAX_TIMEOUT_MS) {
        return { earlyReturn: '\u274C Timeout duration cannot exceed 28 days.' };
      }
      return {
        reason: inter.options.getString('reason'),
        duration: formatDuration(durationMs),
        expiresAt: new Date(Date.now() + durationMs),
        _durationMs: durationMs,
      };
    },
    actionFn: async (target, reason, inter) => {
      const durationStr = inter.options.getString('duration');
      const durationMs = parseDuration(durationStr);
      await target.timeout(durationMs, reason || undefined);
    },
    formatReply: (tag, c) => `\u2705 **${tag}** has been timed out. (Case #${c.case_number})`,
  });
}
