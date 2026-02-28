/**
 * Tests for src/api/routes/tickets.js
 * Covers ticket listing, detail, stats, filtering, pagination, and auth.
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

const TEST_SECRET = 'test-tickets-secret';

function authed(req) {
  return req.set('x-api-secret', TEST_SECRET);
}

describe('tickets routes', () => {
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
      const res = await request(app).get('/api/guilds/guild1/tickets');
      expect(res.status).toBe(401);
    });

    it('should return 404 for unknown guild', async () => {
      const res = await authed(
        request(app).get('/api/guilds/unknown-guild/tickets'),
      );
      expect(res.status).toBe(404);
    });
  });

  // ─── GET /:id/tickets ─────────────────────────────────────────

  describe('GET /:id/tickets', () => {
    it('should return empty tickets list', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ total: 0 }] });
      // Two queries: count + list
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(request(app).get('/api/guilds/guild1/tickets'));
      expect(res.status).toBe(200);
      expect(res.body.tickets).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('should return tickets with pagination', async () => {
      const ticket = {
        id: 1,
        guild_id: 'guild1',
        user_id: 'user1',
        topic: 'Need help',
        status: 'open',
        thread_id: 'thread1',
        channel_id: 'ch1',
        closed_by: null,
        close_reason: null,
        created_at: '2024-01-01T00:00:00Z',
        closed_at: null,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [ticket] });

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets?page=1&limit=10'),
      );
      expect(res.status).toBe(200);
      expect(res.body.tickets).toHaveLength(1);
      expect(res.body.tickets[0].topic).toBe('Need help');
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
    });

    it('should filter by status', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets?status=open'),
      );
      expect(res.status).toBe(200);

      // Verify the query includes status filter
      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[0]).toContain('status = $');
      expect(countCall[1]).toContain('open');
    });

    it('should filter by user', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets?user=user123'),
      );
      expect(res.status).toBe(200);

      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[0]).toContain('user_id = $');
      expect(countCall[1]).toContain('user123');
    });

    it('should filter by both status and user', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets?status=closed&user=user456'),
      );
      expect(res.status).toBe(200);

      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[1]).toContain('closed');
      expect(countCall[1]).toContain('user456');
    });

    it('should clamp limit to max 100', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets?limit=999'),
      );
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });

    it('should default page to 1', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets?page=-1'),
      );
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
    });

    it('should ignore invalid status values', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets?status=invalid'),
      );
      expect(res.status).toBe(200);

      // Should not include status filter
      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[0]).not.toContain('status = $');
    });

    it('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValue(new Error('DB connection lost'));

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets'),
      );
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch tickets');
    });
  });

  // ─── GET /:id/tickets/:ticketId ───────────────────────────────

  describe('GET /:id/tickets/:ticketId', () => {
    it('should return ticket detail', async () => {
      const ticket = {
        id: 1,
        guild_id: 'guild1',
        user_id: 'user1',
        topic: 'Bug report',
        status: 'closed',
        transcript: [{ author: 'Alice', content: 'Hello', timestamp: '2024-01-01T00:00:00Z' }],
      };

      mockPool.query.mockResolvedValueOnce({ rows: [ticket] });

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets/1'),
      );
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
      expect(res.body.transcript).toHaveLength(1);
    });

    it('should return 404 for non-existent ticket', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets/999'),
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Ticket not found');
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Query failed'));

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets/1'),
      );
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /:id/tickets/stats ────────────────────────────────────

  describe('GET /:id/tickets/stats', () => {
    it('should return ticket stats', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })
        .mockResolvedValueOnce({ rows: [{ avg_seconds: 3600 }] })
        .mockResolvedValueOnce({ rows: [{ count: 12 }] });

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets/stats'),
      );
      expect(res.status).toBe(200);
      expect(res.body.openCount).toBe(5);
      expect(res.body.avgResolutionSeconds).toBe(3600);
      expect(res.body.ticketsThisWeek).toBe(12);
    });

    it('should return zero stats for empty guild', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ avg_seconds: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets/stats'),
      );
      expect(res.status).toBe(200);
      expect(res.body.openCount).toBe(0);
      expect(res.body.avgResolutionSeconds).toBe(0);
      expect(res.body.ticketsThisWeek).toBe(0);
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Stats query failed'));

      const res = await authed(
        request(app).get('/api/guilds/guild1/tickets/stats'),
      );
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch ticket stats');
    });
  });
});
