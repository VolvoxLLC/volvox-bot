/**
 * Rank Command
 * Show a user's level, XP, and progress bar.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/45
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { getConfig } from '../modules/config.js';
import { buildProgressBar, computeLevel } from '../modules/reputation.js';
import { REPUTATION_DEFAULTS } from '../modules/reputationDefaults.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription("Show your (or another user's) level and XP")
  .addUserOption((opt) =>
    opt.setName('user').setDescription('User to look up (defaults to you)').setRequired(false),
  );

/**
 * Execute the /rank command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply();

  const pool = getPool();
  if (!pool) {
    await safeEditReply(interaction, { content: '❌ Database is not available.' });
    return;
  }

  try {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const cfg = getConfig(interaction.guildId);
    const repCfg = { ...REPUTATION_DEFAULTS, ...cfg.reputation };
    const thresholds = repCfg.levelThresholds;

    // Fetch reputation row
    const { rows } = await pool.query(
      'SELECT xp, level, messages_count FROM reputation WHERE guild_id = $1 AND user_id = $2',
      [interaction.guildId, target.id],
    );

    const xp = rows[0]?.xp ?? 0;
    const level = computeLevel(xp, thresholds);
    const messagesCount = rows[0]?.messages_count ?? 0;

    // XP within current level and needed for next
    const currentThreshold = level > 0 ? thresholds[level - 1] : 0;
    const nextThreshold = thresholds[level] ?? null; // null = max level

    const xpInLevel = xp - currentThreshold;
    const xpNeeded = nextThreshold !== null ? nextThreshold - currentThreshold : 0;
    const progressBar =
      nextThreshold !== null ? buildProgressBar(xpInLevel, xpNeeded) : '▓'.repeat(10) + ' MAX';

    // Rank position in guild
    const rankRow = await pool.query(
      `SELECT COUNT(*) + 1 AS rank
     FROM reputation
     WHERE guild_id = $1 AND xp > $2`,
      [interaction.guildId, xp],
    );
    const rank = Number(rankRow.rows[0]?.rank ?? 1);

    const levelLabel = `Level ${level}`;
    const xpLabel = nextThreshold !== null ? `${xp} / ${nextThreshold} XP` : `${xp} XP (Max Level)`;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: target.displayName ?? target.username,
        iconURL: target.displayAvatarURL({ dynamic: true }),
      })
      .setTitle(`🏆 ${levelLabel}`)
      .addFields(
        { name: 'XP', value: xpLabel, inline: true },
        { name: 'Server Rank', value: `#${rank}`, inline: true },
        { name: 'Messages', value: String(messagesCount), inline: true },
        {
          name: nextThreshold !== null ? `Progress to Level ${level + 1}` : 'Progress',
          value: progressBar,
          inline: false,
        },
      )
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    await safeEditReply(interaction, { embeds: [embed] });
  } catch (err) {
    const { error: logError } = await import('../logger.js');
    logError('Rank command failed', { error: err.message, stack: err.stack });
    await safeEditReply(interaction, { content: '❌ Something went wrong fetching your rank.' });
  }
}
