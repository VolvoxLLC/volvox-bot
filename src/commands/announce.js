/**
 * Announce Command
 * Schedule one-time or recurring messages via /announce.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/42
 */

import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, warn } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { getNextCronRun, parseCron } from '../modules/scheduler.js';
import { getPermissionError, isModerator } from '../utils/permissions.js';
import { safeEditReply, safeReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Schedule one-time or recurring messages (Moderator only)')
  .addSubcommand((sub) =>
    sub
      .setName('once')
      .setDescription('Schedule a one-time message')
      .addStringOption((opt) =>
        opt
          .setName('time')
          .setDescription('When to send (e.g. "in 2h", "tomorrow 09:00", "2024-03-15 14:00")')
          .setRequired(true),
      )
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to send in')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('message').setDescription('Message content').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('recurring')
      .setDescription('Schedule a recurring message via cron')
      .addStringOption((opt) =>
        opt
          .setName('cron')
          .setDescription('Cron expression (5 fields: min hour day month weekday)')
          .setRequired(true),
      )
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to send in')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('message').setDescription('Message content').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('List all scheduled messages for this server'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('cancel')
      .setDescription('Cancel a scheduled message by ID')
      .addIntegerOption((opt) =>
        opt.setName('id').setDescription('Scheduled message ID').setRequired(true),
      ),
  );

export const adminOnly = true;

/**
 * Parse a natural-language time string into a Date.
 * Supported formats:
 *   - "in Xh" / "in Xm" / "in XhYm"
 *   - "tomorrow HH:MM"
 *   - "YYYY-MM-DD HH:MM"
 *
 * @param {string} timeStr - Time string to parse
 * @returns {Date|null} Parsed date or null if unrecognized
 */
export function parseTime(timeStr) {
  const str = timeStr.trim().toLowerCase();

  // "in Xh", "in Xm", "in XhYm", "in X hours", "in X minutes"
  const relativeMatch = str.match(
    /^in\s+(?:(\d+)\s*h(?:ours?)?)?(?:\s*(\d+)\s*m(?:in(?:utes?)?)?)?$/,
  );
  if (relativeMatch) {
    const hours = Number.parseInt(relativeMatch[1] || '0', 10);
    const minutes = Number.parseInt(relativeMatch[2] || '0', 10);
    if (hours === 0 && minutes === 0) return null;
    const d = new Date();
    d.setHours(d.getHours() + hours);
    d.setMinutes(d.getMinutes() + minutes);
    return d;
  }

  // "tomorrow HH:MM" or "tomorrow HH"
  const tomorrowMatch = str.match(/^tomorrow\s+(\d{1,2}):?(\d{2})?$/);
  if (tomorrowMatch) {
    const hours = Number.parseInt(tomorrowMatch[1], 10);
    const minutes = Number.parseInt(tomorrowMatch[2] || '0', 10);
    if (hours > 23 || minutes > 59) return null;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hours);
    d.setMinutes(minutes);
    d.setSeconds(0, 0);
    return d;
  }

  // "YYYY-MM-DD HH:MM"
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (isoMatch) {
    const month = Number.parseInt(isoMatch[2], 10);
    const day = Number.parseInt(isoMatch[3], 10);
    const hours = Number.parseInt(isoMatch[4], 10);
    const minutes = Number.parseInt(isoMatch[5], 10);
    const year = Number.parseInt(isoMatch[1], 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hours > 23 || minutes > 59)
      return null;
    const d = new Date(year, month - 1, day, hours, minutes);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  return null;
}

/**
 * Execute the /announce command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const config = getConfig(interaction.guildId);

  if (!isModerator(interaction.member, config)) {
    await safeReply(interaction, {
      content: getPermissionError('announce', 'moderator'),
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();
  const pool = getPool();
  if (!pool) {
    await safeEditReply(interaction, { content: '❌ Database is not available.' });
    return;
  }

  if (subcommand === 'once') {
    await handleOnce(interaction, pool);
  } else if (subcommand === 'recurring') {
    await handleRecurring(interaction, pool);
  } else if (subcommand === 'list') {
    await handleList(interaction, pool);
  } else if (subcommand === 'cancel') {
    await handleCancel(interaction, pool);
  }
}

/**
 * Handle /announce once
 */
async function handleOnce(interaction, pool) {
  const timeStr = interaction.options.getString('time');
  const channel = interaction.options.getChannel('channel');
  const message = interaction.options.getString('message');

  const nextRun = parseTime(timeStr);
  if (!nextRun) {
    await safeEditReply(interaction, {
      content:
        '❌ Could not parse time. Use formats like `in 2h`, `tomorrow 09:00`, or `2024-03-15 14:00`.',
      ephemeral: true,
    });
    return;
  }

  if (nextRun <= new Date()) {
    await safeEditReply(interaction, {
      content: '❌ The scheduled time must be in the future.',
      ephemeral: true,
    });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO scheduled_messages (guild_id, channel_id, content, next_run, author_id, one_time)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id`,
    [interaction.guildId, channel.id, message, nextRun.toISOString(), interaction.user.id],
  );

  info('Scheduled one-time message', {
    id: rows[0].id,
    guildId: interaction.guildId,
    channelId: channel.id,
    nextRun: nextRun.toISOString(),
  });

  await safeEditReply(interaction, {
    content: `✅ Scheduled message **#${rows[0].id}** to <#${channel.id}> at <t:${Math.floor(nextRun.getTime() / 1000)}:F>.`,
    ephemeral: true,
  });
}

