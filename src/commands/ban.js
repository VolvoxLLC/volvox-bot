/**
 * Ban Command
 * Bans a user from the server and records a moderation case.
 */

import { SlashCommandBuilder } from 'discord.js';
import { executeModAction } from '../utils/modAction.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user from the server')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
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
 * Execute the ban command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await executeModAction(interaction, {
    action: 'ban',
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
    extractOptions: (inter) => ({
      reason: inter.options.getString('reason'),
    }),
    actionFn: async (_target, reason, inter) => {
      const user = inter.options.getUser('user');
      const deleteMessageDays = inter.options.getInteger('delete_messages') || 0;
      await inter.guild.members.ban(user.id, {
        deleteMessageSeconds: deleteMessageDays * 86400,
        reason: reason || undefined,
      });
    },
    formatReply: (tag, c) => `\u2705 **${tag}** has been banned. (Case #${c.case_number})`,
  });
}
