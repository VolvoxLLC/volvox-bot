/**
 * Challenge Command
 * View today's coding challenge, check your streak, or see the leaderboard.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/52
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info } from '../logger.js';
import {
  buildChallengeButtons,
  buildChallengeEmbed,
  selectTodaysChallenge,
} from '../modules/challengeScheduler.js';
import { getConfig } from '../modules/config.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('challenge')
  .setDescription('Daily coding challenges')
  .addSubcommand((sub) => sub.setName('today').setDescription("Show today's coding challenge"))
  .addSubcommand((sub) =>
    sub.setName('streak').setDescription('Show your solve streak and total solves'),
  )
  .addSubcommand((sub) =>
    sub.setName('leaderboard').setDescription('Top 10 solvers this week and all-time'),
  );

/**
 * Execute the /challenge command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const subcommand = interaction.options.getSubcommand();
  const config = getConfig(interaction.guildId);
  const challengesCfg = config.challenges ?? {};

  if (!challengesCfg.enabled) {
    await safeEditReply(interaction, {
      content: '❌ Daily coding challenges are not enabled on this server.',
    });
    return;
  }

  if (subcommand === 'today') {
    await handleToday(interaction, challengesCfg);
  } else if (subcommand === 'streak') {
    await handleStreak(interaction);
  } else if (subcommand === 'leaderboard') {
    await handleLeaderboard(interaction);
  }
}

/**
 * Handle /challenge today
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {Object} challengesCfg
 */
async function handleToday(interaction, challengesCfg) {
  const pool = getPool();
  const timezone = challengesCfg.timezone ?? 'America/New_York';
  const now = new Date();
  const { challenge, index, dayNumber } = selectTodaysChallenge(now, timezone);

  // Get current solve count
  let solveCount = 0;
  if (pool) {
    const { rows } = await pool.query(
      'SELECT COUNT(*) AS total FROM challenge_solves WHERE guild_id = $1 AND challenge_index = $2',
      [interaction.guildId, index],
    );
    solveCount = Number.parseInt(rows[0].total, 10);
  }

  const embed = buildChallengeEmbed(challenge, dayNumber, solveCount);
  const buttons = buildChallengeButtons(index);

  await safeEditReply(interaction, { embeds: [embed], components: [buttons] });

  info('/challenge today used', {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    dayNumber,
    challengeTitle: challenge.title,
  });
}

/**
 * Handle /challenge streak
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleStreak(interaction) {
  const pool = getPool();
  if (!pool) {
    await safeEditReply(interaction, { content: '❌ Database unavailable.' });
    return;
  }

  const { guildId } = interaction;
  const userId = interaction.user.id;

  // Total solves
  const { rows: totalRows } = await pool.query(
    'SELECT COUNT(*) AS total FROM challenge_solves WHERE guild_id = $1 AND user_id = $2',
    [guildId, userId],
  );
  const totalSolves = Number.parseInt(totalRows[0].total, 10);

  // All solved challenge indices ordered by index to compute streak
  const { rows: solvedRows } = await pool.query(
    `SELECT challenge_index, solved_at
     FROM challenge_solves
     WHERE guild_id = $1 AND user_id = $2
     ORDER BY challenge_index DESC`,
    [guildId, userId],
  );

  // Compute streak: consecutive challenge indices ending at most-recent
  let streak = 0;
  if (solvedRows.length > 0) {
    const indices = solvedRows.map((r) => r.challenge_index);
    streak = 1;
    for (let i = 0; i < indices.length - 1; i++) {
      if (indices[i] - indices[i + 1] === 1) {
        streak++;
      } else {
        break;
      }
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 Challenge Stats — ${interaction.user.displayName}`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      {
        name: '🔥 Current Streak',
        value: `**${streak}** challenge${streak !== 1 ? 's' : ''}`,
        inline: true,
      },
      {
        name: '✅ Total Solved',
        value: `**${totalSolves}** challenge${totalSolves !== 1 ? 's' : ''}`,
        inline: true,
      },
    )
    .setFooter({ text: 'Keep solving to grow your streak!' })
    .setTimestamp();

  await safeEditReply(interaction, { embeds: [embed] });
}

/**
 * Handle /challenge leaderboard
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleLeaderboard(interaction) {
  const pool = getPool();
  if (!pool) {
    await safeEditReply(interaction, { content: '❌ Database unavailable.' });
    return;
  }

  const { guildId } = interaction;

  // All-time top 10
  const { rows: allTimeRows } = await pool.query(
    `SELECT user_id, COUNT(*) AS total
     FROM challenge_solves
     WHERE guild_id = $1
     GROUP BY user_id
     ORDER BY total DESC
     LIMIT 10`,
    [guildId],
  );

  // This week top 10 (last 7 days)
  const { rows: weekRows } = await pool.query(
    `SELECT user_id, COUNT(*) AS total
     FROM challenge_solves
     WHERE guild_id = $1 AND solved_at >= NOW() - INTERVAL '7 days'
     GROUP BY user_id
     ORDER BY total DESC
     LIMIT 10`,
    [guildId],
  );

  const medals = ['🥇', '🥈', '🥉'];

  const formatBoard = (rows) => {
    if (rows.length === 0) return '_No solves yet — be the first!_';
    return rows
      .map((row, i) => {
        const prefix = medals[i] ?? `**${i + 1}.**`;
        return `${prefix} <@${row.user_id}> — **${row.total}** solve${row.total !== 1 ? 's' : ''}`;
      })
      .join('\n');
  };

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('🏆 Challenge Leaderboard')
    .addFields(
      { name: '📅 This Week', value: formatBoard(weekRows) },
      { name: '🌟 All-Time', value: formatBoard(allTimeRows) },
    )
    .setFooter({ text: 'Solve daily challenges to climb the ranks!' })
    .setTimestamp();

  await safeEditReply(interaction, { embeds: [embed] });

  info('/challenge leaderboard used', { userId: interaction.user.id, guildId });
}
