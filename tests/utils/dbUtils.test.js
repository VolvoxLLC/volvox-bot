import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetPool, mockLogError } = vi.hoisted(() => ({
  mockGetPool: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('../../src/db.js', () => ({
  getPool: mockGetPool,
}));

vi.mock('../../src/logger.js', () => ({
  error: mockLogError,
}));

import { isDatabaseAvailable, queryWithLogging } from '../../src/utils/dbUtils.js';

function makePool(overrides = {}) {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 }),
    ...overrides,
  };
}

describe('queryWithLogging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns rows when the pool query succeeds', async () => {
    const pool = makePool();
    mockGetPool.mockReturnValue(pool);

    await expect(queryWithLogging('SELECT * FROM things WHERE id = $1', [1])).resolves.toEqual([
      { id: 1 },
    ]);
    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM things WHERE id = $1', [1]);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('passes query parameters to pool.query', async () => {
    const pool = makePool({
      query: vi.fn().mockResolvedValue({ rows: [{ id: 42 }] }),
    });
    mockGetPool.mockReturnValue(pool);

    const rows = await queryWithLogging('SELECT * FROM users WHERE id = $1', [42]);

    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [42]);
    expect(rows).toEqual([{ id: 42 }]);
  });

  it('defaults params to an empty array when not provided', async () => {
    const pool = makePool();
    mockGetPool.mockReturnValue(pool);

    await queryWithLogging('SELECT 1');

    expect(pool.query).toHaveBeenCalledWith('SELECT 1', []);
  });

  it('returns an empty array when a successful query has no rows', async () => {
    const pool = makePool({ query: vi.fn().mockResolvedValue({ rows: [] }) });
    mockGetPool.mockReturnValue(pool);

    await expect(queryWithLogging('DELETE FROM old_data')).resolves.toEqual([]);
  });

  it('logs and returns an empty array when the pool cannot be resolved', async () => {
    mockGetPool.mockImplementationOnce(() => {
      throw new Error('Database not initialized. Call initDb() first.');
    });

    await expect(queryWithLogging('SELECT 1', [], 'load config')).resolves.toEqual([]);
    expect(mockLogError).toHaveBeenCalledWith('load config', {
      error: 'Database not initialized. Call initDb() first.',
      sql: 'SELECT 1',
    });
  });

  it('uses the default context when a context is not provided', async () => {
    mockGetPool.mockImplementationOnce(() => {
      throw new Error('Database not initialized. Call initDb() first.');
    });

    await expect(queryWithLogging('SELECT 1')).resolves.toEqual([]);
    expect(mockLogError).toHaveBeenCalledWith('Database query', {
      error: 'Database not initialized. Call initDb() first.',
      sql: 'SELECT 1',
    });
  });

  it('logs and returns an empty array when the query fails', async () => {
    const pool = makePool({ query: vi.fn().mockRejectedValue(new Error('boom')) });
    mockGetPool.mockReturnValue(pool);
    const sql = 'SELECT '.padEnd(120, 'x');

    await expect(queryWithLogging(sql, [], 'load broken')).resolves.toEqual([]);
    expect(mockLogError).toHaveBeenCalledWith('load broken', {
      error: 'boom',
      sql: sql.substring(0, 100),
    });
  });

  it('truncates sql to 100 chars in the error log', async () => {
    const longSql = `SELECT ${'a'.repeat(200)}`;
    const pool = makePool({ query: vi.fn().mockRejectedValue(new Error('fail')) });
    mockGetPool.mockReturnValue(pool);

    await queryWithLogging(longSql, []);

    const errorCall = mockLogError.mock.calls[0];
    expect(errorCall[1].sql.length).toBeLessThanOrEqual(100);
  });

  it('does not mutate the params array', async () => {
    const pool = makePool();
    mockGetPool.mockReturnValue(pool);
    const params = [1, 2, 3];
    const originalParams = [...params];

    await queryWithLogging('SELECT * FROM table WHERE id = $1 AND x = $2 AND y = $3', params);

    expect(params).toEqual(originalParams);
  });

  it('preserves multi-row results from the pool', async () => {
    const pool = makePool({
      query: vi.fn().mockResolvedValue({
        rows: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Carol' },
        ],
      }),
    });
    mockGetPool.mockReturnValue(pool);

    const rows = await queryWithLogging('SELECT id, name FROM users');

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ id: 1, name: 'Alice' });
    expect(rows[2]).toEqual({ id: 3, name: 'Carol' });
  });
});

describe('isDatabaseAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports database availability from a successful health query', async () => {
    const pool = makePool({ query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) });
    mockGetPool.mockReturnValue(pool);

    await expect(isDatabaseAvailable()).resolves.toBe(true);
    expect(pool.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('reports the database unavailable when the health query fails', async () => {
    const pool = makePool({ query: vi.fn().mockRejectedValue(new Error('offline')) });
    mockGetPool.mockReturnValue(pool);

    await expect(isDatabaseAvailable()).resolves.toBe(false);
    expect(mockLogError).toHaveBeenCalledWith('Database health check', { error: 'offline' });
  });

  it('reports the database unavailable when the pool cannot be resolved', async () => {
    mockGetPool.mockImplementationOnce(() => {
      throw new Error('Database not initialized. Call initDb() first.');
    });

    await expect(isDatabaseAvailable()).resolves.toBe(false);
    expect(mockLogError).toHaveBeenCalledWith('Database health check', {
      error: 'Database not initialized. Call initDb() first.',
    });
  });

  it('resolves to boolean (not truthy/falsy object)', async () => {
    const pool = makePool({
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    });
    mockGetPool.mockReturnValue(pool);

    const available = await isDatabaseAvailable();

    expect(typeof available).toBe('boolean');
    expect(available).toBe(true);
  });
});
