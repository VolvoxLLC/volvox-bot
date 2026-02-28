/**
 * Tests for src/api/routes/auditLog.js
 * Covers audit log listing, pagination, filtering, and auth.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    permissions: { botOwners: [] },
    auditLog: { enabled: true, retentionDays: 90 },
  }),
  setConfigValue: vi.fn(),
}));

vi.mock('../../../src/api/middleware/oauthJwt.js', () => ({
  handleOAuthJwt: vi.fn().mockResolvedValue(false),
  stopJwtCleanup: vi.fn(),
}));

import { createApp } from '../../../src/api/server.js';

const TEST_SECRET = 'test-audit-secret';

function authed(req) {
  return req.set('x-api-secret', TEST_SECRET);
}

describe('auditLog routes', () => {
  let app;
  let mockPool;

  const mockGuild = {
    id: 'guild1',
    name: 'Test Server',
    iconURL: () => 'https://cdn.example.com/icon.png',
    memberCount: 100,
    channels: { cache: new Map() },
    roles: { cache: new Map() },
    members: { cache: new Map() },
  };

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn(),
    };

    const client = {
      guilds: { cache: new Map([['guild1', mockGuild]]) },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };

    app = createApp(client, mockPool);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // ─── Auth ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/guilds/guild1/audit-log');
      expect(res.status).toBe(401);
    });

    it('should return 404 for unknown guild', async () => {
      const res = await authed(request(app).get('/api/v1/guilds/unknown-guild/audit-log'));
      expect(res.status).toBe(404);
    });
  });

  // ─── GET /:id/audit-log ───────────────────────────────────────

  describe('GET /:id/audit-log', () => {
    it('should return empty entries list', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/audit-log'));
      expect(res.status).toBe(200);
      expect(res.body.entries).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.limit).toBe(25);
      expect(res.body.offset).toBe(0);
    });

    it('should return entries with pagination', async () => {
      const mockEntries = [
        {
          id: 1,
          guild_id: 'guild1',
          user_id: 'user1',
          action: 'config.update',
          target_type: null,
          target_id: null,
          details: { method: 'PUT', path: '/api/v1/guilds/guild1/config' },
          ip_address: '127.0.0.1',
          created_at: '2026-02-28T12:00:00Z',
        },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 50 }] })
        .mockResolvedValueOnce({ rows: mockEntries });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/audit-log?limit=10&offset=0'),
      );

      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.total).toBe(50);
      expect(res.body.limit).toBe(10);
      expect(res.body.offset).toBe(0);
    });

    it('should respect limit cap of 100', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/audit-log?limit=500'));

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });

    it('should filter by action', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/audit-log?action=config.update'),
      );

      expect(res.status).toBe(200);

      // Verify the query included action filter
      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[0]).toContain('action = $2');
      expect(countCall[1]).toContain('config.update');
    });

    it('should filter by userId', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 3 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/audit-log?userId=user42'));

      expect(res.status).toBe(200);

      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[0]).toContain('user_id = $2');
      expect(countCall[1]).toContain('user42');
    });

    it('should ignore non-string action filters', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get(
          '/api/v1/guilds/guild1/audit-log?action=config.update&action=members.delete',
        ),
      );

      expect(res.status).toBe(200);

      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[0]).not.toContain('action =');
      expect(countCall[1]).toEqual(['guild1']);
    });

    it('should ignore non-string userId filters', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/audit-log?userId=user1&userId=user2'),
      );

      expect(res.status).toBe(200);

      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[0]).not.toContain('user_id =');
      expect(countCall[1]).toEqual(['guild1']);
    });

    it('should filter by date range', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get(
          '/api/v1/guilds/guild1/audit-log?startDate=2026-01-01T00:00:00Z&endDate=2026-01-31T23:59:59Z',
        ),
      );

      expect(res.status).toBe(200);

      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[0]).toContain('created_at >=');
      expect(countCall[0]).toContain('created_at <=');
    });

    it('should combine multiple filters', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get(
          '/api/v1/guilds/guild1/audit-log?action=config.update&userId=user1&startDate=2026-01-01T00:00:00Z',
        ),
      );

      expect(res.status).toBe(200);

      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[0]).toContain('action = $2');
      expect(countCall[0]).toContain('user_id = $3');
      expect(countCall[0]).toContain('created_at >= $4');
    });

    it('should return 503 when database is unavailable', async () => {
      // Create app without dbPool
      const client = {
        guilds: { cache: new Map([['guild1', mockGuild]]) },
        ws: { status: 0, ping: 42 },
        user: { tag: 'Bot#1234' },
      };
      const appNoDb = createApp(client, null);

      const res = await authed(request(appNoDb).get('/api/v1/guilds/guild1/audit-log'));
      expect(res.status).toBe(503);
    });

    it('should return 500 on database error', async () => {
      mockPool.query.mockRejectedValue(new Error('DB connection lost'));

      const res = await authed(request(app).get('/api/v1/guilds/guild1/audit-log'));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch audit log');
    });
  });
});
