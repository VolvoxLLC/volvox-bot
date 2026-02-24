/**
 * Kick Command
 * Kicks a user from the server and records a moderation case.
 */

import { SlashCommandBuilder } from 'discord.js';
import { executeModAction } from '../utils/modAction.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a user from the server')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for kick').setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the kick command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await executeModAction(interaction, {
    action: 'kick',
    getTarget: (inter) => {
      const target = inter.options.getMember('user');
      if (!target) return { earlyReturn: '\u274C User is not in this server.' };
      return { target, targetId: target.id, targetTag: target.user.tag };
    },
    actionFn: async (target, reason) => {
      await target.kick(reason || undefined);
    },
    formatReply: (tag, c) => `\u2705 **${tag}** has been kicked. (Case #${c.case_number})`,
  });
}
