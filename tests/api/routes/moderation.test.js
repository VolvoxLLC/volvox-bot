/**
 * Tests for src/api/routes/moderation.js
 * Covers all branches: validation errors, DB queries, filters, pagination, errors.
 */
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

// oauthJwt is used by requireAuth — mock it to avoid real JWT parsing
vi.mock('../../../src/api/middleware/oauthJwt.js', () => ({
  handleOAuthJwt: vi.fn().mockResolvedValue(false),
  stopJwtCleanup: vi.fn(),
}));

import { createApp } from '../../../src/api/server.js';
import { getPool } from '../../../src/db.js';

const TEST_SECRET = 'test-mod-secret';

function buildApp() {
  const client = {
    guilds: { cache: new Map() },
    ws: { status: 0, ping: 42 },
    user: { tag: 'Bot#1234' },
  };
  return createApp(client, null);
}

/** Wrap request with auth header */
function authed(req) {
  return req.set('x-api-secret', TEST_SECRET);
}

describe('moderation routes', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = { query: vi.fn() };
    getPool.mockReturnValue(mockPool);
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // ─── GET /cases ───────────────────────────────────────────────────────────

  describe('GET /api/v1/moderation/cases', () => {
    it('should return 400 when guildId is missing', async () => {
      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/cases'));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('guildId is required');
    });

    it('should return cases list with default pagination', async () => {
      const fakeCases = [
        { id: 1, case_number: 1, action: 'warn', target_id: 'u1', target_tag: 'User#0001' },
      ];
      mockPool.query
        .mockResolvedValueOnce({ rows: fakeCases })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/cases?guildId=guild1'));

      expect(res.status).toBe(200);
      expect(res.body.cases).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(25);
      expect(res.body.pages).toBe(1);
    });

    it('should filter by targetId when provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const app = buildApp();
      const res = await authed(
        request(app).get('/api/v1/moderation/cases?guildId=guild1&targetId=user123'),
      );

      expect(res.status).toBe(200);
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[1]).toContain('user123');
    });

    it('should filter by action when provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const app = buildApp();
      const res = await authed(
        request(app).get('/api/v1/moderation/cases?guildId=guild1&action=ban'),
      );

      expect(res.status).toBe(200);
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[1]).toContain('ban');
    });

    it('should filter by both targetId and action', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const app = buildApp();
      const res = await authed(
        request(app).get('/api/v1/moderation/cases?guildId=guild1&targetId=u1&action=kick'),
      );

      expect(res.status).toBe(200);
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[1]).toContain('u1');
      expect(firstCall[1]).toContain('kick');
    });

    it('should handle custom page and limit', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] });

      const app = buildApp();
      const res = await authed(
        request(app).get('/api/v1/moderation/cases?guildId=guild1&page=2&limit=10'),
      );

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(10);
      expect(res.body.pages).toBe(10);
    });

    it('should cap limit at 100', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const app = buildApp();
      const res = await authed(
        request(app).get('/api/v1/moderation/cases?guildId=guild1&limit=999'),
      );

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[1]).toContain(100);
    });

    it('should handle DB error gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/cases?guildId=guild1'));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch mod cases');
    });

    it('should return total=0 when count row has no total field', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{}] });

      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/cases?guildId=guild1'));

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });
  });

  // ─── GET /cases/:caseNumber ────────────────────────────────────────────────

  describe('GET /api/v1/moderation/cases/:caseNumber', () => {
    it('should return 400 for invalid (non-numeric) case number', async () => {
      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/cases/abc?guildId=guild1'));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid case number');
    });

    it('should return 400 when guildId is missing', async () => {
      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/cases/1'));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('guildId is required');
    });

    it('should return 404 when case not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/cases/999?guildId=guild1'));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Case not found');
    });

    it('should return the case with scheduled actions', async () => {
      const fakeCase = {
        id: 5,
        case_number: 1,
        action: 'ban',
        target_id: 'u1',
        target_tag: 'User#0001',
      };
      const fakeActions = [{ id: 1, action: 'unban', execute_at: new Date().toISOString() }];

      mockPool.query
        .mockResolvedValueOnce({ rows: [fakeCase] })
        .mockResolvedValueOnce({ rows: fakeActions });

      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/cases/1?guildId=guild1'));

      expect(res.status).toBe(200);
      expect(res.body.case_number).toBe(1);
      expect(res.body.action).toBe('ban');
      expect(res.body.scheduledActions).toHaveLength(1);
    });

    it('should return empty scheduledActions array when none exist', async () => {
      const fakeCase = { id: 5, case_number: 1, action: 'warn' };

      mockPool.query
        .mockResolvedValueOnce({ rows: [fakeCase] })
        .mockResolvedValueOnce({ rows: [] });

      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/cases/1?guildId=guild1'));

      expect(res.status).toBe(200);
      expect(res.body.scheduledActions).toHaveLength(0);
    });

    it('should handle DB error gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/cases/1?guildId=guild1'));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch mod case');
    });
  });

  // ─── GET /stats ───────────────────────────────────────────────────────────

  describe('GET /api/v1/moderation/stats', () => {
    it('should return 400 when guildId is missing', async () => {
      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/stats'));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('guildId is required');
    });

    it('should return stats summary', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 42 }] })
        .mockResolvedValueOnce({ rows: [{ total: 3 }] })
        .mockResolvedValueOnce({ rows: [{ total: 10 }] })
        .mockResolvedValueOnce({
          rows: [
            { action: 'warn', count: 5 },
            { action: 'ban', count: 2 },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ userId: 'u1', tag: 'User#1', count: 3 }] });

      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/stats?guildId=guild1'));

      expect(res.status).toBe(200);
      expect(res.body.totalCases).toBe(42);
      expect(res.body.last24h).toBe(3);
      expect(res.body.last7d).toBe(10);
      expect(res.body.byAction).toEqual({ warn: 5, ban: 2 });
      expect(res.body.topTargets).toHaveLength(1);
    });

    it('should return 0 totals when count rows are missing total field', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/stats?guildId=guild1'));

      expect(res.status).toBe(200);
      expect(res.body.totalCases).toBe(0);
      expect(res.body.last24h).toBe(0);
      expect(res.body.last7d).toBe(0);
      expect(res.body.byAction).toEqual({});
      expect(res.body.topTargets).toHaveLength(0);
    });

    it('should handle DB error gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/stats?guildId=guild1'));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch mod stats');
    });
  });

  // ─── GET /user/:userId/history ────────────────────────────────────────────

  describe('GET /api/v1/moderation/user/:userId/history', () => {
    it('should return 400 when guildId is missing', async () => {
      const app = buildApp();
      const res = await authed(request(app).get('/api/v1/moderation/user/u1/history'));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('guildId is required');
    });

    it('should return user history', async () => {
      const fakeCases = [
        { id: 1, case_number: 1, action: 'warn', target_id: 'u1' },
        { id: 2, case_number: 2, action: 'kick', target_id: 'u1' },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: fakeCases })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({
          rows: [
            { action: 'warn', count: 1 },
            { action: 'kick', count: 1 },
          ],
        });

      const app = buildApp();
      const res = await authed(
        request(app).get('/api/v1/moderation/user/u1/history?guildId=guild1'),
      );

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('u1');
      expect(res.body.cases).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.byAction).toEqual({ warn: 1, kick: 1 });
    });

    it('should handle pagination', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 50 }] })
        .mockResolvedValueOnce({ rows: [] });

      const app = buildApp();
      const res = await authed(
        request(app).get('/api/v1/moderation/user/u1/history?guildId=guild1&page=3&limit=10'),
      );

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(3);
      expect(res.body.limit).toBe(10);
      expect(res.body.pages).toBe(5);
    });

    it('should return total=0 when count row has no total field', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] });

      const app = buildApp();
      const res = await authed(
        request(app).get('/api/v1/moderation/user/u1/history?guildId=guild1'),
      );

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });

    it('should handle DB error gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const app = buildApp();
      const res = await authed(
        request(app).get('/api/v1/moderation/user/u1/history?guildId=guild1'),
      );

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch user mod history');
    });
  });
});
