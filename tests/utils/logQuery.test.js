import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the db module before importing logQuery
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../src/db.js';
import { queryLogs } from '../../src/utils/logQuery.js';

describe('queryLogs', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
    getPool.mockReturnValue(mockPool);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return all logs with default limit when no filters', async () => {
    const mockRows = [
      { id: 1, level: 'info', message: 'test', metadata: {}, timestamp: '2026-01-01T00:00:00Z' },
    ];
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // count query
      .mockResolvedValueOnce({ rows: mockRows }); // data query

    const result = await queryLogs();

    expect(result.rows).toEqual(mockRows);
    expect(result.total).toBe(1);

    // Count query should have no WHERE clause
    expect(mockPool.query.mock.calls[0][0]).toContain('SELECT COUNT');
    expect(mockPool.query.mock.calls[0][0]).not.toContain('WHERE');
    expect(mockPool.query.mock.calls[0][1]).toEqual([]);

    // Data query should use default limit 100 and offset 0
    const dataParams = mockPool.query.mock.calls[1][1];
    expect(dataParams).toContain(100); // limit
    expect(dataParams).toContain(0); // offset
  });

  it('should filter by level', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 5 }] })
      .mockResolvedValueOnce({ rows: [] });

    await queryLogs({ level: 'error' });

    const countQuery = mockPool.query.mock.calls[0][0];
    expect(countQuery).toContain('level = $1');
    expect(mockPool.query.mock.calls[0][1]).toEqual(['error']);
  });

  it('should filter by since timestamp', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 3 }] })
      .mockResolvedValueOnce({ rows: [] });

    await queryLogs({ since: '2026-01-01T00:00:00Z' });

    const countQuery = mockPool.query.mock.calls[0][0];
    expect(countQuery).toContain('timestamp >= $1');
    expect(mockPool.query.mock.calls[0][1]).toEqual(['2026-01-01T00:00:00Z']);
  });

  it('should filter by until timestamp', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({ rows: [] });

    await queryLogs({ until: '2026-12-31T23:59:59Z' });

    const countQuery = mockPool.query.mock.calls[0][0];
    expect(countQuery).toContain('timestamp <= $1');
    expect(mockPool.query.mock.calls[0][1]).toEqual(['2026-12-31T23:59:59Z']);
  });

  it('should handle Date objects for since/until', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const sinceDate = new Date('2026-06-01T00:00:00Z');
    await queryLogs({ since: sinceDate });

    expect(mockPool.query.mock.calls[0][1]).toEqual([sinceDate.toISOString()]);
  });

  it('should filter by search term using ILIKE', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    await queryLogs({ search: 'database' });

    const countQuery = mockPool.query.mock.calls[0][0];
    expect(countQuery).toContain('message ILIKE $1');
    expect(mockPool.query.mock.calls[0][1]).toEqual(['%database%']);
  });

  it('should respect custom limit and offset', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 50 }] })
      .mockResolvedValueOnce({ rows: [] });

    await queryLogs({ limit: 25, offset: 10 });

    const dataParams = mockPool.query.mock.calls[1][1];
    expect(dataParams).toContain(25);
    expect(dataParams).toContain(10);
  });

  it('should clamp limit to max 1000', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 5000 }] })
      .mockResolvedValueOnce({ rows: [] });

    await queryLogs({ limit: 5000 });

    const dataParams = mockPool.query.mock.calls[1][1];
    expect(dataParams).toContain(1000);
  });

  it('should clamp limit to min 1', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    await queryLogs({ limit: 0 });

    const dataParams = mockPool.query.mock.calls[1][1];
    expect(dataParams).toContain(1);
  });

  it('should combine multiple filters', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 3 }] })
      .mockResolvedValueOnce({ rows: [] });

    await queryLogs({
      level: 'warn',
      since: '2026-01-01T00:00:00Z',
      until: '2026-12-31T23:59:59Z',
      search: 'timeout',
    });

    const countQuery = mockPool.query.mock.calls[0][0];
    expect(countQuery).toContain('level = $1');
    expect(countQuery).toContain('timestamp >= $2');
    expect(countQuery).toContain('timestamp <= $3');
    expect(countQuery).toContain('message ILIKE $4');

    const params = mockPool.query.mock.calls[0][1];
    expect(params).toEqual(['warn', '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', '%timeout%']);
  });

  it('should order results by timestamp DESC', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    await queryLogs();

    const dataQuery = mockPool.query.mock.calls[1][0];
    expect(dataQuery).toContain('ORDER BY timestamp DESC');
  });

  it('should return empty results when DB is unavailable', async () => {
    getPool.mockImplementation(() => {
      throw new Error('Database not initialized');
    });

    const result = await queryLogs({ level: 'error' });

    expect(result).toEqual({ rows: [], total: 0 });
  });

  it('should return empty results when query fails', async () => {
    mockPool.query.mockRejectedValue(new Error('Connection refused'));

    const result = await queryLogs();

    expect(result).toEqual({ rows: [], total: 0 });
  });
});
