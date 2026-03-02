/**
 * Scheduled Messages Scheduler
 * Polls for due scheduled messages and sends them.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/42
 */

import { getPool } from '../db.js';
import { info, error as logError, warn as logWarn } from '../logger.js';
import { getNextCronRun, parseCron } from '../utils/cronParser.js';
import { runMaintenance } from '../utils/dbMaintenance.js';
import { fetchChannelCached } from '../utils/discordCache.js';
import { safeSend } from '../utils/safeSend.js';
import { checkDailyChallenge } from './challengeScheduler.js';
import { getConfig } from './config.js';
import { closeExpiredPolls } from './pollHandler.js';
import { checkReminders } from './reminderHandler.js';
import { expireStaleReviews } from './reviewHandler.js';
import { checkAutoClose } from './ticketHandler.js';

// Re-export for backward compatibility (tests import these from scheduler.js)
export { getNextCronRun, parseCron };

/** @type {ReturnType<typeof setInterval> | null} */
let schedulerInterval = null;

/** Re-entrancy guard */
let pollInFlight = false;

/** Tick counter for throttling heavy tasks */
let tickCount = 0;

/**
 * Poll for due scheduled messages and send them.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
async function pollScheduledMessages(client) {
  if (pollInFlight) return;
  pollInFlight = true;

  try {
    const pool = getPool();

    const { rows } = await pool.query(
      'SELECT * FROM scheduled_messages WHERE enabled = true AND next_run <= NOW()',
    );

    for (const msg of rows) {
      try {
        const channel = await fetchChannelCached(client, msg.channel_id);
        if (!channel) {
          logWarn('Scheduled message channel not found', {
            id: msg.id,
            channelId: msg.channel_id,
          });
          continue;
        }

        await safeSend(channel, { content: msg.content });
        info('Scheduled message sent', { id: msg.id, channelId: msg.channel_id });

        if (msg.one_time) {
          await pool.query('UPDATE scheduled_messages SET enabled = false WHERE id = $1', [msg.id]);
        } else if (msg.cron_expression) {
          try {
            const nextRun = getNextCronRun(msg.cron_expression, new Date());
            await pool.query('UPDATE scheduled_messages SET next_run = $1 WHERE id = $2', [
              nextRun.toISOString(),
              msg.id,
            ]);
          } catch (cronErr) {
            logError('Invalid cron expression, disabling message', {
              id: msg.id,
              cron: msg.cron_expression,
              error: cronErr.message,
            });
            await pool.query('UPDATE scheduled_messages SET enabled = false WHERE id = $1', [
              msg.id,
            ]);
          }
        }
      } catch (err) {
        logError('Failed to send scheduled message', {
          id: msg.id,
          error: err.message,
        });
      }
    }
    // Close expired polls
    await closeExpiredPolls(client);
    // Check and fire due reminders
    await checkReminders(client);

    // Check and post daily coding challenges
    await checkDailyChallenge(client);
    // Expire stale review requests
    await expireStaleReviews(client);
    // Auto-close inactive support tickets (every 5 minutes / 5th tick)
    tickCount++;
    if (tickCount % 5 === 0) {
      await checkAutoClose(client);
    }
    // DB maintenance once per hour (every 60th tick)
    if (tickCount % 60 === 0) {
      void runMaintenance(pool).catch((err) => {
        logError('DB maintenance task failed', { error: err.message });
      });
    }
    // Purge expired audit log entries (every 6 hours / 360th tick)
    if (tickCount % 360 === 0) {
      await purgeExpiredAuditLogs();
    }
  } catch (err) {
    logError('Scheduler poll error', { error: err.message });
  } finally {
    pollInFlight = false;
  }
}

/**
 * Purge audit log entries older than the configured retention period.
 * Runs as a periodic maintenance task within the scheduler.
 */
async function purgeExpiredAuditLogs() {
  try {
    const pool = getPool();
    const config = getConfig();
    const retentionDays = Number(config?.auditLog?.retentionDays);
    if (!retentionDays || retentionDays <= 0 || !Number.isFinite(retentionDays)) return;

    const { rowCount } = await pool.query(
      'DELETE FROM audit_logs WHERE created_at < NOW() - make_interval(days => $1)',
      [retentionDays],
    );

    if (rowCount > 0) {
      info('Purged expired audit log entries', { deleted: rowCount, retentionDays });
    }
  } catch (err) {
    logError('Failed to purge audit log entries', { error: err.message });
  }
}

/**
 * Start the scheduled message polling interval.
 * Polls every 60 seconds for due messages.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
export function startScheduler(client) {
  if (schedulerInterval) return;

  // Immediate check on startup
  pollScheduledMessages(client).catch((err) => {
    logError('Initial scheduler poll failed', { error: err.message });
  });

  schedulerInterval = setInterval(() => {
    pollScheduledMessages(client).catch((err) => {
      logError('Scheduler poll failed', { error: err.message });
    });
  }, 60_000);

  info('Scheduled messages scheduler started');
}

/**
 * Stop the scheduler.
 */
export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    info('Scheduled messages scheduler stopped');
  }
}
