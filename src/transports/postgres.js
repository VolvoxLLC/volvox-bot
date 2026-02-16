/**
 * PostgreSQL Winston Transport
 *
 * Custom Winston transport that writes log entries to a PostgreSQL table
 * with batch inserts for performance. Fails gracefully if DB is unavailable.
 */

import Transport from 'winston-transport';

/**
 * Custom Winston transport for PostgreSQL logging.
 * Buffers log entries and batch-inserts them for performance.
 */
export class PostgresTransport extends Transport {
  /**
   * @param {Object} opts
   * @param {import('pg').Pool} opts.pool - PostgreSQL connection pool
   * @param {string} [opts.level='info'] - Minimum log level
   * @param {number} [opts.batchSize=10] - Number of logs to buffer before flushing
   * @param {number} [opts.flushIntervalMs=5000] - Flush interval in milliseconds
   */
  constructor(opts = {}) {
    const { pool, batchSize, flushIntervalMs, ...transportOpts } = opts;
    super(transportOpts);

    if (!pool) {
      throw new Error('PostgresTransport requires a pg Pool instance');
    }

    this.pool = pool;
    this.batchSize = batchSize || 10;
    this.flushIntervalMs = flushIntervalMs || 5000;

    /** @type {Array<{level: string, message: string, metadata: object, timestamp: string}>} */
    this.buffer = [];

    /** @type {boolean} */
    this.flushing = false;

    // Start periodic flush timer
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);

    // Prevent the timer from keeping the process alive
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Winston transport log method.
   * Buffers the log entry and triggers flush if batch size is reached.
   * Always calls callback immediately to avoid blocking.
   *
   * @param {Object} info - Winston log info object
   * @param {Function} callback - Callback to signal completion
   */
  log(info, callback) {
    // Extract metadata (everything except reserved winston fields)
    const { level, message, timestamp, ...metadata } = info;

    this.buffer.push({
      level: level || 'info',
      message: message || '',
      metadata: metadata || {},
      timestamp: timestamp || new Date().toISOString(),
    });

    // Trigger flush if batch size is reached
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }

    // Always call callback immediately — non-blocking
    callback();
  }

  /**
   * Flush buffered log entries to PostgreSQL via batch insert.
   * Fails gracefully — never throws.
   *
   * @returns {Promise<void>}
   */
  async flush() {
    // Prevent concurrent flushes and skip if buffer is empty
    if (this.flushing || this.buffer.length === 0) {
      return;
    }

    this.flushing = true;

    // Grab current buffer and reset
    const entries = this.buffer.splice(0);

    try {
      // Build parameterized multi-row INSERT
      const values = [];
      const placeholders = [];

      for (let i = 0; i < entries.length; i++) {
        const offset = i * 4;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
        values.push(
          entries[i].level,
          entries[i].message,
          JSON.stringify(entries[i].metadata),
          entries[i].timestamp,
        );
      }

      const query = `INSERT INTO logs (level, message, metadata, timestamp) VALUES ${placeholders.join(', ')}`;
      await this.pool.query(query, values);
    } catch (_err) {
      // Fail gracefully — don't block logging if DB is unavailable
      // Logs are still written to console and file transports
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Close the transport: flush remaining buffer and clear timer.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any remaining entries
    await this.flush();
  }
}

/**
 * Initialize the logs table in PostgreSQL.
 * Uses CREATE TABLE IF NOT EXISTS — safe for repeated calls.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @returns {Promise<void>}
 */
export async function initLogsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      level VARCHAR(10) NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)');

  await pool.query('CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)');
}

/**
 * Delete log entries older than the specified retention period.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {number} retentionDays - Number of days to retain logs
 * @returns {Promise<number>} Number of deleted rows
 */
export async function pruneOldLogs(pool, retentionDays) {
  const result = await pool.query(
    'DELETE FROM logs WHERE timestamp < NOW() - make_interval(days => $1)',
    [retentionDays],
  );
  return result.rowCount || 0;
}
