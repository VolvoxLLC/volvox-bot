/**
 * Tests for src/api/routes/ai-feedback.js
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
  }),
  setConfigValue: vi.fn(),
}));

vi.mock('../../../src/api/middleware/oauthJwt.js', () => ({
  handleOAuthJwt: vi.fn().mockResolvedValue(false),
  stopJwtCleanup: vi.fn(),
}));

import { createApp } from '../../../src/api/server.js';

const TEST_SECRET = 'test-feedback-secret';
const GUILD_ID = 'guild1';

const mockGuild = {
  id: GUILD_ID,
  name: 'Test Server',
  iconURL: () => 'https://cdn.example.com/icon.png',
  memberCount: 100,
  channels: { cache: new Map() },
  roles: { cache: new Map() },
  members: { cache: new Map() },
};

function authed(req) {
  return req.set('x-api-secret', TEST_SECRET);
}

describe('ai-feedback routes', () => {
  let app;
  let mockPool;

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn(),
    };

    const client = {
      guilds: { cache: new Map([[GUILD_ID, mockGuild]]) },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };

    app = createApp(client, mockPool);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // ── GET /stats ─────────────────────────────────────────────────────────

  describe('GET /api/v1/guilds/:id/ai-feedback/stats', () => {
    it('returns 503 when DB is unavailable', async () => {
      const client = {
        guilds: { cache: new Map([[GUILD_ID, mockGuild]]) },
        ws: { status: 0, ping: 42 },
        user: { tag: 'Bot#1234' },
      };
      const noDbApp = createApp(client, null);

      const res = await authed(
        request(noDbApp).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats`),
      );
      expect(res.status).toBe(503);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats`);
      expect(res.status).toBe(401);
    });

    it('returns aggregate stats with default 30-day window', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ positive: 10, negative: 3, total: 13 }] })
        .mockResolvedValueOnce({
          rows: [{ date: '2026-03-01', positive: 5, negative: 1 }],
        });

      const res = await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats`));

      expect(res.status).toBe(200);
      expect(res.body.positive).toBe(10);
      expect(res.body.negative).toBe(3);
      expect(res.body.total).toBe(13);
      expect(res.body.ratio).toBe(77); // Math.round(10/13*100)
      expect(res.body.trend).toHaveLength(1);
    });

    it('returns null ratio when total is 0', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ positive: 0, negative: 0, total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats`));

      expect(res.status).toBe(200);
      expect(res.body.ratio).toBeNull();
      expect(res.body.trend).toEqual([]);
    });

    it('accepts custom days param', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ positive: 1, negative: 0, total: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats?days=7`),
      );

      expect(res.status).toBe(200);
      // Verify trend query used days=7
      const trendCall = mockPool.query.mock.calls[1];
      expect(trendCall[1]).toContain(7);
    });

    it('ignores out-of-range days param (uses default 30)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ positive: 0, negative: 0, total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats?days=999`));

      const trendCall = mockPool.query.mock.calls[1];
      expect(trendCall[1]).toContain(30);
    });

    it('returns 500 on DB error', async () => {
      mockPool.query.mockRejectedValue(new Error('DB down'));

      const res = await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats`));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch AI feedback stats');
    });
  });

  // ── GET /recent ──────────────────────────────────────────────────────────

  describe('GET /api/v1/guilds/:id/ai-feedback/recent', () => {
    it('returns 503 when DB is unavailable', async () => {
      const client = {
        guilds: { cache: new Map([[GUILD_ID, mockGuild]]) },
        ws: { status: 0, ping: 42 },
        user: { tag: 'Bot#1234' },
      };
      const noDbApp = createApp(client, null);

      const res = await authed(
        request(noDbApp).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/recent`),
      );
      expect(res.status).toBe(503);
    });

    it('returns recent feedback entries', async () => {
      const fakeRows = [
        {
          id: 1,
          message_id: 'msg-1',
          channel_id: 'ch-1',
          user_id: 'u-1',
          feedback_type: 'positive',
          created_at: '2026-03-01T12:00:00Z',
        },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: fakeRows });

      const res = await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/recent`));

      expect(res.status).toBe(200);
      expect(res.body.feedback).toHaveLength(1);
      expect(res.body.feedback[0].messageId).toBe('msg-1');
      expect(res.body.feedback[0].feedbackType).toBe('positive');
    });

    it('accepts custom limit param', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/recent?limit=10`));

      const [, params] = mockPool.query.mock.calls[0];
      expect(params).toContain(10);
    });

    it('clamps limit to 100 (uses default 25 for out-of-range)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/recent?limit=999`));

      const [, params] = mockPool.query.mock.calls[0];
      expect(params).toContain(25); // falls back to default
    });

    it('returns 500 on DB error', async () => {
      mockPool.query.mockRejectedValue(new Error('DB down'));

      const res = await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/recent`));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch recent AI feedback');
    });
  });
});
