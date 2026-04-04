/**
 * Warnings Command
 * View all warnings for a user, with active/expired status.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/250
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { getActiveWarningStats, getWarnings } from '../modules/warningEngine.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('View warnings for a user')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
  .addBooleanOption((opt) =>
    opt
      .setName('active_only')
      .setDescription('Show only active warnings (default: all)')
      .setRequired(false),
  )
  .addIntegerOption((opt) =>
    opt
      .setName('page')
      .setDescription('Page number (default: 1)')
      .setRequired(false)
      .setMinValue(1),
  );

export const moderatorOnly = true;

/**
 * Map a severity level to a labeled string that includes an emoji.
 * @param {string} severity - Severity level; commonly 'low', 'medium', or 'high'.
 * @returns {string} The labeled severity (e.g., '🟢 Low', '🟡 Medium', '🔴 High'), or the original `severity` string if unrecognized.
 */
function severityLabel(severity) {
  const labels = {
    low: '🟢 Low',
    medium: '🟡 Medium',
    high: '🔴 High',
  };
  return labels[severity] || severity;
}

/**
 * Handle the /warnings slash command by fetching and presenting a user's warnings, including active/inactive status and aggregate stats, to the invoking moderator.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction for which to display warnings.
 */
export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.options.getUser('user');
    const activeOnly = interaction.options.getBoolean('active_only') ?? false;
    const page = interaction.options.getInteger('page') ?? 1;
    const perPage = 10;
    const offset = (page - 1) * perPage;

    const [warnings, stats] = await Promise.all([
      getWarnings(interaction.guild.id, user.id, { activeOnly, limit: perPage, offset }),
      getActiveWarningStats(interaction.guild.id, user.id),
    ]);

    if (warnings.length === 0) {
      const msg = activeOnly
        ? `No active warnings found for **${user.tag}**.`
        : `No warnings found for **${user.tag}**.`;
      return await safeEditReply(interaction, msg);
    }

    const lines = warnings.map((w) => {
      const timestamp = Math.floor(new Date(w.created_at).getTime() / 1000);
      let status;
      if (w.active) {
        status = '✅ Active';
      } else if (w.removal_reason === 'Expired') {
        status = '⏰ Expired';
      } else {
        status = '🗑️ Removed';
      }
      const reason = w.reason
        ? w.reason.length > 40
          ? `${w.reason.slice(0, 37)}...`
          : w.reason
        : 'No reason';
      const caseRef = w.case_id ? ` (Case linked)` : '';
      return `**#${w.id}** — ${severityLabel(w.severity)} — ${w.points}pt — ${status} — <t:${timestamp}:R>\n↳ ${reason}${caseRef}`;
    });

    const embed = new EmbedBuilder()
      .setColor(stats.points > 5 ? 0xed4245 : stats.points > 2 ? 0xfee75c : 0x57f287)
      .setTitle(`Warnings — ${user.tag}`)
      .setDescription(lines.join('\n\n'))
      .addFields(
        { name: 'Active Warnings', value: `${stats.count}`, inline: true },
        { name: 'Total Points', value: `${stats.points}`, inline: true },
      )
      .setThumbnail(user.displayAvatarURL())
      .setFooter({
        text: `Page ${page} · Showing ${warnings.length} warning(s)${activeOnly ? ' (active only)' : ''} · Use /warnings page:${page + 1} for more`,
      })
      .setTimestamp();

    info('Warnings viewed', {
      guildId: interaction.guild.id,
      channelId: interaction.channelId,
      target: user.tag,
      moderator: interaction.user.tag,
      count: warnings.length,
    });

    await safeEditReply(interaction, { embeds: [embed] });
  } catch (err) {
    logError('Command error', { error: err.message, command: 'warnings' });
    await safeEditReply(interaction, '❌ Failed to fetch warnings.').catch(() => {});
  }
}
