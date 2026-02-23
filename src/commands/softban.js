/**
 * Softban Command
 * Bans and immediately unbans a user to delete their messages.
 */

import { SlashCommandBuilder } from 'discord.js';
import { error as logError } from '../logger.js';
import { executeModAction } from '../utils/modAction.js';

export const data = new SlashCommandBuilder()
  .setName('softban')
  .setDescription('Ban and immediately unban a user to delete their messages')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for softban').setRequired(false),
  )
  .addIntegerOption((opt) =>
    opt
      .setName('delete_messages')
      .setDescription('Days of messages to delete (0-7, default 7)')
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the softban command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  let unbanError = null;

  await executeModAction(interaction, {
    action: 'softban',
    getTarget: (inter) => {
      const target = inter.options.getMember('user');
      if (!target) return { earlyReturn: '\u274C User is not in this server.' };
      return { target, targetId: target.id, targetTag: target.user.tag };
    },
    extractOptions: (inter) => ({
      reason: inter.options.getString('reason'),
    }),
    actionFn: async (target, reason, inter) => {
      const deleteMessageDays = inter.options.getInteger('delete_messages') ?? 7;
      await inter.guild.members.ban(target.id, {
        deleteMessageSeconds: deleteMessageDays * 86400,
        reason: reason || undefined,
      });

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await inter.guild.members.unban(target.id, 'Softban');
          unbanError = null;
          break;
        } catch (err) {
          unbanError = err;
          logError('Softban unban attempt failed', {
            error: err.message,
            targetId: target.id,
            attempt,
            command: 'softban',
          });
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          }
        }
      }
    },
    formatReply: (tag, c) => {
      if (unbanError) {
        return `\u26A0\uFE0F **${tag}** was banned but the unban failed \u2014 they remain banned. Please manually unban. (Case #${c.case_number})`;
      }
      return `\u2705 **${tag}** has been soft-banned. (Case #${c.case_number})`;
    },
  });
}
