/**
 * Profile Command
 * Show a user's engagement stats (messages, reactions, days active).
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/44
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { safeEditReply } from '../utils/safeSend.js';

/**
 * Return an activity badge based on days_active.
 *
 * @param {number} daysActive
 * @returns {string}
 */
export function getActivityBadge(daysActive) {
  if (daysActive >= 90) return '👑 Legend';
  if (daysActive >= 30) return '🌳 Veteran';
  if (daysActive >= 7) return '🌿 Regular';
  return '🌱 Newcomer';
}

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription("Show your (or another user's) engagement profile")
  .addUserOption((opt) =>
    opt.setName('user').setDescription('User to look up (defaults to you)').setRequired(false),
  );

/**
 * Execute the /profile command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply();

  if (!interaction.guildId) {
    return safeEditReply(interaction, { content: '❌ This command can only be used in a server.' });
  }

  const config = getConfig(interaction.guildId);
  if (!config?.engagement?.enabled) {
    return safeEditReply(interaction, {
      content: '❌ Engagement tracking is not enabled on this server.',
    });
  }

  try {
    const pool = getPool();
    const target = interaction.options.getUser('user') ?? interaction.user;

    const { rows } = await pool.query(
      `SELECT messages_sent, reactions_given, reactions_received, days_active, first_seen, last_active
       FROM user_stats
       WHERE guild_id = $1 AND user_id = $2`,
      [interaction.guildId, target.id],
    );

    const stats = rows[0] ?? {
      messages_sent: 0,
      reactions_given: 0,
      reactions_received: 0,
      days_active: 0,
      first_seen: null,
      last_active: null,
    };

    const badge = getActivityBadge(stats.days_active);

    const formatDate = (d) =>
      d ? new Date(d).toLocaleDateString('en-US', { dateStyle: 'medium' }) : 'Never';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: target.displayName ?? target.username,
        iconURL: target.displayAvatarURL(),
      })
      .addFields(
        { name: 'Messages Sent', value: String(stats.messages_sent), inline: true },
        { name: 'Reactions Given', value: String(stats.reactions_given), inline: true },
        { name: 'Reactions Received', value: String(stats.reactions_received), inline: true },
        { name: 'Days Active', value: String(stats.days_active), inline: true },
        { name: 'Activity Badge', value: badge, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: 'First Seen', value: formatDate(stats.first_seen), inline: true },
        { name: 'Last Active', value: formatDate(stats.last_active), inline: true },
      )
      .setThumbnail(target.displayAvatarURL())
      .setTimestamp();

    await safeEditReply(interaction, { embeds: [embed] });
  } catch (err) {
    logError('Profile command failed', { error: err.message, stack: err.stack });
    await safeEditReply(interaction, { content: '❌ Something went wrong fetching the profile.' });
  }
}
