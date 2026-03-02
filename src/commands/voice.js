/**
 * Voice Command
 * Leaderboard, stats, and export for voice channel activity.
 *
 * Subcommands:
 *   /voice leaderboard [period] — top users by voice time
 *   /voice stats [user]        — detailed stats for yourself or another user
 *   /voice export [period]     — export raw session data as CSV (mod-only)
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/135
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import {
  exportVoiceSessions,
  formatDuration,
  getUserVoiceStats,
  getVoiceLeaderboard,
} from '../modules/voice.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('voice')
  .setDescription('Voice channel activity tracking and stats')
  .addSubcommand((sub) =>
    sub
      .setName('leaderboard')
      .setDescription('Top members by voice time')
      .addStringOption((opt) =>
        opt
          .setName('period')
          .setDescription('Time period (default: week)')
          .setRequired(false)
          .addChoices(
            { name: 'This week', value: 'week' },
            { name: 'This month', value: 'month' },
            { name: 'All time', value: 'all' },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('stats')
      .setDescription('Voice time stats for a member')
      .addUserOption((opt) =>
        opt
          .setName('user')
          .setDescription('Member to look up (default: yourself)')
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('export')
      .setDescription('Export voice session data as CSV (moderators only)')
      .addStringOption((opt) =>
        opt
          .setName('period')
          .setDescription('Time period to export (default: all)')
          .setRequired(false)
          .addChoices(
            { name: 'This week', value: 'week' },
            { name: 'This month', value: 'month' },
            { name: 'All time', value: 'all' },
          ),
      ),
  );

/**
 * Execute the /voice command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply();

  const cfg = getConfig(interaction.guildId);
  if (!cfg?.voice?.enabled) {
    return safeEditReply(interaction, {
      content: '🔇 Voice tracking is not enabled on this server.',
    });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'leaderboard') return handleLeaderboard(interaction);
  if (sub === 'stats') return handleStats(interaction);
  if (sub === 'export') return handleExport(interaction);
}

// ─── /voice leaderboard ───────────────────────────────────────────────────────

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleLeaderboard(interaction) {
  const period = interaction.options.getString('period') ?? 'week';

  try {
    const rows = await getVoiceLeaderboard(interaction.guildId, { limit: 10, period });

    if (rows.length === 0) {
      return safeEditReply(interaction, {
        content: '📭 No voice activity recorded yet.',
      });
    }

    // Batch-fetch display names
    const memberMap = new Map();
    try {
      const members = await interaction.guild.members.fetch({ user: rows.map((r) => r.user_id) });
      for (const [id, member] of members) memberMap.set(id, member.displayName);
    } catch {
      // Fall back to mention format
    }

    const periodLabel =
      period === 'week' ? 'This Week' : period === 'month' ? 'This Month' : 'All Time';

    const lines = rows.map((row, i) => {
      const displayName = memberMap.get(row.user_id) ?? `<@${row.user_id}>`;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
      const time = formatDuration(row.total_seconds);
      return `${medal} ${displayName} — ${time} (${row.session_count} session${row.session_count !== 1 ? 's' : ''})`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🎙️ Voice Leaderboard — ${periodLabel}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Top ${rows.length} members by voice time` })
      .setTimestamp();

    return safeEditReply(interaction, { embeds: [embed] });
  } catch (err) {
    logError('Voice leaderboard failed', { error: err.message, stack: err.stack });
    return safeEditReply(interaction, {
      content: '❌ Something went wrong fetching the voice leaderboard.',
    });
  }
}

// ─── /voice stats ─────────────────────────────────────────────────────────────

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleStats(interaction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const guildId = interaction.guildId;

  try {
    const stats = await getUserVoiceStats(guildId, targetUser.id);

    const totalTime = formatDuration(stats.total_seconds);
    const favChannel = stats.favorite_channel ? `<#${stats.favorite_channel}>` : 'N/A';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🎙️ Voice Stats — ${targetUser.displayName ?? targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'Total Voice Time', value: totalTime, inline: true },
        { name: 'Sessions', value: String(stats.session_count), inline: true },
        { name: 'Favourite Channel', value: favChannel, inline: true },
      )
      .setTimestamp();

    return safeEditReply(interaction, { embeds: [embed] });
  } catch (err) {
    logError('Voice stats failed', { error: err.message, stack: err.stack });
    return safeEditReply(interaction, {
      content: '❌ Something went wrong fetching voice stats.',
    });
  }
}

// ─── /voice export ────────────────────────────────────────────────────────────

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleExport(interaction) {
  // Require moderator permission (ManageGuild or Administrator)
  if (!interaction.memberPermissions?.has('ManageGuild')) {
    return safeEditReply(interaction, {
      content: '❌ You need the **Manage Server** permission to export voice data.',
    });
  }

  const period = interaction.options.getString('period') ?? 'all';

  try {
    const sessions = await exportVoiceSessions(interaction.guildId, { period, limit: 5000 });

    if (sessions.length === 0) {
      return safeEditReply(interaction, { content: '📭 No voice sessions found for that period.' });
    }

    // Build CSV
    const csvLines = [
      'id,user_id,channel_id,joined_at,left_at,duration_seconds',
      ...sessions.map(
        (s) =>
          `${s.id},${s.user_id},${s.channel_id},${s.joined_at?.toISOString() ?? ''},${s.left_at?.toISOString() ?? ''},${s.duration_seconds ?? ''}`,
      ),
    ];
    const csv = csvLines.join('\n');
    const buffer = Buffer.from(csv, 'utf-8');

    const periodLabel = period === 'week' ? 'week' : period === 'month' ? 'month' : 'all-time';
    const filename = `voice-sessions-${interaction.guildId}-${periodLabel}.csv`;

    return safeEditReply(interaction, {
      content: `📊 Voice session export — **${sessions.length}** sessions (${periodLabel})`,
      files: [{ attachment: buffer, name: filename }],
    });
  } catch (err) {
    logError('Voice export failed', { error: err.message, stack: err.stack });
    return safeEditReply(interaction, {
      content: '❌ Something went wrong exporting voice data.',
    });
  }
}
