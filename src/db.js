/**
 * Database Module
 * PostgreSQL connection pool and migration runner
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { info, error as logError } from './logger.js';

const { Pool } = pg;

/** @type {pg.Pool | null} */
let pool = null;

/** @type {boolean} Re-entrancy guard for initDb */
let initializing = false;

/**
 * Selects the SSL configuration for a pg.Pool based on DATABASE_SSL and the connection string.
 *
 * DATABASE_SSL values:
 *   "false" / "off"      → SSL disabled
 *   "no-verify"          → SSL enabled but server certificate not verified
 *   "true" / "on" / unset → SSL enabled with server certificate verification
 *
 * Connections whose host contains "railway.internal" always disable SSL.
 *
 * @param {string} connectionString - Database connection URL
 * @returns {false|{rejectUnauthorized: boolean}} `false` to disable SSL, or an object with `rejectUnauthorized` indicating whether server certificates must be verified
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
 * Apply pending PostgreSQL schema migrations from the project's migrations directory.
 *
 * @param {string} databaseUrl - Connection string used to run migrations against the database.
 * @returns {Promise<void>}
 */
async function runMigrations(databaseUrl) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsDir = path.resolve(__dirname, '..', 'migrations');

  await runner({
    databaseUrl,
    dir: migrationsDir,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: (msg) => info(msg),
  });

  info('Database migrations applied');
}

/**
 * Initialize the PostgreSQL connection pool and apply any pending database migrations.
 *
 * @returns {Promise<pg.Pool>} The initialized pg.Pool instance.
 * @throws {Error} If initialization is already in progress.
 * @throws {Error} If the DATABASE_URL environment variable is not set.
 * @throws {Error} If the connection test or migration application fails.
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

    const poolSize = Math.max(1, parseInt(process.env.PG_POOL_SIZE, 10) || 5);
    pool = new Pool({
      connectionString,
      max: poolSize,
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

      // Run pending migrations
      await runMigrations(connectionString);

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