/**
 * Handle /announce recurring
 */
async function handleRecurring(interaction, pool) {
  const cronExpr = interaction.options.getString('cron');
  const channel = interaction.options.getChannel('channel');
  const message = interaction.options.getString('message');

  // Validate cron expression
  try {
    parseCron(cronExpr);
  } catch {
    await safeEditReply(interaction, {
      content:
        '❌ Invalid cron expression. Must be 5 fields: `minute hour day month weekday`.\nExamples: `0 9 * * *` (daily 9am), `0 9 * * 1` (Monday 9am)',
      ephemeral: true,
    });
    return;
  }

  let nextRun;
  try {
    nextRun = getNextCronRun(cronExpr, new Date());
  } catch {
    await safeEditReply(interaction, {
      content: '❌ Could not compute next run time from cron expression.',
      ephemeral: true,
    });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO scheduled_messages (guild_id, channel_id, content, cron_expression, next_run, author_id, one_time)
     VALUES ($1, $2, $3, $4, $5, $6, false)
     RETURNING id`,
    [
      interaction.guildId,
      channel.id,
      message,
      cronExpr,
      nextRun.toISOString(),
      interaction.user.id,
    ],
  );

  info('Scheduled recurring message', {
    id: rows[0].id,
    guildId: interaction.guildId,
    channelId: channel.id,
    cron: cronExpr,
    nextRun: nextRun.toISOString(),
  });

  await safeEditReply(interaction, {
    content: `✅ Recurring message **#${rows[0].id}** scheduled to <#${channel.id}>.\nCron: \`${cronExpr}\`\nNext run: <t:${Math.floor(nextRun.getTime() / 1000)}:F>`,
    ephemeral: true,
  });
}

/**
 * Handle /announce list
 */
async function handleList(interaction, pool) {
  const { rows } = await pool.query(
    `SELECT id, channel_id, content, cron_expression, next_run, one_time, author_id, enabled
     FROM scheduled_messages
     WHERE guild_id = $1 AND enabled = true
     ORDER BY next_run ASC`,
    [interaction.guildId],
  );

  if (rows.length === 0) {
    await safeEditReply(interaction, {
      content: '📭 No scheduled messages for this server.',
      ephemeral: true,
    });
    return;
  }

  const header = `📋 **Scheduled Messages (${rows.length})**\n\n`;
  const lines = [];
  let totalLen = header.length;

  for (const row of rows) {
    const type = row.one_time ? '⏰ Once' : `🔁 \`${row.cron_expression}\``;
    const ts = Math.floor(new Date(row.next_run).getTime() / 1000);
    const preview = row.content.length > 50 ? `${row.content.slice(0, 50)}…` : row.content;
    const line = `**#${row.id}** — ${type} → <#${row.channel_id}> — <t:${ts}:R>\n> ${preview}`;

    if (totalLen + line.length + 2 > 1900) {
      lines.push(`… and ${rows.length - lines.length} more`);
      break;
    }
    lines.push(line);
    totalLen += line.length + 2;
  }

  await safeEditReply(interaction, {
    content: `${header}${lines.join('\n\n')}`,
    ephemeral: true,
  });
}

/**
 * Handle /announce cancel
 */
async function handleCancel(interaction, pool) {
  const id = interaction.options.getInteger('id');

  const { rows } = await pool.query(
    'SELECT id, author_id, guild_id FROM scheduled_messages WHERE id = $1 AND guild_id = $2 AND enabled = true',
    [id, interaction.guildId],
  );

  if (rows.length === 0) {
    await safeEditReply(interaction, {
      content: `❌ No active scheduled message with ID **#${id}** found.`,
      ephemeral: true,
    });
    return;
  }

  const msg = rows[0];

  // Allow original author or admin to cancel
  const config = getConfig(interaction.guildId);
  if (msg.author_id !== interaction.user.id && !isModerator(interaction.member, config)) {
    await safeEditReply(interaction, {
      content: '❌ You can only cancel your own scheduled messages unless you are a moderator.',
      ephemeral: true,
    });
    warn('Announce cancel permission denied', {
      userId: interaction.user.id,
      messageId: id,
    });
    return;
  }

  await pool.query('UPDATE scheduled_messages SET enabled = false WHERE id = $1', [id]);

  info('Scheduled message cancelled', { id, cancelledBy: interaction.user.id });

  await safeEditReply(interaction, {
    content: `✅ Scheduled message **#${id}** has been cancelled.`,
    ephemeral: true,
  });
}
