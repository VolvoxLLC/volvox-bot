/**
 * Reminder Handler Module
 * Checks for due reminders, sends notifications, handles snooze buttons.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/137
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError, warn } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { getNextCronRun } from '../utils/cronParser.js';
import { safeSend } from '../utils/safeSend.js';

/** Snooze durations in milliseconds, keyed by button suffix */
const SNOOZE_DURATIONS = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  tomorrow: 24 * 60 * 60_000,
};

/** Max delivery failures before giving up on a reminder */
const MAX_DELIVERY_RETRIES = 3;

/**
 * Build snooze action row for a fired reminder.
 *
 * @param {number} reminderId - Reminder ID
 * @returns {ActionRowBuilder}
 */
export function buildSnoozeButtons(reminderId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`reminder_snooze_${reminderId}_15m`)
      .setLabel('15m')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`reminder_snooze_${reminderId}_1h`)
      .setLabel('1h')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`reminder_snooze_${reminderId}_tomorrow`)
      .setLabel('Tomorrow')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`reminder_dismiss_${reminderId}`)
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * Build the reminder notification embed.
 *
 * @param {object} reminder - Reminder row from DB
 * @returns {EmbedBuilder}
 */
function buildReminderEmbed(reminder) {
  const embed = new EmbedBuilder()
    .setTitle('⏰ Reminder')
    .setDescription(reminder.message)
    .setColor(0x5865f2)
    .setTimestamp(new Date(reminder.created_at))
    .setFooter({ text: `Reminder #${reminder.id}` });

  if (reminder.snoozed_count > 0) {
    embed.addFields({
      name: 'Snoozed',
      value: `${reminder.snoozed_count} time${reminder.snoozed_count !== 1 ? 's' : ''}`,
      inline: true,
    });
  }

  if (reminder.recurring_cron) {
    embed.addFields({ name: 'Recurring', value: `\`${reminder.recurring_cron}\``, inline: true });
  }

  return embed;
}

/**
 * Send a reminder notification to the user.
 * Tries DM first, falls back to channel mention.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {object} reminder - Reminder row from DB
 * @returns {Promise<boolean>} true if the notification was delivered, false if all attempts failed
 */
async function sendReminderNotification(client, reminder) {
  const embed = buildReminderEmbed(reminder);
  const components = [buildSnoozeButtons(reminder.id)];

  // Try DM first
  try {
    const user = await client.users.fetch(reminder.user_id);
    await user.send({ embeds: [embed], components });
    info('Reminder sent via DM', { reminderId: reminder.id, userId: reminder.user_id });
    return true;
  } catch {
    // DM failed — fall back to channel mention
  }

  // Fallback: channel mention
  try {
    const channel = await client.channels.fetch(reminder.channel_id).catch(() => null);
    if (channel) {
      await safeSend(channel, {
        content: `<@${reminder.user_id}>`,
        embeds: [embed],
        components,
      });
      info('Reminder sent via channel', {
        reminderId: reminder.id,
        channelId: reminder.channel_id,
      });
      return true;
    } else {
      warn('Reminder channel not found', {
        reminderId: reminder.id,
        channelId: reminder.channel_id,
      });
    }
  } catch (err) {
    logError('Failed to send reminder notification', {
      reminderId: reminder.id,
      error: err.message,
    });
  }

  return false;
}

