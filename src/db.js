/**
 * Database Module
 * PostgreSQL connection pool and schema initialization
 */

import pg from 'pg';
import { info, error as logError } from './logger.js';

const { Pool } = pg;

/** @type {pg.Pool | null} */
let pool = null;

/**
 * Initialize the database connection pool and create schema
 * @returns {Promise<pg.Pool>} The connection pool
 */
export async function initDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Guard against double initialization — close any existing pool to prevent leaks
  if (pool) {
    info('Closing existing database pool before re-initialization');
    await pool.end().catch(() => {});
    pool = null;
  }

  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // Railway internal connections don't need SSL; others default to verified TLS
    ssl: connectionString.includes('railway.internal')
      ? false
      : process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false'
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true },
  });

  // Prevent unhandled pool errors from crashing the process
  pool.on('error', (err) => {
    logError('Unexpected database pool error', { error: err.message });
  });

  try {
    // Test connection
    const client = await pool.connect();
    try {
      await client.query('SELECT NOW()');
      info('Database connected');
    } finally {
      client.release();
    }

    // Create schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    info('Database schema initialized');
  } catch (err) {
    // Clean up the pool so getPool() doesn't return an unusable instance
    await pool.end().catch(() => {});
    pool = null;
    throw err;
  }

  return pool;
}

/**
 * Get the database pool
 * @returns {pg.Pool} The connection pool
 * @throws {Error} If pool is not initialized
 */
export function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return pool;
}

/**
 * Gracefully close the database pool
 */
export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    info('Database pool closed');
  }
}
