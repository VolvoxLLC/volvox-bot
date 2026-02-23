/**
 * Unban Command
 * Unbans a user from the server and records a moderation case.
 */

import { SlashCommandBuilder } from 'discord.js';
import { executeModAction } from '../utils/modAction.js';

export const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban a user from the server')
  .addStringOption((opt) =>
    opt.setName('user_id').setDescription('User ID to unban').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for unban').setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the unban command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await executeModAction(interaction, {
    action: 'unban',
    skipHierarchy: true,
    skipDm: true,
    getTarget: async (inter) => {
      const userId = inter.options.getString('user_id');
      await inter.guild.members.unban(userId, inter.options.getString('reason') || undefined);

      let targetTag = userId;
      try {
        const fetchedUser = await inter.client.users.fetch(userId);
        targetTag = fetchedUser.tag;
      } catch {
        // User no longer resolvable — keep raw ID
      }
      return { target: null, targetId: userId, targetTag };
    },
    extractOptions: (inter) => ({
      reason: inter.options.getString('reason'),
    }),
    formatReply: (tag, c) => `\u2705 **${tag}** has been unbanned. (Case #${c.case_number})`,
  });
}
