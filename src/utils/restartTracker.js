/**
 * Restart Tracker
 *
 * Records bot restarts to PostgreSQL and exposes query helpers
 * for the dashboard to display restart history.
 */

import { info, error as logError, warn } from '../logger.js';

/** @type {number|null} Startup timestamp in ms for uptime calculation */
let startedAt = null;

/** @type {number|null} ID of the most recently inserted restart row */
let lastRestartId = null;

/**
 * Record a restart event in the bot_restarts table and update in-memory restart state.
 *
 * Sets the module's start timestamp and inserts a row with the provided reason and version.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool.
 * @param {string} [reason='startup'] - Human-readable restart reason.
 * @param {string|null} [version=null] - Bot version string (e.g. from package.json).
 * @returns {Promise<number|null>} The new row ID if insertion succeeded, or `null` on failure.
 */
export async function recordRestart(pool, reason = 'startup', version = null) {
  startedAt = Date.now();

  try {
    const result = await pool.query(
      `INSERT INTO bot_restarts (reason, version) VALUES ($1, $2) RETURNING id`,
      [reason, version ?? null],
    );

    lastRestartId = result.rows[0]?.id ?? null;
    info('Restart recorded', { id: lastRestartId, reason, version });
    return lastRestartId;
  } catch (err) {
    logError('Failed to record restart', { error: err.message });
    return null;
  }
}

/**
 * Update the most recent restart row with the actual uptime when the bot
 * shuts down gracefully.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @returns {Promise<void>}
 */
export async function updateUptimeOnShutdown(pool) {
  if (lastRestartId === null || startedAt === null) {
    warn('updateUptimeOnShutdown called before recordRestart — skipping', {
      module: 'restartTracker',
      lastRestartId,
      startedAt,
    });
    return;
  }

  const uptimeSeconds = (Date.now() - startedAt) / 1000;

  try {
    await pool.query(`UPDATE bot_restarts SET uptime_seconds = $1 WHERE id = $2`, [
      uptimeSeconds,
      lastRestartId,
    ]);
    info('Uptime recorded on shutdown', { id: lastRestartId, uptimeSeconds });
  } catch (err) {
    logError('Failed to update uptime on shutdown', { error: err.message });
  }
}

/**
 * Retrieve recent restart records, newest first.
 *
 * Each row contains the restart `id`, `timestamp`, `reason`, `version` (or `null`), and `uptime_seconds` (or `null`).
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool.
 * @param {number} [limit=20] - Maximum number of rows to return; values less than 1 are treated as 1.
 * @returns {Promise<Array<{id: number, timestamp: Date, reason: string, version: string|null, uptime_seconds: number|null}>>} Recent restart rows, or an empty array if the query fails.
 */
export async function getRestarts(pool, limit = 20) {
  try {
    const result = await pool.query(
      `SELECT id, timestamp, reason, version, uptime_seconds
         FROM bot_restarts
        ORDER BY timestamp DESC
        LIMIT $1`,
      [Math.max(1, Math.floor(limit))],
    );
    return result.rows;
  } catch (err) {
    logError('Failed to query restarts', { error: err.message });
    return [];
  }
}

/**
 * Retrieve the most recent restart record.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @returns {Promise<{id: number, timestamp: Date, reason: string, version: string|null, uptime_seconds: number|null}|null>}
 */
export async function getLastRestart(pool) {
  const rows = await getRestarts(pool, 1);
  return rows[0] ?? null;
}

/**
 * Expose the in-memory start timestamp (useful for testing / health checks).
 *
 * @returns {number|null}
 */
export function getStartedAt() {
  return startedAt;
}

/**
 * Reset internal state (used in tests).
 *
 * @returns {void}
 */
export function _resetState() {
  startedAt = null;
  lastRestartId = null;
}
