/**
 * Database Module
 * PostgreSQL connection pool and migration runner
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { debug, info, error as logError, warn } from './logger.js';

const { Pool } = pg;

/** @type {pg.Pool | null} */
let pool = null;

/** @type {boolean} Re-entrancy guard for initDb */
let initializing = false;

/** @type {ReturnType<typeof setInterval> | null} */
let leakDetectionInterval = null;

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
 * Wrap pool.query with slow query detection.
 * Logs queries that exceed the threshold with timing info.
 *
 * @param {pg.Pool} poolInstance - The pool instance to wrap
 * @param {number} thresholdMs - Slow query threshold in milliseconds
 */
function wrapPoolQuery(poolInstance, thresholdMs) {
  const originalQuery = poolInstance.query.bind(poolInstance);

  poolInstance.query = async function wrappedQuery(...args) {
    const start = Date.now();
    try {
      const result = await originalQuery(...args);
      const duration = Date.now() - start;

      if (duration >= thresholdMs) {
        const queryText = typeof args[0] === 'string' ? args[0] : (args[0]?.text ?? 'unknown');
        warn('Slow query detected', {
          duration_ms: duration,
          threshold_ms: thresholdMs,
          query: queryText.slice(0, 500),
          source: 'slow_query_log',
        });

        // Attempt EXPLAIN (best-effort, fire-and-forget — do not await)
        const explainText = typeof args[0] === 'string' ? args[0] : (args[0]?.text ?? '');
        const explainValues = Array.isArray(args[1]) ? args[1] : (args[0]?.values ?? []);

        if (/^\s*(SELECT|INSERT|UPDATE|DELETE)/i.test(explainText)) {
          originalQuery({
            text: `EXPLAIN ${explainText}`,
            values: explainValues,
          })
            .then((explainResult) => {
              const plan = explainResult.rows.map((r) => Object.values(r)[0]).join('\n');
              warn('Slow query EXPLAIN plan', {
                duration_ms: duration,
                query: queryText.slice(0, 200),
                plan: plan.slice(0, 2000),
                source: 'slow_query_log',
              });
            })
            .catch(() => {});
        }
      }

      return result;
    } catch (err) {
      const duration = Date.now() - start;
      const queryText = typeof args[0] === 'string' ? args[0] : (args[0]?.text ?? 'unknown');
      logError('Query failed', {
        duration_ms: duration,
        query: queryText.slice(0, 500),
        error: err.message,
        source: 'db_query',
      });
      throw err;
    }
  };
}

/**
 * Start the connection leak detection interval.
 * Warns if the pool is near capacity or has waiting requests.
 *
 * @param {pg.Pool} poolInstance - The pool to monitor
 * @param {number} maxSize - Configured pool max size
 */
function startLeakDetection(poolInstance, maxSize) {
  if (leakDetectionInterval) return;

  leakDetectionInterval = setInterval(() => {
    const waiting = poolInstance.waitingCount;
    const total = poolInstance.totalCount;

    if (waiting > 0) {
      warn('Database connection pool has waiting clients', {
        waiting,
        total,
        idle: poolInstance.idleCount,
        max: maxSize,
        source: 'pool_monitor',
      });
    } else {
      const activeCount = poolInstance.totalCount - poolInstance.idleCount;
      if (activeCount >= maxSize * 0.8) {
        warn('Database connection pool nearing capacity', {
          total,
          active: activeCount,
          idle: poolInstance.idleCount,
          waiting,
          max: maxSize,
          utilization_pct: Math.round((activeCount / maxSize) * 100),
          source: 'pool_monitor',
        });
      }
    }
  }, 30_000).unref();
}

/**
 * Stop the connection leak detection interval.
 */
export function stopLeakDetection() {
  if (leakDetectionInterval) {
    clearInterval(leakDetectionInterval);
    leakDetectionInterval = null;
  }
}

/**
 * Get pool statistics.
 *
 * @returns {{ total: number, idle: number, waiting: number } | null} Pool stats or null if not initialized
 */
export function getPoolStats() {
  if (!pool) return null;
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
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

    /** @param {string|undefined} env @param {number} defaultVal */
    const parsePositiveInt = (env, defaultVal) => {
      const val = parseInt(env, 10);
      return isNaN(val) || val < 0 ? defaultVal : val;
    };

    const poolSize = Math.max(1, parsePositiveInt(process.env.PG_POOL_SIZE, 5));
    const idleTimeoutMs = parsePositiveInt(process.env.PG_IDLE_TIMEOUT_MS, 30000);
    const connectionTimeoutMs = parsePositiveInt(process.env.PG_CONNECTION_TIMEOUT_MS, 10000);

    pool = new Pool({
      connectionString,
      max: poolSize,
      idleTimeoutMillis: idleTimeoutMs,
      connectionTimeoutMillis: connectionTimeoutMs,
      ssl: getSslConfig(connectionString),
    });

    // Prevent unhandled pool errors from crashing the process
    pool.on('error', (err) => {
      logError('Unexpected database pool error', { error: err.message, source: 'database_pool' });
    });

    // Pool event listeners for observability
    pool.on('connect', () => {
      debug('Database pool: new client connected', {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        source: 'pool_events',
      });
    });

    pool.on('acquire', () => {
      debug('Database pool: client acquired', {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        source: 'pool_events',
      });
    });

    pool.on('remove', () => {
      debug('Database pool: client removed', {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        source: 'pool_events',
      });
    });

    // Wrap query with slow query logging
    const slowQueryThresholdMs = parsePositiveInt(process.env.PG_SLOW_QUERY_MS, 100);
    wrapPoolQuery(pool, slowQueryThresholdMs);

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

    // Start connection leak detection
    startLeakDetection(pool, poolSize);

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
  stopLeakDetection();
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
