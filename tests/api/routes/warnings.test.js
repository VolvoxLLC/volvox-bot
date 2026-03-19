import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/api/middleware/oauthJwt.js', () => ({
  handleOAuthJwt: vi.fn().mockResolvedValue(false),
  stopJwtCleanup: vi.fn(),
}));

import { createApp } from '../../../src/api/server.js';
import { getPool } from '../../../src/db.js';

function authed(req) {
  return req.set('x-api-secret', 'warnings-secret');
}

describe('warnings routes', () => {
  let app;
  let mockPool;

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', 'warnings-secret');

    mockPool = {
      query: vi.fn(),
      connect: vi.fn(),
    };
    getPool.mockReturnValue(mockPool);

    app = createApp(
      {
        guilds: { cache: new Map() },
        ws: { status: 0, ping: 42 },
        user: { tag: 'Bot#1234' },
      },
      mockPool,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns 400 when listing warnings without guildId', async () => {
    const res = await authed(request(app).get('/api/v1/warnings'));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('guildId is required');
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('lists warnings with filters and normalized pagination', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT COUNT(*)::integer AS total FROM warnings')) {
        expect(params).toEqual(['guild-1', 'user-1', true, 'high']);
        return { rows: [{ total: 12 }] };
      }

      expect(sql).toContain('SELECT * FROM warnings');
      expect(sql).toContain(
        'WHERE guild_id = $1 AND user_id = $2 AND active = $3 AND severity = $4',
      );
      expect(params).toEqual(['guild-1', 'user-1', true, 'high', 10, 10]);
      return { rows: [{ id: 1, user_id: 'user-1', severity: 'high' }] };
    });

    const res = await authed(
      request(app).get(
        '/api/v1/warnings?guildId=guild-1&userId=user-1&active=true&severity=high&page=2&limit=10',
      ),
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      warnings: [{ id: 1, user_id: 'user-1', severity: 'high' }],
      total: 12,
      page: 2,
      limit: 10,
      pages: 2,
    });
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it('returns 500 when listing warnings fails', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('db down'));

    const res = await authed(request(app).get('/api/v1/warnings?guildId=guild-1'));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch warnings');
  });

  it('returns 400 when fetching a user warning summary without guildId', async () => {
    const res = await authed(request(app).get('/api/v1/warnings/user/user-1'));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('guildId is required');
  });

  it('returns a user warning summary with severity buckets', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, reason: 'spam' }] })
      .mockResolvedValueOnce({ rows: [{ active_count: 2, active_points: 5 }] })
      .mockResolvedValueOnce({
        rows: [
          { severity: 'low', count: 1 },
          { severity: 'high', count: 1 },
        ],
      });

    const res = await authed(request(app).get('/api/v1/warnings/user/user-1?guildId=guild-1'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: 'user-1',
      activeCount: 2,
      activePoints: 5,
      bySeverity: { low: 1, high: 1 },
      warnings: [{ id: 1, reason: 'spam' }],
    });
  });

  it('returns 500 when fetching a user warning summary fails', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('db down'));

    const res = await authed(request(app).get('/api/v1/warnings/user/user-1?guildId=guild-1'));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch user warnings');
  });

  it('returns 400 when fetching warning stats without guildId', async () => {
    const res = await authed(request(app).get('/api/v1/warnings/stats'));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('guildId is required');
  });

  it('returns warning stats with sensible defaults', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 9 }] })
      .mockResolvedValueOnce({ rows: [{ total: 4 }] })
      .mockResolvedValueOnce({ rows: [{ severity: 'medium', count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1', count: 4, points: 7 }] });

    const res = await authed(request(app).get('/api/v1/warnings/stats?guildId=guild-1'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalWarnings: 9,
      activeWarnings: 4,
      bySeverity: { medium: 3 },
      topUsers: [{ user_id: 'user-1', count: 4, points: 7 }],
    });
  });

  it('returns 500 when fetching warning stats fails', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('db down'));

    const res = await authed(request(app).get('/api/v1/warnings/stats?guildId=guild-1'));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch warning stats');
  });
});
