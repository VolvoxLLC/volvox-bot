import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLogsTable, PostgresTransport, pruneOldLogs } from '../../src/transports/postgres.js';

/**
 * Create a mock pg Pool
 */
function createMockPool(queryResult = { rows: [], rowCount: 0 }) {
  const mockClient = {
    query: vi.fn().mockResolvedValue(queryResult),
    release: vi.fn(),
  };
  return {
    query: vi.fn().mockResolvedValue(queryResult),
    connect: vi.fn().mockResolvedValue(mockClient),
    _mockClient: mockClient,
  };
}

describe('PostgresTransport', () => {
  let transport;
  let mockPool;

  beforeEach(() => {
    vi.useFakeTimers();
    mockPool = createMockPool();
  });

  afterEach(async () => {
    if (transport) {
      // Clear timer before restoring to avoid real timer issues
      await transport.close();
      transport = null;
    }
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should throw if no pool is provided', () => {
      expect(() => new PostgresTransport({})).toThrow(
        'PostgresTransport requires a pg Pool instance',
      );
    });

    it('should set default batchSize and flushIntervalMs', () => {
      transport = new PostgresTransport({ pool: mockPool });
      expect(transport.batchSize).toBe(10);
      expect(transport.flushIntervalMs).toBe(5000);
    });

    it('should accept custom batchSize and flushIntervalMs', () => {
      transport = new PostgresTransport({
        pool: mockPool,
        batchSize: 5,
        flushIntervalMs: 3000,
      });
      expect(transport.batchSize).toBe(5);
      expect(transport.flushIntervalMs).toBe(3000);
    });

    it('should accept a custom level', () => {
      transport = new PostgresTransport({
        pool: mockPool,
        level: 'error',
      });
      expect(transport.level).toBe('error');
    });

    it('should initialize with empty buffer', () => {
      transport = new PostgresTransport({ pool: mockPool });
      expect(transport.buffer).toEqual([]);
    });
  });

  describe('log()', () => {
    it('should buffer log entries', () => {
      transport = new PostgresTransport({ pool: mockPool });
      const callback = vi.fn();

      transport.log(
        { level: 'info', message: 'test message', timestamp: '2026-01-01T00:00:00Z' },
        callback,
      );

      expect(transport.buffer).toHaveLength(1);
      expect(transport.buffer[0]).toEqual({
        level: 'info',
        message: 'test message',
        metadata: {},
        timestamp: '2026-01-01T00:00:00Z',
      });
      expect(callback).toHaveBeenCalled();
    });

    it('should extract metadata from log info', () => {
      transport = new PostgresTransport({ pool: mockPool });
      const callback = vi.fn();

      transport.log(
        {
          level: 'error',
          message: 'something failed',
          timestamp: '2026-01-01T00:00:00Z',
          userId: '123',
          action: 'deploy',
        },
        callback,
      );

      expect(transport.buffer[0].metadata).toEqual({
        userId: '123',
        action: 'deploy',
      });
    });

    it('should call callback immediately (non-blocking)', () => {
      transport = new PostgresTransport({ pool: mockPool, batchSize: 100 });
      const callback = vi.fn();

      transport.log(
        { level: 'info', message: 'test', timestamp: '2026-01-01T00:00:00Z' },
        callback,
      );

      // Callback is called synchronously, before any DB operations
      expect(callback).toHaveBeenCalledTimes(1);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should use defaults for missing fields', () => {
      transport = new PostgresTransport({ pool: mockPool });
      const callback = vi.fn();

      transport.log({}, callback);

      expect(transport.buffer[0].level).toBe('info');
      expect(transport.buffer[0].message).toBe('');
      expect(transport.buffer[0].metadata).toEqual({});
      // timestamp should be auto-generated
      expect(transport.buffer[0].timestamp).toBeDefined();
    });
  });

  describe('flush()', () => {
    it('should batch insert buffered entries', async () => {
      transport = new PostgresTransport({ pool: mockPool, batchSize: 100 });

      transport.buffer.push(
        { level: 'info', message: 'msg1', metadata: { a: 1 }, timestamp: '2026-01-01T00:00:00Z' },
        { level: 'error', message: 'msg2', metadata: { b: 2 }, timestamp: '2026-01-01T00:00:01Z' },
      );

      await transport.flush();

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [query, params] = mockPool.query.mock.calls[0];
      expect(query).toContain('INSERT INTO logs');
      expect(query).toContain('($1, $2, $3, $4)');
      expect(query).toContain('($5, $6, $7, $8)');
      expect(params).toHaveLength(8);
      expect(params[0]).toBe('info');
      expect(params[1]).toBe('msg1');
      expect(params[4]).toBe('error');
      expect(params[5]).toBe('msg2');
    });

    it('should clear the buffer after successful flush', async () => {
      transport = new PostgresTransport({ pool: mockPool, batchSize: 100 });

      transport.buffer.push({
        level: 'info',
        message: 'msg1',
        metadata: {},
        timestamp: '2026-01-01T00:00:00Z',
      });

      await transport.flush();

      expect(transport.buffer).toHaveLength(0);
    });

    it('should not call pool.query when buffer is empty', async () => {
      transport = new PostgresTransport({ pool: mockPool, batchSize: 100 });

      await transport.flush();

      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should skip flush when already flushing (concurrent guard)', async () => {
      // Use a deferred promise to keep the first flush in-flight
      let resolveQuery;
      const slowQuery = new Promise((resolve) => {
        resolveQuery = resolve;
      });
      const slowPool = createMockPool();
      slowPool.query.mockReturnValue(slowQuery);

      transport = new PostgresTransport({ pool: slowPool, batchSize: 100 });

      transport.buffer.push({
        level: 'info',
        message: 'msg1',
        metadata: {},
        timestamp: '2026-01-01T00:00:00Z',
      });

      // Start first flush — it will be in-flight (awaiting slowQuery)
      const flush1 = transport.flush();

      // pool.query should have been called once
      expect(slowPool.query).toHaveBeenCalledTimes(1);

      // Add another entry and try a second concurrent flush
      transport.buffer.push({
        level: 'info',
        message: 'msg2',
        metadata: {},
        timestamp: '2026-01-01T00:00:01Z',
      });
      const flush2 = transport.flush();

      // pool.query should still only have been called once — second flush was skipped
      expect(slowPool.query).toHaveBeenCalledTimes(1);

      // Resolve the deferred query and clean up
      resolveQuery({ rows: [], rowCount: 1 });
      await flush1;
      await flush2;
    });

    it('should skip flush if another flush is in progress', async () => {
      let resolveQuery;
      const slowQuery = new Promise((resolve) => {
        resolveQuery = resolve;
      });
      const slowPool = createMockPool();
      slowPool.query.mockReturnValue(slowQuery);

      transport = new PostgresTransport({ pool: slowPool, batchSize: 100 });

      // Push first entry and start flush
      transport.buffer.push({
        level: 'info',
        message: 'first',
        metadata: {},
        timestamp: '2026-01-01T00:00:00Z',
      });
      const flush1 = transport.flush();

      // Push second entry and attempt concurrent flush
      transport.buffer.push({
        level: 'info',
        message: 'second',
        metadata: {},
        timestamp: '2026-01-01T00:00:01Z',
      });
      const flush2 = transport.flush();

      // Only one query should have been made
      expect(slowPool.query).toHaveBeenCalledTimes(1);

      // Second entry should still be in the buffer (skipped flush didn't drain it)
      expect(transport.buffer).toHaveLength(1);
      expect(transport.buffer[0].message).toBe('second');

      // Resolve the in-flight query and clean up
      resolveQuery({ rows: [], rowCount: 1 });
      await flush1;
      await flush2;
    });

    it('should serialize metadata as JSON string', async () => {
      transport = new PostgresTransport({ pool: mockPool, batchSize: 100 });

      transport.buffer.push({
        level: 'info',
        message: 'test',
        metadata: { key: 'value', nested: { deep: true } },
        timestamp: '2026-01-01T00:00:00Z',
      });

      await transport.flush();

      const params = mockPool.query.mock.calls[0][1];
      expect(params[2]).toBe('{"key":"value","nested":{"deep":true}}');
    });

    describe('concurrent flush guard', () => {
      it('should skip flush if another flush is in progress', async () => {
        transport = new PostgresTransport({ pool: mockPool, batchSize: 100 });

        // Make query hang so flush stays 'in progress'
        let resolveQuery;
        mockPool.query.mockImplementation(
          () =>
            new Promise((r) => {
              resolveQuery = r;
            }),
        );

        transport.buffer.push({
          level: 'info',
          message: 'msg1',
          metadata: {},
          timestamp: '2026-01-01T00:00:00Z',
        });

        const firstFlush = transport.flush();

        // Second flush should be a no-op since flushing is true
        transport.buffer.push({
          level: 'info',
          message: 'msg2',
          metadata: {},
          timestamp: '2026-01-01T00:00:01Z',
        });
        await transport.flush(); // should return immediately

        // Now resolve the first query
        resolveQuery({ rows: [], rowCount: 1 });
        await firstFlush;

        // Only one query call from the first flush
        expect(mockPool.query).toHaveBeenCalledTimes(1);
        // msg2 should still be in the buffer (not flushed)
        expect(transport.buffer).toHaveLength(1);
        expect(transport.buffer[0].message).toBe('msg2');

        // Reset mock so afterEach close() can complete
        mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
      });
    });
  });

  describe('flush on batchSize threshold', () => {
    it('should trigger flush when buffer reaches batchSize', async () => {
      transport = new PostgresTransport({ pool: mockPool, batchSize: 3 });
      const callback = vi.fn();

      // Add entries up to batch size
      transport.log(
        { level: 'info', message: 'msg1', timestamp: '2026-01-01T00:00:00Z' },
        callback,
      );
      transport.log(
        { level: 'info', message: 'msg2', timestamp: '2026-01-01T00:00:01Z' },
        callback,
      );

      // Not yet flushed
      expect(mockPool.query).not.toHaveBeenCalled();

      // This should trigger flush
      transport.log(
        { level: 'info', message: 'msg3', timestamp: '2026-01-01T00:00:02Z' },
        callback,
      );

      // flush() is called but it's async — wait for it
      await vi.waitFor(() => {
        expect(mockPool.query).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('flush on interval timer', () => {
    it('should flush on interval', async () => {
      transport = new PostgresTransport({
        pool: mockPool,
        batchSize: 100,
        flushIntervalMs: 5000,
      });
      const callback = vi.fn();

      transport.log(
        { level: 'info', message: 'buffered', timestamp: '2026-01-01T00:00:00Z' },
        callback,
      );

      // Not flushed yet
      expect(mockPool.query).not.toHaveBeenCalled();

      // Advance timer
      vi.advanceTimersByTime(5000);

      // Wait for async flush to complete
      await vi.waitFor(() => {
        expect(mockPool.query).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('graceful failure', () => {
    it('should not throw when pool.query rejects during flush', async () => {
      const failPool = createMockPool();
      failPool.query.mockRejectedValue(new Error('Connection refused'));

      transport = new PostgresTransport({ pool: failPool, batchSize: 100 });

      transport.buffer.push({
        level: 'error',
        message: 'important log',
        metadata: {},
        timestamp: '2026-01-01T00:00:00Z',
      });

      // Should not throw
      await expect(transport.flush()).resolves.toBeUndefined();
    });

    it('should restore buffer entries on failure', async () => {
      const failPool = createMockPool();
      failPool.query.mockRejectedValue(new Error('Connection refused'));

      transport = new PostgresTransport({ pool: failPool, batchSize: 100 });

      transport.buffer.push({
        level: 'error',
        message: 'important log',
        metadata: {},
        timestamp: '2026-01-01T00:00:00Z',
      });

      await transport.flush();

      // Buffer should have entries restored after failed INSERT
      expect(transport.buffer).toHaveLength(1);
      expect(transport.buffer[0].message).toBe('important log');
    });
  });

  describe('close()', () => {
    it('should flush remaining buffer and clear interval', async () => {
      transport = new PostgresTransport({ pool: mockPool, batchSize: 100 });

      transport.buffer.push({
        level: 'info',
        message: 'remaining',
        metadata: {},
        timestamp: '2026-01-01T00:00:00Z',
      });

      await transport.close();

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(transport.flushTimer).toBeNull();
    });

    it('should handle close when buffer is empty', async () => {
      transport = new PostgresTransport({ pool: mockPool, batchSize: 100 });

      await transport.close();

      expect(mockPool.query).not.toHaveBeenCalled();
      expect(transport.flushTimer).toBeNull();
    });
  });
});

describe('initLogsTable', () => {
  it('should create the logs table and indexes in a transaction', async () => {
    const mockPool = createMockPool();
    const client = mockPool._mockClient;

    await initLogsTable(mockPool);

    expect(mockPool.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledTimes(5);

    // BEGIN
    expect(client.query.mock.calls[0][0]).toBe('BEGIN');

    // CREATE TABLE
    const tableQuery = client.query.mock.calls[1][0];
    expect(tableQuery).toContain('CREATE TABLE IF NOT EXISTS logs');
    expect(tableQuery).toContain('id SERIAL PRIMARY KEY');
    expect(tableQuery).toContain('level VARCHAR(10)');
    expect(tableQuery).toContain('message TEXT');
    expect(tableQuery).toContain('metadata JSONB');
    expect(tableQuery).toContain('TIMESTAMPTZ');

    // CREATE INDEX x2
    expect(client.query.mock.calls[2][0]).toContain('idx_logs_timestamp');
    expect(client.query.mock.calls[3][0]).toContain('idx_logs_level');

    // COMMIT
    expect(client.query.mock.calls[4][0]).toBe('COMMIT');

    // Client released
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('should rollback on error and release client', async () => {
    const mockPool = createMockPool();
    const client = mockPool._mockClient;

    // Fail on CREATE TABLE (second call after BEGIN)
    client.query
      .mockResolvedValueOnce() // BEGIN
      .mockRejectedValueOnce(new Error('table creation failed'));

    await expect(initLogsTable(mockPool)).rejects.toThrow('table creation failed');

    // Should have called ROLLBACK
    const calls = client.query.mock.calls.map((c) => c[0]);
    expect(calls).toContain('ROLLBACK');

    // Client released
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe('pruneOldLogs', () => {
  it('should delete logs older than retention period', async () => {
    const mockPool = createMockPool({ rows: [], rowCount: 5 });

    const deleted = await pruneOldLogs(mockPool, 30);

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const [query, params] = mockPool.query.mock.calls[0];
    expect(query).toContain('DELETE FROM logs');
    expect(query).toContain('make_interval');
    expect(params).toEqual([30]);
    expect(deleted).toBe(5);
  });

  it('should return 0 when no rows are deleted', async () => {
    const mockPool = createMockPool({ rows: [], rowCount: 0 });

    const deleted = await pruneOldLogs(mockPool, 7);

    expect(deleted).toBe(0);
  });

  it('should return 0 and skip query for zero retentionDays', async () => {
    const mockPool = createMockPool();

    const deleted = await pruneOldLogs(mockPool, 0);

    expect(deleted).toBe(0);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('should return 0 and skip query for negative retentionDays', async () => {
    const mockPool = createMockPool();

    const deleted = await pruneOldLogs(mockPool, -5);

    expect(deleted).toBe(0);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('should return 0 and skip query for non-numeric retentionDays', async () => {
    const mockPool = createMockPool();

    const deleted = await pruneOldLogs(mockPool, 'thirty');

    expect(deleted).toBe(0);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});
