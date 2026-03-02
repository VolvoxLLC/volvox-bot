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

// ─── Export helpers ───────────────────────────────────────────────────────────

import { escapeCsvValue, rowsToCsv } from '../../../src/api/routes/auditLog.js';

describe('CSV helpers', () => {
  describe('escapeCsvValue', () => {
    it('should return empty string for null/undefined', () => {
      expect(escapeCsvValue(null)).toBe('');
      expect(escapeCsvValue(undefined)).toBe('');
    });

    it('should return plain string without special chars', () => {
      expect(escapeCsvValue('config.update')).toBe('config.update');
    });

    it('should wrap in quotes if value contains comma', () => {
      expect(escapeCsvValue('a,b')).toBe('"a,b"');
    });

    it('should escape internal double quotes', () => {
      expect(escapeCsvValue('say "hello"')).toBe('"say ""hello"""');
    });

    it('should wrap in quotes if value contains newline', () => {
      expect(escapeCsvValue('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should stringify objects as JSON', () => {
      const val = escapeCsvValue({ key: 'value' });
      expect(val).toBe('"{""key"":""value""}"');
    });
  });

  describe('rowsToCsv', () => {
    it('should produce header line for empty array', () => {
      const csv = rowsToCsv([]);
      expect(csv).toBe(
        'id,guild_id,user_id,action,target_type,target_id,details,ip_address,created_at',
      );
    });

    it('should produce correct CSV for a row', () => {
      const rows = [
        {
          id: 1,
          guild_id: 'guild1',
          user_id: 'user1',
          action: 'config.update',
          target_type: null,
          target_id: null,
          details: null,
          ip_address: '127.0.0.1',
          created_at: '2026-01-01T00:00:00Z',
        },
      ];
      const csv = rowsToCsv(rows);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('config.update');
      expect(lines[1]).toContain('127.0.0.1');
    });
  });
});

// ─── GET /:id/audit-log/export ────────────────────────────────────────────────

describe('GET /:id/audit-log/export', () => {
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
    vi.stubEnv('BOT_API_SECRET', 'test-audit-secret');

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

  it('should return 401 without auth', async () => {
    const res = await request(app).get('/api/v1/guilds/guild1/audit-log/export');
    expect(res.status).toBe(401);
  });

  it('should export JSON by default', async () => {
    const mockRows = [
      {
        id: 1,
        guild_id: 'guild1',
        user_id: 'user1',
        action: 'config.update',
        target_type: null,
        target_id: null,
        details: null,
        ip_address: '127.0.0.1',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockRows });

    const res = await request(app)
      .get('/api/v1/guilds/guild1/audit-log/export')
      .set('x-api-secret', 'test-audit-secret');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.guildId).toBe('guild1');
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.count).toBe(1);
  });

  it('should export CSV when format=csv', async () => {
    const mockRows = [
      {
        id: 1,
        guild_id: 'guild1',
        user_id: 'user1',
        action: 'config.update',
        target_type: null,
        target_id: null,
        details: null,
        ip_address: '127.0.0.1',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockRows });

    const res = await request(app)
      .get('/api/v1/guilds/guild1/audit-log/export?format=csv')
      .set('x-api-secret', 'test-audit-secret');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('guild_id,user_id,action');
    expect(res.text).toContain('config.update');
  });

  it('should return 400 for invalid format', async () => {
    const res = await request(app)
      .get('/api/v1/guilds/guild1/audit-log/export?format=xml')
      .set('x-api-secret', 'test-audit-secret');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid format');
  });

  it('should return 503 when database is unavailable', async () => {
    const client = {
      guilds: { cache: new Map([['guild1', mockGuild]]) },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };
    const appNoDb = createApp(client, null);

    const res = await request(appNoDb)
      .get('/api/v1/guilds/guild1/audit-log/export')
      .set('x-api-secret', 'test-audit-secret');

    expect(res.status).toBe(503);
  });

  it('should return 500 on database error', async () => {
    mockPool.query.mockRejectedValue(new Error('DB error'));

    const res = await request(app)
      .get('/api/v1/guilds/guild1/audit-log/export')
      .set('x-api-secret', 'test-audit-secret');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to export audit log');
  });

  it('should cap export limit at 10000', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/v1/guilds/guild1/audit-log/export?limit=99999')
      .set('x-api-secret', 'test-audit-secret');

    expect(res.status).toBe(200);
    // Verify the query was called with limit=10000
    const call = mockPool.query.mock.calls[0];
    expect(call[1]).toContain(10000);
  });

  it('should apply filters to export query', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/v1/guilds/guild1/audit-log/export?format=json&action=config.update&userId=user42')
      .set('x-api-secret', 'test-audit-secret');

    const call = mockPool.query.mock.calls[0];
    expect(call[0]).toContain('action = $2');
    expect(call[0]).toContain('user_id = $3');
    expect(call[1]).toContain('config.update');
    expect(call[1]).toContain('user42');
  });

  it('should return 404 for unknown guild', async () => {
    const res = await request(app)
      .get('/api/v1/guilds/unknown-guild/audit-log/export')
      .set('x-api-secret', 'test-audit-secret');
    expect(res.status).toBe(404);
  });
});
