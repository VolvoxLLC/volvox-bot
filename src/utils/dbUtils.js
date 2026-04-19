/**
 * Common Database Utilities
 *
 * Provides shared database connection and query utilities to reduce code duplication
 * across the application. Centralizes database access patterns.
 */

import { getPool } from '../db.js';
import { error as logError } from '../logger.js';

/**
 * Execute a database query with error handling and logging.
 * Provides a consistent pattern for database operations across the application.
 *
 * @param {string} sql - SQL query string
 * @param {Array} [params=[]] - Query parameters
 * @param {string} [context='Database query'] - Context for error logging
 * @returns {Promise<Array>} Query results
 */
export async function queryWithLogging(sql, params = [], context = 'Database query') {
  const pool = getPool();
  if (!pool) {
    logError(context, { error: 'Database pool unavailable' });
    return [];
  }

  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    logError(context, { error: err.message, sql: sql.substring(0, 100) });
    return [];
  }
}

/**
 * Check if database is available with proper error handling.
 * Used by health checks and monitoring systems.
 *
 * @returns {Promise<boolean>} True if database is available
 */
export async function isDatabaseAvailable() {
  try {
    const pool = getPool();
    if (!pool) return false;
    
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logError('Database health check', { error: err.message });
    return false;
  }
}