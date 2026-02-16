/**
 * Log Query Utility
 *
 * Provides a query interface for the PostgreSQL logs table.
 * Designed for future dashboard/REST API integration.
 */

import { getPool } from '../db.js';

/**
 * Query log entries from the PostgreSQL logs table.
 * Fails gracefully if the database is unavailable.
 *
 * @param {Object} [options={}] - Query options
 * @param {string} [options.level] - Filter by exact log level (e.g., 'error', 'warn')
 * @param {string|Date} [options.since] - Filter logs after this timestamp
 * @param {string|Date} [options.until] - Filter logs before this timestamp
 * @param {number} [options.limit=100] - Maximum number of results (max 1000)
 * @param {string} [options.search] - Search term for ILIKE match on message
 * @param {number} [options.offset=0] - Offset for pagination
 * @returns {Promise<{rows: Array, total: number}>} Log entries and total count
 */
export async function queryLogs(options = {}) {
  try {
    const pool = getPool();

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Level filter
    if (options.level) {
      conditions.push(`level = $${paramIndex}`);
      params.push(options.level);
      paramIndex++;
    }

    // Since filter (inclusive)
    if (options.since) {
      conditions.push(`timestamp >= $${paramIndex}`);
      params.push(options.since instanceof Date ? options.since.toISOString() : options.since);
      paramIndex++;
    }

    // Until filter (inclusive)
    if (options.until) {
      conditions.push(`timestamp <= $${paramIndex}`);
      params.push(options.until instanceof Date ? options.until.toISOString() : options.until);
      paramIndex++;
    }

    // Search filter (ILIKE for case-insensitive pattern match)
    if (options.search) {
      conditions.push(`message ILIKE $${paramIndex}`);
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Clamp limit
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const offset = Math.max(options.offset ?? 0, 0);

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*)::int AS total FROM logs ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = countResult.rows[0]?.total || 0;

    // Get paginated results
    const dataQuery = `SELECT id, level, message, metadata, timestamp FROM logs ${whereClause} ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const dataParams = [...params, limit, offset];
    const dataResult = await pool.query(dataQuery, dataParams);

    return {
      rows: dataResult.rows,
      total,
    };
  } catch (_err) {
    // Fail gracefully if DB is unavailable
    return { rows: [], total: 0 };
  }
}
