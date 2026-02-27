/**
 * AFK Command
 * Let members set an AFK status. When mentioned while away, the bot
 * sends a notice. On return, the user receives a ping summary.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/46
 */

import { SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { safeReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('afk')
  .setDescription('Set or clear your AFK status')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Mark yourself as AFK')
      .addStringOption((opt) =>
        opt
          .setName('reason')
          .setDescription('Why are you AFK? (default: AFK)')
          .setRequired(false)
          .setMaxLength(200),
      ),
  )
  .addSubcommand((sub) => sub.setName('clear').setDescription('Clear your AFK status manually'));

// ── Subcommand handlers ────────────────────────────────────────────

async function handleSet(interaction) {
  const reason = interaction.options.getString('reason') || 'AFK';
  const pool = getPool();

  await pool.query(
    `INSERT INTO afk_status (guild_id, user_id, reason, set_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (guild_id, user_id) DO UPDATE
       SET reason = EXCLUDED.reason, set_at = NOW()`,
    [interaction.guildId, interaction.user.id, reason],
  );

  info('AFK set', { guildId: interaction.guildId, userId: interaction.user.id, reason });

  await safeReply(interaction, {
    content: `💤 You are now AFK: *${reason}*`,
    ephemeral: true,
  });
}

async function handleClear(interaction) {
  const pool = getPool();

  const { rows: afkRows } = await pool.query(
    'SELECT * FROM afk_status WHERE guild_id = $1 AND user_id = $2',
    [interaction.guildId, interaction.user.id],
  );

  if (afkRows.length === 0) {
    return await safeReply(interaction, {
      content: "ℹ️ You're not AFK right now.",
      ephemeral: true,
    });
  }

  // Fetch ping summary before deleting
  const { rows: pings } = await pool.query(
    `SELECT pinger_id, channel_id, message_preview, pinged_at
     FROM afk_pings
     WHERE guild_id = $1 AND afk_user_id = $2
     ORDER BY pinged_at ASC`,
    [interaction.guildId, interaction.user.id],
  );

  // Delete AFK record and pings atomically
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM afk_status WHERE guild_id = $1 AND user_id = $2', [
      interaction.guildId,
      interaction.user.id,
    ]);
    await client.query('DELETE FROM afk_pings WHERE guild_id = $1 AND afk_user_id = $2', [
      interaction.guildId,
      interaction.user.id,
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  info('AFK cleared (manual)', { guildId: interaction.guildId, userId: interaction.user.id });

  const summary = buildPingSummary(pings);
  await safeReply(interaction, {
    content: `✅ AFK cleared!${summary}`,
    ephemeral: true,
  });
}

/**
 * Build a human-readable ping summary from ping rows.
 * @param {Array} pings
 * @returns {string}
 */
export function buildPingSummary(pings) {
  if (pings.length === 0) return '\n\nNo one pinged you while you were away.';

  const lines = pings.slice(0, 10).map((p) => {
    const time = `<t:${Math.floor(new Date(p.pinged_at).getTime() / 1000)}:R>`;
    const preview = p.message_preview ? ` — "${p.message_preview}"` : '';
    return `• <@${p.pinger_id}> in <#${p.channel_id}> ${time}${preview}`;
  });

  const extra = pings.length > 10 ? `\n…and ${pings.length - 10} more.` : '';
  return `\n\n**Pings while AFK (${pings.length}):**\n${lines.join('\n')}${extra}`;
}

// ── Execute ────────────────────────────────────────────────────────

/**
 * Execute the afk command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const guildConfig = getConfig(interaction.guildId);

  if (!guildConfig.afk?.enabled) {
    return await safeReply(interaction, {
      content: '❌ The AFK feature is not enabled on this server.',
      ephemeral: true,
    });
  }

  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case 'set':
        await handleSet(interaction);
        break;
      case 'clear':
        await handleClear(interaction);
        break;
    }
  } catch (err) {
    logError('AFK command failed', { error: err.message, stack: err.stack, subcommand });
    await safeReply(interaction, {
      content: '❌ Failed to execute AFK command.',
      ephemeral: true,
    });
  }
}
