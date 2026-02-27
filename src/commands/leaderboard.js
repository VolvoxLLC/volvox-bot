/**
 * Leaderboard Command
 * Show the top 10 users by XP in this server.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/45
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { getConfig } from '../modules/config.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Show the top 10 members by XP in this server');

/**
 * Execute the /leaderboard command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply();

  const cfg = getConfig(interaction.guildId);
  if (!cfg?.reputation?.enabled) {
    return safeEditReply(interaction, { content: 'Reputation system is not enabled.' });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT user_id, xp, level
     FROM reputation
     WHERE guild_id = $1
     ORDER BY xp DESC
     LIMIT 10`,
      [interaction.guildId],
    );

    if (rows.length === 0) {
      await safeEditReply(interaction, {
        content: '📭 No one has earned XP yet. Start chatting!',
      });
      return;
    }

    // Resolve display names
    const lines = await Promise.all(
      rows.map(async (row, i) => {
        let displayName = `<@${row.user_id}>`;
        try {
          const member = await interaction.guild.members.fetch(row.user_id);
          displayName = member.displayName;
        } catch {
          // User may have left — fall back to mention
        }
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
        return `${medal} ${displayName} — Level ${row.level} • ${row.xp} XP`;
      }),
    );

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('🏆 XP Leaderboard')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Top ${rows.length} members` })
      .setTimestamp();

    await safeEditReply(interaction, { embeds: [embed] });
  } catch (err) {
    const { error: logError } = await import('../logger.js');
    logError('Leaderboard command failed', { error: err.message, stack: err.stack });
    await safeEditReply(interaction, {
      content: '❌ Something went wrong fetching the leaderboard.',
    });
  }
}
