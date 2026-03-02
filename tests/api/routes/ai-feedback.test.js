/**
 * Tests for src/api/routes/ai-feedback.js
 *
 * The route delegates all SQL to the aiFeedback module.
 * These tests mock the module functions so route behaviour
 * can be verified independently of the DB layer.
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

// Mock the aiFeedback module so route tests don't need a real DB pool
vi.mock('../../../src/modules/aiFeedback.js', () => ({
  getFeedbackStats: vi.fn(),
  getFeedbackTrend: vi.fn(),
  getRecentFeedback: vi.fn(),
}));

import { createApp } from '../../../src/api/server.js';
import {
  getFeedbackStats,
  getFeedbackTrend,
  getRecentFeedback,
} from '../../../src/modules/aiFeedback.js';

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
  let client;

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn(),
    };

    client = {
      guilds: { cache: new Map([[GUILD_ID, mockGuild]]) },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };

    app = createApp(client, mockPool);

    // Sensible defaults — individual tests override as needed
    getFeedbackStats.mockResolvedValue({ positive: 0, negative: 0, total: 0, ratio: null });
    getFeedbackTrend.mockResolvedValue([]);
    getRecentFeedback.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // ── GET /stats ─────────────────────────────────────────────────────────

  describe('GET /api/v1/guilds/:id/ai-feedback/stats', () => {
    it('returns 503 when DB is unavailable', async () => {
      const noDbApp = createApp(client, null);

      const res = await authed(
        request(noDbApp).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats`),
      );
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Database unavailable');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats`);
      expect(res.status).toBe(401);
    });

    it('returns aggregate stats with default 30-day window', async () => {
      getFeedbackStats.mockResolvedValueOnce({ positive: 10, negative: 3, total: 13, ratio: 77 });
      getFeedbackTrend.mockResolvedValueOnce([{ date: '2026-03-01', positive: 5, negative: 1 }]);

      const res = await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats`));

      expect(res.status).toBe(200);
      expect(res.body.positive).toBe(10);
      expect(res.body.negative).toBe(3);
      expect(res.body.total).toBe(13);
      expect(res.body.ratio).toBe(77);
      expect(res.body.trend).toHaveLength(1);
      expect(res.body.trend[0]).toEqual({ date: '2026-03-01', positive: 5, negative: 1 });

      // Module functions should be called with correct args
      expect(getFeedbackStats).toHaveBeenCalledWith(GUILD_ID);
      expect(getFeedbackTrend).toHaveBeenCalledWith(GUILD_ID, 30);
    });

    it('returns null ratio when total is 0', async () => {
      // defaults from beforeEach already return zeros

      const res = await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats`));

      expect(res.status).toBe(200);
      expect(res.body.ratio).toBeNull();
      expect(res.body.trend).toEqual([]);
    });

    it('accepts custom days param', async () => {
      const res = await authed(
        request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats?days=7`),
      );

      expect(res.status).toBe(200);
      expect(getFeedbackTrend).toHaveBeenCalledWith(GUILD_ID, 7);
    });

    it('ignores out-of-range days param (uses default 30)', async () => {
      await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats?days=999`));

      expect(getFeedbackTrend).toHaveBeenCalledWith(GUILD_ID, 30);
    });

    it('returns 500 on module error', async () => {
      getFeedbackStats.mockRejectedValueOnce(new Error('DB down'));

      const res = await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/stats`));

      expect(res.status).toBe(500);
    });
  });

  // ── GET /recent ──────────────────────────────────────────────────────────

  describe('GET /api/v1/guilds/:id/ai-feedback/recent', () => {
    it('returns 503 when DB is unavailable', async () => {
      const noDbApp = createApp(client, null);

      const res = await authed(
        request(noDbApp).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/recent`),
      );
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Database unavailable');
    });

    it('returns recent feedback entries', async () => {
      const fakeEntries = [
        {
          id: 1,
          messageId: 'msg-1',
          channelId: 'ch-1',
          userId: 'u-1',
          feedbackType: 'positive',
          createdAt: '2026-03-01T12:00:00Z',
        },
      ];
      getRecentFeedback.mockResolvedValueOnce(fakeEntries);

      const res = await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/recent`));

      expect(res.status).toBe(200);
      expect(res.body.feedback).toHaveLength(1);
      expect(res.body.feedback[0].messageId).toBe('msg-1');
      expect(res.body.feedback[0].feedbackType).toBe('positive');
    });

    it('accepts custom limit param', async () => {
      await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/recent?limit=10`));

      expect(getRecentFeedback).toHaveBeenCalledWith(GUILD_ID, 10);
    });

    it('clamps out-of-range limit to default (25)', async () => {
      await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/recent?limit=999`));

      expect(getRecentFeedback).toHaveBeenCalledWith(GUILD_ID, 25);
    });

    it('returns 500 on module error', async () => {
      getRecentFeedback.mockRejectedValueOnce(new Error('DB down'));

      const res = await authed(request(app).get(`/api/v1/guilds/${GUILD_ID}/ai-feedback/recent`));

      expect(res.status).toBe(500);
    });
  });
});
