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

/** Track optional tables we've already warned about to avoid hourly log spam */
const warnedMissingOptionalTables = new Set();

/**
 * Warn once when an optional table is missing.
 *
 * @param {string} tableName - Table name
 */
function warnMissingOptionalTableOnce(tableName) {
  if (warnedMissingOptionalTables.has(tableName)) return;
  warnedMissingOptionalTables.add(tableName);
  warn(`DB maintenance: ${tableName} table does not exist, skipping`, {
    source: 'db_maintenance',
  });
}

/**
 * Parse and validate TICKET_RETENTION_DAYS.
 * - Valid non-negative integers (including 0) are used as-is.
 * - NaN, non-finite, or negative values fall back to the default (30 days).
 *
 * @param {string | undefined} raw - Raw env var value
 * @returns {number} Validated retention period in days
 */
function parseRetentionDays(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

/** Retention period for closed tickets in days (default: 30) */
const TICKET_RETENTION_DAYS = parseRetentionDays(process.env.TICKET_RETENTION_DAYS);

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
         AND closed_at < NOW() - make_interval(days => $1)`,
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
      warnMissingOptionalTableOnce('sessions');
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
      warnMissingOptionalTableOnce('rate_limits');
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
