/**
 * Untimeout Command
 * Removes a timeout from a user and records a moderation case.
 */

import { SlashCommandBuilder } from 'discord.js';
import { executeModAction } from '../utils/modAction.js';

export const data = new SlashCommandBuilder()
  .setName('untimeout')
  .setDescription('Remove a timeout from a user')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for removing timeout').setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the untimeout command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await executeModAction(interaction, {
    action: 'untimeout',
    skipDm: true,
    skipProtection: true,
    getTarget: (inter) => {
      const target = inter.options.getMember('user');
      if (!target) return { earlyReturn: '\u274C User is not in this server.' };
      return { target, targetId: target.id, targetTag: target.user.tag };
    },
    actionFn: async (target, reason) => {
      await target.timeout(null, reason || undefined);
    },
    formatReply: (tag, c) =>
      `\u2705 **${tag}** has had their timeout removed. (Case #${c.case_number})`,
  });
}
