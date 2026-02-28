/**
 * Remind Command
 * Personal reminder system with natural language time parsing.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/137
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError, warn } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { safeEditReply } from '../utils/safeSend.js';
import { parseTimeAndMessage } from '../utils/timeParser.js';

export const data = new SlashCommandBuilder()
  .setName('remind')
  .setDescription('Set personal reminders')
  .addSubcommand((sub) =>
    sub
      .setName('me')
      .setDescription('Set a reminder')
      .addStringOption((opt) =>
        opt
          .setName('when')
          .setDescription('When to remind you (e.g. "in 2 hours", "tomorrow at 3pm", "5m")')
          .setMaxLength(200)
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('message')
          .setDescription('What to remind you about')
          .setMaxLength(1000)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List your active reminders'))
  .addSubcommand((sub) =>
    sub
      .setName('cancel')
      .setDescription('Cancel a reminder')
      .addIntegerOption((opt) =>
        opt.setName('id').setDescription('Reminder ID to cancel').setRequired(true),
      ),
  );

/**
 * Execute the /remind command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  // Config gate
  const guildConfig = getConfig(interaction.guildId);
  if (!guildConfig.reminders?.enabled) {
    await interaction.reply({
      content: '❌ Reminders are not enabled on this server.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const pool = getPool();
  if (!pool) {
    await safeEditReply(interaction, { content: '❌ Database is not available.' });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'me') {
    await handleMe(interaction, pool, guildConfig);
  } else if (subcommand === 'list') {
    await handleList(interaction, pool);
  } else if (subcommand === 'cancel') {
    await handleCancel(interaction, pool);
  }
}

/**
 * Safely roll back an open transaction, ignoring rollback errors.
 *
 * @param {import('pg').PoolClient | undefined} client
 */
async function rollbackQuietly(client) {
  if (!client) {
    return;
  }

  try {
    await client.query('ROLLBACK');
  } catch {
    // Ignore rollback errors; original failure is what we care about.
  }
}

/**
 * Handle /remind me <when> <message>
 */
async function handleMe(interaction, pool, guildConfig) {
  const whenInput = interaction.options.getString('when');
  const messageInput = interaction.options.getString('message');

  // Parse time
  const parsed = parseTimeAndMessage(whenInput);
  if (!parsed) {
    await safeEditReply(interaction, {
      content:
        '❌ Could not understand that time. Try:\n' +
        '• `in 5 minutes`, `in 2 hours`, `in 1 day`\n' +
        '• `tomorrow`, `tomorrow at 3pm`\n' +
        '• `next monday`, `next friday at 9am`\n' +
        '• `5m`, `2h`, `1d`, `30s`',
    });
    return;
  }

  // Use the message from the message option; if the time input had trailing text, prepend it
  const reminderMessage = parsed.message
    ? `${parsed.message} ${messageInput}`.trim()
    : messageInput;

  // Validate: remind_at must be in the future
  if (parsed.date.getTime() <= Date.now()) {
    await safeEditReply(interaction, {
      content: '❌ That time is in the past. Please specify a future time.',
    });
    return;
  }

  const maxPerUser = guildConfig.reminders?.maxPerUser ?? 25;
  let reminder = null;
  let limitReached = false;
  /** @type {import('pg').PoolClient | undefined} */
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Serialize reminder creation per guild/user to avoid race conditions where
    // concurrent requests bypass the per-user max reminders limit.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
      interaction.guildId,
      interaction.user.id,
    ]);

    const { rows: countRows } = await client.query(
      'SELECT COUNT(*) as count FROM reminders WHERE guild_id = $1 AND user_id = $2 AND completed = false',
      [interaction.guildId, interaction.user.id],
    );

    const activeCount = Number.parseInt(countRows[0]?.count ?? '0', 10);
    if (activeCount >= maxPerUser) {
      limitReached = true;
      await client.query('ROLLBACK');
    } else {
      const { rows } = await client.query(
        `INSERT INTO reminders (guild_id, user_id, channel_id, message, remind_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          interaction.guildId,
          interaction.user.id,
          interaction.channelId,
          reminderMessage,
          parsed.date.toISOString(),
        ],
      );
      reminder = rows[0] ?? null;
      await client.query('COMMIT');
    }
  } catch (err) {
    await rollbackQuietly(client);

    logError('Failed to create reminder', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      error: err instanceof Error ? err.message : String(err),
    });

    await safeEditReply(interaction, {
      content: '❌ Something went wrong while creating your reminder. Please try again.',
    });
    return;
  } finally {
    client?.release();
  }

  if (limitReached) {
    await safeEditReply(interaction, {
      content: `❌ You've reached the maximum of ${maxPerUser} active reminders. Cancel some first.`,
    });
    return;
  }

  if (!reminder) {
    logError('Reminder insert returned no row', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
    await safeEditReply(interaction, {
      content: '❌ Something went wrong while creating your reminder. Please try again.',
    });
    return;
  }

  const timestamp = Math.floor(parsed.date.getTime() / 1000);

  await safeEditReply(interaction, {
    content: `✅ Reminder **#${reminder.id}** set! I'll remind you <t:${timestamp}:R> (<t:${timestamp}:f>).\n> ${reminderMessage}`,
  });

  info('Reminder created', {
    reminderId: reminder.id,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    remindAt: parsed.date.toISOString(),
  });
}

