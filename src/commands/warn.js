/**
 * Warn Command
 * Issues a warning to a user, records a moderation case, and creates a
 * warning record with severity/points/expiry tracking.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/250
 */

import { SlashCommandBuilder } from 'discord.js';
import { checkEscalation } from '../modules/moderation.js';
import { createWarning } from '../modules/warningEngine.js';
import { executeModAction } from '../utils/modAction.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a user')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for warning').setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName('severity')
      .setDescription('Warning severity (affects point weight)')
      .setRequired(false)
      .addChoices(
        { name: 'Low (1 point)', value: 'low' },
        { name: 'Medium (2 points)', value: 'medium' },
        { name: 'High (3 points)', value: 'high' },
      ),
  );

export const moderatorOnly = true;

/**
 * Issue a warning to a guild member, record a moderation case and warning, and trigger escalation checks.
 *
 * Creates a moderation case via the standardized moderation flow, persists a linked warning record (including severity),
 * and invokes escalation logic based on active warnings.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction that invoked the warn command.
 */
export async function execute(interaction) {
  await executeModAction(interaction, {
    action: 'warn',
    getTarget: (inter) => {
      const target = inter.options.getMember('user');
      if (!target) return { earlyReturn: '\u274C User is not in this server.' };
      return { target, targetId: target.id, targetTag: target.user.tag };
    },
    extractOptions: (inter) => ({
      reason: inter.options.getString('reason'),
      _severity: inter.options.getString('severity') || 'low',
    }),
    afterCase: async (caseData, inter, config) => {
      const severity = inter.options.getString('severity') || 'low';

      // Create the warning record linked to the mod case
      await createWarning(
        inter.guild.id,
        {
          userId: caseData.target_id,
          moderatorId: inter.user.id,
          moderatorTag: inter.user.tag,
          reason: caseData.reason,
          severity,
          caseId: caseData.id,
        },
        config,
      );

      // Check escalation (now uses active warnings only)
      await checkEscalation(
        inter.client,
        inter.guild.id,
        caseData.target_id,
        inter.client.user.id,
        inter.client.user.tag,
        config,
      );
    },
    formatReply: (tag, c) => `\u2705 **${tag}** has been warned. (Case #${c.case_number})`,
  });
}
