/**
 * Database Maintenance Utilities
 *
 * Purges stale data to keep the database healthy:
 * - Closed tickets past the retention period
 * - Any other time-bounded cleanup tasks
 *
 * Hook: called from scheduler every 60th tick (once per hour).
 */

import { info, error as logError, warn } from '../logger.js';

/** Default retention period for closed tickets (days) */
const TICKET_RETENTION_DAYS = parseInt(process.env.TICKET_RETENTION_DAYS, 10) || 30;

/**
 * Purge closed tickets older than the configured retention period.
 *
 * @param {import('pg').Pool} pool - Database connection pool
 * @returns {Promise<number>} Number of tickets purged
 */
async function purgeOldTickets(pool) {
  try {
    const result = await pool.query(
      `DELETE FROM tickets
       WHERE status = 'closed'
         AND updated_at < NOW() - make_interval(days => $1)`,
      [TICKET_RETENTION_DAYS],
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      info('DB maintenance: purged old closed tickets', {
        count,
        retention_days: TICKET_RETENTION_DAYS,
        source: 'db_maintenance',
      });
    }
    return count;
  } catch (err) {
    // Table may not exist — warn and continue
    if (err.code === '42P01') {
      warn('DB maintenance: tickets table does not exist, skipping', { source: 'db_maintenance' });
      return 0;
    }
    throw err;
  }
}

/**
 * Purge expired sessions from the database (if sessions are stored in DB).
 *
 * @param {import('pg').Pool} pool - Database connection pool
 * @returns {Promise<number>} Number of sessions purged
 */
async function purgeExpiredSessions(pool) {
  try {
    const result = await pool.query(`DELETE FROM sessions WHERE expire < NOW()`);
    const count = result.rowCount ?? 0;
    if (count > 0) {
      info('DB maintenance: purged expired sessions', {
        count,
        source: 'db_maintenance',
      });
    }
    return count;
  } catch (err) {
    if (err.code === '42P01') {
      warn('DB maintenance: sessions table does not exist, skipping', { source: 'db_maintenance' });
      return 0;
    }
    throw err;
  }
}

/**
 * Purge rate limit entries older than 24 hours (if rate limits are stored in DB).
 *
 * @param {import('pg').Pool} pool - Database connection pool
 * @returns {Promise<number>} Number of entries purged
 */
async function purgeStaleRateLimits(pool) {
  try {
    const result = await pool.query(
      `DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '24 hours'`,
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      info('DB maintenance: purged stale rate limit entries', {
        count,
        source: 'db_maintenance',
      });
    }
    return count;
  } catch (err) {
    if (err.code === '42P01') {
      warn('DB maintenance: rate_limits table does not exist, skipping', { source: 'db_maintenance' });
      return 0;
    }
    throw err;
  }
}

/**
 * Run all maintenance tasks.
 *
 * @param {import('pg').Pool} pool - Database connection pool
 * @returns {Promise<void>}
 */
export async function runMaintenance(pool) {
  info('DB maintenance: starting routine cleanup', { source: 'db_maintenance' });

  try {
    await Promise.all([
      purgeOldTickets(pool),
      purgeExpiredSessions(pool),
      purgeStaleRateLimits(pool),
    ]);
    info('DB maintenance: cleanup complete', { source: 'db_maintenance' });
  } catch (err) {
    logError('DB maintenance: error during cleanup', {
      error: err.message,
      source: 'db_maintenance',
    });
  }
}