/**
 * Handle /remind list
 */
async function handleList(interaction, pool) {
  let rows;

  try {
    const result = await pool.query(
      `SELECT id, message, remind_at, recurring_cron, snoozed_count, created_at
       FROM reminders
       WHERE guild_id = $1 AND user_id = $2 AND completed = false
       ORDER BY remind_at ASC`,
      [interaction.guildId, interaction.user.id],
    );
    rows = result.rows;
  } catch (err) {
    logError('Failed to list reminders', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      error: err instanceof Error ? err.message : String(err),
    });

    await safeEditReply(interaction, {
      content: '❌ Something went wrong while fetching your reminders. Please try again.',
    });
    return;
  }

  if (rows.length === 0) {
    await safeEditReply(interaction, {
      content: '📭 You have no active reminders.',
    });
    return;
  }

  const lines = rows.map((r) => {
    const ts = Math.floor(new Date(r.remind_at).getTime() / 1000);
    const preview = r.message.length > 60 ? `${r.message.slice(0, 57)}…` : r.message;
    let line = `**#${r.id}** — <t:${ts}:R>\n> ${preview}`;
    if (r.recurring_cron) line += `\n> 🔁 Recurring: \`${r.recurring_cron}\``;
    if (r.snoozed_count > 0) line += `\n> 💤 Snoozed ${r.snoozed_count}x`;
    return line;
  });

  const embed = new EmbedBuilder()
    .setTitle(`⏰ Your Reminders (${rows.length})`)
    .setDescription(lines.join('\n\n'))
    .setColor(0x5865f2)
    .setFooter({ text: 'Use /remind cancel <id> to remove a reminder' });

  await safeEditReply(interaction, { embeds: [embed] });
}

/**
 * Handle /remind cancel <id>
 */
async function handleCancel(interaction, pool) {
  const reminderId = interaction.options.getInteger('id');

  try {
    const { rows } = await pool.query(
      'SELECT * FROM reminders WHERE id = $1 AND guild_id = $2 AND completed = false',
      [reminderId, interaction.guildId],
    );

    if (rows.length === 0) {
      await safeEditReply(interaction, {
        content: `❌ No active reminder with ID **#${reminderId}** found.`,
      });
      return;
    }

    const reminder = rows[0];

    // Verify ownership
    if (reminder.user_id !== interaction.user.id) {
      await safeEditReply(interaction, {
        content: '❌ You can only cancel your own reminders.',
      });
      warn('Reminder cancel permission denied', {
        userId: interaction.user.id,
        reminderId,
        ownerId: reminder.user_id,
      });
      return;
    }

    await pool.query('UPDATE reminders SET completed = true WHERE id = $1', [reminderId]);

    await safeEditReply(interaction, {
      content: `✅ Reminder **#${reminderId}** cancelled.`,
    });

    info('Reminder cancelled', { reminderId, userId: interaction.user.id });
  } catch (err) {
    logError('Failed to cancel reminder', {
      reminderId,
      userId: interaction.user.id,
      guildId: interaction.guildId,
      error: err instanceof Error ? err.message : String(err),
    });

    await safeEditReply(interaction, {
      content: '❌ Something went wrong while cancelling your reminder. Please try again.',
    });
  }
}