/**
 * Check for due reminders and fire them.
 * Called by the scheduler every 60s.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
export async function checkReminders(client) {
  const pool = getPool();
  if (!pool) return;

  const { rows } = await pool.query(
    'SELECT * FROM reminders WHERE completed = false AND remind_at <= NOW()',
  );

  for (const reminder of rows) {
    try {
      // Check if reminders are enabled for this guild
      const guildConfig = getConfig(reminder.guild_id);
      if (guildConfig.reminders?.enabled === false) {
        info('Reminders disabled for guild, skipping', {
          reminderId: reminder.id,
          guildId: reminder.guild_id,
        });
        continue;
      }

      const delivered = await sendReminderNotification(client, reminder);

      if (!delivered) {
        // Increment failure count and check against retry limit
        const currentCount = reminder.failed_delivery_count ?? 0;
        const newCount = currentCount + 1;

        if (newCount >= MAX_DELIVERY_RETRIES) {
          warn('Reminder delivery failed max times, marking completed', {
            reminderId: reminder.id,
            attempts: newCount,
          });
          await pool.query(
            'UPDATE reminders SET completed = true, failed_delivery_count = $1 WHERE id = $2',
            [newCount, reminder.id],
          );
        } else {
          info('Reminder delivery failed, will retry next poll', {
            reminderId: reminder.id,
            attempt: newCount,
          });
          await pool.query('UPDATE reminders SET failed_delivery_count = $1 WHERE id = $2', [
            newCount,
            reminder.id,
          ]);
        }
        continue;
      }

      if (reminder.recurring_cron) {
        // Recurring: schedule next run, don't mark completed
        try {
          const nextRun = getNextCronRun(reminder.recurring_cron, new Date());
          await pool.query('UPDATE reminders SET remind_at = $1 WHERE id = $2', [
            nextRun.toISOString(),
            reminder.id,
          ]);
          info('Recurring reminder rescheduled', {
            reminderId: reminder.id,
            nextRun: nextRun.toISOString(),
          });
        } catch (cronErr) {
          logError('Invalid recurring cron, marking completed', {
            reminderId: reminder.id,
            cron: reminder.recurring_cron,
            error: cronErr.message,
          });
          await pool.query('UPDATE reminders SET completed = true WHERE id = $1', [reminder.id]);
        }
      } else {
        // One-time: mark completed
        await pool.query('UPDATE reminders SET completed = true WHERE id = $1', [reminder.id]);
      }
    } catch (err) {
      logError('Failed to process reminder', { reminderId: reminder.id, error: err.message });
    }
  }
}

/**
 * Handle a reminder snooze button click.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleReminderSnooze(interaction) {
  const match = interaction.customId.match(/^reminder_snooze_(\d+)_(15m|1h|tomorrow)$/);
  if (!match) return;

  const reminderId = Number.parseInt(match[1], 10);
  const duration = match[2];
  const snoozeMs = SNOOZE_DURATIONS[duration];

  const pool = getPool();
  if (!pool) {
    await interaction.reply({
      content: '❌ Database unavailable. Please try again later.',
      ephemeral: true,
    });
    return;
  }

  const { rows } = await pool.query('SELECT * FROM reminders WHERE id = $1', [reminderId]);

  if (rows.length === 0) {
    await interaction.reply({ content: '❌ Reminder not found.', ephemeral: true });
    return;
  }

  const reminder = rows[0];

  // Verify ownership
  if (reminder.user_id !== interaction.user.id) {
    await interaction.reply({ content: "❌ This isn't your reminder.", ephemeral: true });
    return;
  }

  // Guard: do not reactivate already-completed reminders (stale snooze buttons)
  if (reminder.completed) {
    await interaction.reply({
      content: '❌ This reminder has already been completed.',
      ephemeral: true,
    });
    return;
  }

  const newRemindAt = new Date(Date.now() + snoozeMs);

  await pool.query(
    'UPDATE reminders SET remind_at = $1, completed = false, snoozed_count = snoozed_count + 1 WHERE id = $2',
    [newRemindAt.toISOString(), reminderId],
  );

  const labels = { '15m': '15 minutes', '1h': '1 hour', tomorrow: 'tomorrow' };

  // Update the original message to show it was snoozed
  try {
    await interaction.update({
      content: `💤 Snoozed for ${labels[duration]}. I'll remind you <t:${Math.floor(newRemindAt.getTime() / 1000)}:R>.`,
      embeds: [],
      components: [],
    });
  } catch {
    await interaction.reply({
      content: `💤 Snoozed for ${labels[duration]}. I'll remind you <t:${Math.floor(newRemindAt.getTime() / 1000)}:R>.`,
      ephemeral: true,
    });
  }

  info('Reminder snoozed', { reminderId, duration, userId: interaction.user.id });
}

/**
 * Handle a reminder dismiss button click.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleReminderDismiss(interaction) {
  const match = interaction.customId.match(/^reminder_dismiss_(\d+)$/);
  if (!match) return;

  const reminderId = Number.parseInt(match[1], 10);
  const pool = getPool();
  if (!pool) {
    await interaction.reply({
      content: '❌ Database unavailable. Please try again later.',
      ephemeral: true,
    });
    return;
  }

  const { rows } = await pool.query('SELECT * FROM reminders WHERE id = $1', [reminderId]);

  if (rows.length === 0) {
    await interaction.reply({ content: '❌ Reminder not found.', ephemeral: true });
    return;
  }

  const reminder = rows[0];

  if (reminder.user_id !== interaction.user.id) {
    await interaction.reply({ content: "❌ This isn't your reminder.", ephemeral: true });
    return;
  }

  await pool.query('UPDATE reminders SET completed = true WHERE id = $1', [reminderId]);

  try {
    await interaction.update({
      content: '✅ Reminder dismissed.',
      embeds: [],
      components: [],
    });
  } catch {
    await interaction.reply({ content: '✅ Reminder dismissed.', ephemeral: true });
  }

  info('Reminder dismissed', { reminderId, userId: interaction.user.id });
}
