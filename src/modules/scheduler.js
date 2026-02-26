/**
 * Scheduled Messages Scheduler
 * Polls for due scheduled messages and sends them.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/42
 */

import { getPool } from '../db.js';
import { info, error as logError, warn as logWarn } from '../logger.js';
import { safeSend } from '../utils/safeSend.js';

/** @type {ReturnType<typeof setInterval> | null} */
let schedulerInterval = null;

/** Re-entrancy guard */
let pollInFlight = false;

/**
 * Parse a 5-field cron expression into its component arrays.
 * Supports: numbers, wildcards (*), and single values.
 *
 * @param {string} cronExpr - 5-field cron expression (minute hour day month weekday)
 * @returns {{ minute: number[], hour: number[], day: number[], month: number[], weekday: number[] }}
 */
export function parseCron(cronExpr) {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }

  const ranges = [
    { min: 0, max: 59 }, // minute
    { min: 0, max: 23 }, // hour
    { min: 1, max: 31 }, // day of month
    { min: 1, max: 12 }, // month
    { min: 0, max: 6 }, // day of week (0 = Sunday)
  ];

  const names = ['minute', 'hour', 'day', 'month', 'weekday'];
  const result = {};

  for (let i = 0; i < 5; i++) {
    const field = fields[i];
    const { min, max } = ranges[i];

    if (field === '*') {
      const arr = [];
      for (let v = min; v <= max; v++) arr.push(v);
      result[names[i]] = arr;
    } else if (field.includes(',')) {
      result[names[i]] = field.split(',').map((v) => {
        const n = Number.parseInt(v, 10);
        if (Number.isNaN(n) || n < min || n > max) {
          throw new Error(`Invalid cron value "${v}" for ${names[i]}`);
        }
        return n;
      });
    } else if (field.includes('-')) {
      const [start, end] = field.split('-').map((v) => Number.parseInt(v, 10));
      if (Number.isNaN(start) || Number.isNaN(end) || start < min || end > max || start > end) {
        throw new Error(`Invalid cron range "${field}" for ${names[i]}`);
      }
      const arr = [];
      for (let v = start; v <= end; v++) arr.push(v);
      result[names[i]] = arr;
    } else if (field.includes('/')) {
      const [base, step] = field.split('/');
      const stepNum = Number.parseInt(step, 10);
      const startNum = base === '*' ? min : Number.parseInt(base, 10);
      if (Number.isNaN(stepNum) || stepNum <= 0 || Number.isNaN(startNum)) {
        throw new Error(`Invalid cron step "${field}" for ${names[i]}`);
      }
      const arr = [];
      for (let v = startNum; v <= max; v += stepNum) arr.push(v);
      result[names[i]] = arr;
    } else {
      const n = Number.parseInt(field, 10);
      if (Number.isNaN(n) || n < min || n > max) {
        throw new Error(`Invalid cron value "${field}" for ${names[i]}`);
      }
      result[names[i]] = [n];
    }
  }

  return result;
}

/**
 * Compute the next run time from a cron expression after a given date.
 *
 * @param {string} cronExpr - 5-field cron expression
 * @param {Date} fromDate - Starting date to search from
 * @returns {Date} Next matching date/time
 */
export function getNextCronRun(cronExpr, fromDate) {
  const cron = parseCron(cronExpr);

  // Start from the next minute after fromDate
  const d = new Date(fromDate.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  // Safety: limit search to 2 years to prevent infinite loops
  const limit = new Date(fromDate.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);

  while (d < limit) {
    if (
      cron.month.includes(d.getMonth() + 1) &&
      cron.day.includes(d.getDate()) &&
      cron.weekday.includes(d.getDay()) &&
      cron.hour.includes(d.getHours()) &&
      cron.minute.includes(d.getMinutes())
    ) {
      return d;
    }

    // Advance by 1 minute
    d.setMinutes(d.getMinutes() + 1);
  }

  throw new Error(`No matching cron time found within 2 years for: ${cronExpr}`);
}

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
        const channel = await client.channels.fetch(msg.channel_id).catch(() => null);
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
  } catch (err) {
    logError('Scheduler poll error', { error: err.message });
  } finally {
    pollInFlight = false;
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
