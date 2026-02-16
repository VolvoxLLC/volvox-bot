/**
 * Case Command
 * View, list, update, and delete moderation cases
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { ACTION_COLORS, ACTION_LOG_CHANNEL_KEY } from '../modules/moderation.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('case')
  .setDescription('Manage moderation cases')
  .addSubcommand((sub) =>
    sub
      .setName('view')
      .setDescription('View a case by number')
      .addIntegerOption((opt) =>
        opt.setName('case_id').setDescription('Case number').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List recent cases')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Filter by user').setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('Filter by action type')
          .setRequired(false)
          .addChoices(
            { name: 'warn', value: 'warn' },
            { name: 'kick', value: 'kick' },
            { name: 'timeout', value: 'timeout' },
            { name: 'untimeout', value: 'untimeout' },
            { name: 'ban', value: 'ban' },
            { name: 'tempban', value: 'tempban' },
            { name: 'unban', value: 'unban' },
            { name: 'softban', value: 'softban' },
            { name: 'lock', value: 'lock' },
            { name: 'unlock', value: 'unlock' },
            { name: 'purge', value: 'purge' },
            { name: 'slowmode', value: 'slowmode' },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('reason')
      .setDescription('Update case reason')
      .addIntegerOption((opt) =>
        opt.setName('case_id').setDescription('Case number').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('New reason').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('delete')
      .setDescription('Delete a case')
      .addIntegerOption((opt) =>
        opt.setName('case_id').setDescription('Case number').setRequired(true),
      ),
  );

export const adminOnly = true;

/**
 * Build an embed for a single case row.
 * @param {Object} caseRow - Database row from mod_cases
 * @returns {EmbedBuilder}
 */
function buildCaseEmbed(caseRow) {
  return new EmbedBuilder()
    .setColor(ACTION_COLORS[caseRow.action] || 0x5865f2)
    .setTitle(`Case #${caseRow.case_number} — ${caseRow.action.toUpperCase()}`)
    .addFields(
      { name: 'Target', value: `<@${caseRow.target_id}> (${caseRow.target_tag})`, inline: true },
      {
        name: 'Moderator',
        value: `<@${caseRow.moderator_id}> (${caseRow.moderator_tag})`,
        inline: true,
      },
      { name: 'Reason', value: caseRow.reason || 'No reason provided' },
    )
    .setTimestamp(new Date(caseRow.created_at));
}

/**
 * Execute the case command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case 'view':
        await handleView(interaction);
        break;
      case 'list':
        await handleList(interaction);
        break;
      case 'reason':
        await handleReason(interaction);
        break;
      case 'delete':
        await handleDelete(interaction);
        break;
    }
  } catch (err) {
    logError('Case command failed', { error: err.message, subcommand });
    await safeEditReply(interaction, 'Failed to execute case command.');
  }
}

/**
 * Handle /case view
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleView(interaction) {
  const caseId = interaction.options.getInteger('case_id');
  const pool = getPool();

  const { rows } = await pool.query(
    'SELECT * FROM mod_cases WHERE guild_id = $1 AND case_number = $2',
    [interaction.guild.id, caseId],
  );

  if (rows.length === 0) {
    return await safeEditReply(interaction, `Case #${caseId} not found.`);
  }

  const embed = buildCaseEmbed(rows[0]);
  await safeEditReply(interaction, { embeds: [embed] });
}

/**
 * Handle /case list
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleList(interaction) {
  const user = interaction.options.getUser('user');
  const type = interaction.options.getString('type');
  const pool = getPool();

  let query = 'SELECT * FROM mod_cases WHERE guild_id = $1';
  const params = [interaction.guild.id];
  let paramIndex = 2;

  if (user) {
    query += ` AND target_id = $${paramIndex}`;
    params.push(user.id);
    paramIndex++;
  }

  if (type) {
    query += ` AND action = $${paramIndex}`;
    params.push(type);
    paramIndex++;
  }

  query += ' ORDER BY created_at DESC LIMIT 10';

  const { rows } = await pool.query(query, params);

  if (rows.length === 0) {
    return await safeEditReply(interaction, 'No cases found matching the criteria.');
  }

  const lines = rows.map((row) => {
    const timestamp = Math.floor(new Date(row.created_at).getTime() / 1000);
    const reason = row.reason
      ? row.reason.length > 50
        ? `${row.reason.slice(0, 47)}...`
        : row.reason
      : 'No reason';
    return `**#${row.case_number}** — ${row.action.toUpperCase()} — <@${row.target_id}> — <t:${timestamp}:R> — ${reason}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Moderation Cases')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Showing ${rows.length} case(s)` })
    .setTimestamp();

  await safeEditReply(interaction, { embeds: [embed] });
}

/**
 * Handle /case reason
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleReason(interaction) {
  const caseId = interaction.options.getInteger('case_id');
  const reason = interaction.options.getString('reason');
  const pool = getPool();

  const { rows } = await pool.query(
    'UPDATE mod_cases SET reason = $1 WHERE guild_id = $2 AND case_number = $3 RETURNING *',
    [reason, interaction.guild.id, caseId],
  );

  if (rows.length === 0) {
    return await safeEditReply(interaction, `Case #${caseId} not found.`);
  }

  const caseRow = rows[0];

  // Try to edit the log message if it exists
  if (caseRow.log_message_id) {
    try {
      const config = getConfig();
      const channels = config.moderation?.logging?.channels;
      if (channels) {
        const channelKey = ACTION_LOG_CHANNEL_KEY[caseRow.action];
        const logChannelId = channels[channelKey] || channels.default;
        if (logChannelId) {
          const logChannel = await interaction.client.channels
            .fetch(logChannelId)
            .catch(() => null);
          if (logChannel) {
            const logMessage = await logChannel.messages
              .fetch(caseRow.log_message_id)
              .catch(() => null);
            if (logMessage) {
              const embed = buildCaseEmbed(caseRow);
              await logMessage.edit({ embeds: [embed] });
            }
          }
        }
      }
    } catch (err) {
      logError('Failed to edit log message', { error: err.message, caseId });
    }
  }

  info('Case reason updated', {
    guildId: interaction.guild.id,
    caseNumber: caseId,
    moderator: interaction.user.tag,
  });

  await safeEditReply(interaction, `Updated reason for case #${caseId}.`);
}

/**
 * Handle /case delete
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleDelete(interaction) {
  const caseId = interaction.options.getInteger('case_id');
  const pool = getPool();

  const { rows } = await pool.query(
    'DELETE FROM mod_cases WHERE guild_id = $1 AND case_number = $2 RETURNING *',
    [interaction.guild.id, caseId],
  );

  if (rows.length === 0) {
    return await safeEditReply(interaction, `Case #${caseId} not found.`);
  }

  info('Case deleted', {
    guildId: interaction.guild.id,
    caseNumber: caseId,
    moderator: interaction.user.tag,
  });

  await safeEditReply(interaction, `Deleted case #${caseId} (${rows[0].action}).`);
}
