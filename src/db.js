/**
 * Database Module
 * PostgreSQL connection pool and schema initialization
 */

import pg from 'pg';
import { info, error as logError } from './logger.js';

const { Pool } = pg;

/** @type {pg.Pool | null} */
let pool = null;

/** @type {boolean} Re-entrancy guard for initDb */
let initializing = false;

/**
 * Determine SSL configuration based on DATABASE_SSL env var and connection string.
 *
 * DATABASE_SSL values:
 *   "false" / "off"      → SSL disabled
 *   "no-verify"          → SSL enabled but server cert not verified
 *   "true" / "on" / unset → SSL enabled with full verification
 *
 * Railway internal connections always disable SSL regardless of env var.
 *
 * @param {string} connectionString - Database connection URL
 * @returns {false|{rejectUnauthorized: boolean}} SSL config for pg.Pool
 */
function getSslConfig(connectionString) {
  // Railway internal connections never need SSL
  if (connectionString.includes('railway.internal')) {
    return false;
  }

  const sslEnv = (process.env.DATABASE_SSL || '').toLowerCase().trim();

  if (sslEnv === 'false' || sslEnv === 'off') {
    return false;
  }

  if (sslEnv === 'no-verify') {
    return { rejectUnauthorized: false };
  }

  // Default: SSL with full verification
  return { rejectUnauthorized: true };
}

/**
 * Initialize the database connection pool and create schema
 * @returns {Promise<pg.Pool>} The connection pool
 */
export async function initDb() {
  if (initializing) {
    throw new Error('initDb is already in progress');
  }
  if (pool) return pool;

  initializing = true;
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: getSslConfig(connectionString),
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

      await pool.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id SERIAL PRIMARY KEY,
          channel_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          username TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_conversations_channel_created
        ON conversations (channel_id, created_at)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_conversations_created_at
        ON conversations (created_at)
      `);

      // Moderation tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mod_cases (
          id SERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          case_number INTEGER NOT NULL,
          action TEXT NOT NULL,
          target_id TEXT NOT NULL,
          target_tag TEXT NOT NULL,
          moderator_id TEXT NOT NULL,
          moderator_tag TEXT NOT NULL,
          reason TEXT,
          duration TEXT,
          expires_at TIMESTAMPTZ,
          log_message_id TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(guild_id, case_number)
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_target
        ON mod_cases (guild_id, target_id, created_at)
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mod_scheduled_actions (
          id SERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          action TEXT NOT NULL,
          target_id TEXT NOT NULL,
          case_id INTEGER REFERENCES mod_cases(id),
          execute_at TIMESTAMPTZ NOT NULL,
          executed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_mod_scheduled_actions_pending
        ON mod_scheduled_actions (executed, execute_at)
      `);

      info('Database schema initialized');
    } catch (err) {
      // Clean up the pool so getPool() doesn't return an unusable instance
      await pool.end().catch(() => {});
      pool = null;
      throw err;
    }

    return pool;
  } finally {
    initializing = false;
  }
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
    try {
      await pool.end();
      info('Database pool closed');
    } catch (err) {
      logError('Error closing database pool', { error: err.message });
    } finally {
      pool = null;
    }
  }
}
