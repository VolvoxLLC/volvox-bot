/**
 * History Command
 * View moderation history for a user
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('history')
  .setDescription('View moderation history for a user')
  .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true));

export const adminOnly = true;

/**
 * Execute the history command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser('user');
  const pool = getPool();

  try {
    const { rows } = await pool.query(
      'SELECT * FROM mod_cases WHERE guild_id = $1 AND target_id = $2 ORDER BY created_at DESC LIMIT 25',
      [interaction.guild.id, user.id],
    );

    if (rows.length === 0) {
      return await interaction.editReply(`No moderation history found for ${user.tag}.`);
    }

    const lines = rows.map((row) => {
      const timestamp = Math.floor(new Date(row.created_at).getTime() / 1000);
      const reason = row.reason
        ? row.reason.length > 40
          ? `${row.reason.slice(0, 37)}...`
          : row.reason
        : 'No reason';
      return `**#${row.case_number}** — ${row.action.toUpperCase()} — <t:${timestamp}:R> — ${reason}`;
    });

    // Count actions by type
    const counts = {};
    for (const row of rows) {
      counts[row.action] = (counts[row.action] || 0) + 1;
    }
    const summary = Object.entries(counts)
      .map(([action, count]) => `${action}: ${count}`)
      .join(' | ');

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Moderation History — ${user.tag}`)
      .setDescription(lines.join('\n'))
      .addFields({ name: 'Summary', value: summary })
      .setFooter({ text: `${rows.length} case(s) shown (max 25)` })
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp();

    info('History viewed', {
      guildId: interaction.guild.id,
      target: user.tag,
      moderator: interaction.user.tag,
      caseCount: rows.length,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Command error', { error: err.message, command: 'history' });
    await interaction.editReply('❌ Failed to fetch moderation history.');
  }
}
