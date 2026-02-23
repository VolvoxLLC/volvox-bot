/**
 * Warn Command
 * Issues a warning to a user and records a moderation case.
 */

import { SlashCommandBuilder } from 'discord.js';
import { checkEscalation } from '../modules/moderation.js';
import { executeModAction } from '../utils/modAction.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a user')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for warning').setRequired(false),
  );

export const adminOnly = true;

/**
 * Execute the warn command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await executeModAction(interaction, {
    action: 'warn',
    getTarget: (inter) => {
      const target = inter.options.getMember('user');
      if (!target) return { earlyReturn: '\u274C User is not in this server.' };
      return { target, targetId: target.id, targetTag: target.user.tag };
    },
    afterCase: async (_caseData, inter, config) => {
      const target = inter.options.getMember('user');
      await checkEscalation(
        inter.client,
        inter.guild.id,
        target.id,
        inter.client.user.id,
        inter.client.user.tag,
        config,
      );
    },
    formatReply: (tag, c) => `\u2705 **${tag}** has been warned. (Case #${c.case_number})`,
  });
}
