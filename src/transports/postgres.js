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
    this.batchSize = Math.max(1, batchSize ?? 10);
    this.flushIntervalMs = Math.max(100, flushIntervalMs ?? 5000);

    /** @type {Array<{level: string, message: string, metadata: object, timestamp: string}>} */
    this.buffer = [];

    /** @type {boolean} */
    this.flushing = false;
    this.dbFailureCount = 0;

    /** @type {Promise<void>|null} In-flight flush promise for close() to await */
    this.flushPromise = null;

    // Start periodic flush timer
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
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
    // Extract metadata (only string-keyed own properties, excluding Winston Symbol keys)
    const { level, message, timestamp } = info;
    const metadata = {};
    for (const key of Object.keys(info)) {
      if (key !== 'level' && key !== 'message' && key !== 'timestamp') {
        metadata[key] = info[key];
      }
    }

    this.buffer.push({
      level: level || 'info',
      message: message || '',
      metadata: metadata || {},
      timestamp: timestamp || new Date().toISOString(),
    });

    // Trigger flush if batch size is reached
    if (this.buffer.length >= this.batchSize) {
      this.flush().catch(() => {});
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

    const doFlush = async () => {
      try {
        // Build parameterized multi-row INSERT
        const values = [];
        const placeholders = [];

        for (let i = 0; i < entries.length; i++) {
          let metadataJson;
          try {
            metadataJson = JSON.stringify(entries[i].metadata);
          } catch {
            // Drop entries with non-serializable metadata to prevent poisoning the batch
            metadataJson = '{}';
          }
          const offset = i * 4;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
          values.push(entries[i].level, entries[i].message, metadataJson, entries[i].timestamp);
        }

        const query = `INSERT INTO logs (level, message, metadata, timestamp) VALUES ${placeholders.join(', ')}`;
        await this.pool.query(query, values);
      } catch (_err) {
        this.dbFailureCount++;
        this.emit('warn', _err);

        // Restore entries to the front of the buffer so they can be retried
        this.buffer = entries.concat(this.buffer);

        // Cap buffer to prevent unbounded growth on persistent DB failures
        const MAX_BUFFER = 10000;
        if (this.buffer.length > MAX_BUFFER) {
          this.buffer = this.buffer.slice(-MAX_BUFFER);
        }
      } finally {
        this.flushing = false;
        this.flushPromise = null;
      }
    };

    this.flushPromise = doFlush();
    await this.flushPromise;
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

    // Wait for any in-flight flush to complete before doing the final flush
    if (this.flushPromise) {
      await this.flushPromise;
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        level VARCHAR(10) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        timestamp TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)');

    await client.query('CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)');

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Delete log entries older than the specified retention period.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {number} retentionDays - Number of days to retain logs
 * @returns {Promise<number>} Number of deleted rows
 */
export async function pruneOldLogs(pool, retentionDays) {
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
    return 0;
  }

  const result = await pool.query(
    'DELETE FROM logs WHERE timestamp < NOW() - make_interval(days => $1)',
    [retentionDays],
  );
  return result.rowCount || 0;
}
