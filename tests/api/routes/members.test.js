/**
 * Tests for src/api/routes/members.js
 * Covers enriched member list, detail, cases, XP adjustment, and CSV export.
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

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    reputation: {
      enabled: true,
      levelThresholds: [100, 300, 600, 1000],
    },
    permissions: { botOwners: [] },
  }),
  setConfigValue: vi.fn(),
}));

// oauthJwt is used by requireAuth — mock it to avoid real JWT parsing
vi.mock('../../../src/api/middleware/oauthJwt.js', () => ({
  handleOAuthJwt: vi.fn().mockResolvedValue(false),
  stopJwtCleanup: vi.fn(),
}));

import { createApp } from '../../../src/api/server.js';
import { getPool } from '../../../src/db.js';

const TEST_SECRET = 'test-members-secret';

/** Wrap request with auth header */
function authed(req) {
  return req.set('x-api-secret', TEST_SECRET);
}

describe('members routes', () => {
  let app;
  let mockPool;

  const mockMember1 = {
    id: 'user1',
    user: {
      username: 'alice',
      displayAvatarURL: () => 'https://cdn.example.com/alice.png',
    },
    displayName: 'Alice',
    roles: { cache: new Map([['role1', { id: 'role1', name: 'Admin', hexColor: '#ff0000' }]]) },
    joinedAt: new Date('2024-01-15'),
  };

  const mockMember2 = {
    id: 'user2',
    user: {
      username: 'bob',
      displayAvatarURL: () => 'https://cdn.example.com/bob.png',
    },
    displayName: 'Bob',
    roles: { cache: new Map() },
    joinedAt: new Date('2024-06-01'),
  };

  const mockGuild = {
    id: 'guild1',
    name: 'Test Server',
    iconURL: () => 'https://cdn.example.com/icon.png',
    memberCount: 100,
    channels: { cache: new Map() },
    roles: { cache: new Map() },
    members: {
      cache: new Map([
        ['user1', mockMember1],
        ['user2', mockMember2],
      ]),
      list: vi.fn().mockResolvedValue(
        new Map([
          ['user1', mockMember1],
          ['user2', mockMember2],
        ]),
      ),
      fetch: vi.fn().mockImplementation((userId) => {
        const member = userId === 'user1' ? mockMember1 : userId === 'user2' ? mockMember2 : null;
        if (!member) return Promise.reject(new Error('Unknown Member'));
        return Promise.resolve(member);
      }),
    },
  };

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);

    mockPool = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn(),
        release: vi.fn(),
      }),
    };
    getPool.mockReturnValue(mockPool);

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

  // ─── GET /:id/members — Enhanced member list ──────────────────────────────

  describe('GET /api/v1/guilds/:id/members (enhanced)', () => {
    function mockEmptyDbResults() {
      // stats, reputation, warnings — all empty
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
    }

    it('should return enriched members with stats', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'user1', messages_sent: 42, days_active: 10, last_active: '2024-12-01' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user1', xp: 250, level: 2 }],
        })
        .mockResolvedValueOnce({
          rows: [{ target_id: 'user1', count: 3 }],
        });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/members'));

      expect(res.status).toBe(200);
      expect(res.body.members).toHaveLength(2);
      expect(res.body.total).toBe(100);
      expect(res.body.nextAfter).toBe('user2');

      const alice = res.body.members.find((m) => m.id === 'user1');
      expect(alice.messages_sent).toBe(42);
      expect(alice.xp).toBe(250);
      expect(alice.level).toBe(2);
      expect(alice.warning_count).toBe(3);

      const bob = res.body.members.find((m) => m.id === 'user2');
      expect(bob.messages_sent).toBe(0);
      expect(bob.xp).toBe(0);
      expect(bob.warning_count).toBe(0);
    });

    it('should filter by search query', async () => {
      mockEmptyDbResults();

      const res = await authed(request(app).get('/api/v1/guilds/guild1/members?search=alice'));

      expect(res.status).toBe(200);
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0].username).toBe('alice');
      // Search should include filteredTotal
      expect(res.body.filteredTotal).toBe(1);
    });

    it('should sort by xp descending', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'user1', xp: 100, level: 1 },
            { user_id: 'user2', xp: 500, level: 3 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/members?sort=xp&order=desc'),
      );

      expect(res.status).toBe(200);
      expect(res.body.members[0].id).toBe('user2'); // higher xp first
      expect(res.body.members[1].id).toBe('user1');
    });

    it('should sort by messages ascending', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'user1', messages_sent: 100, days_active: 5, last_active: null },
            { user_id: 'user2', messages_sent: 10, days_active: 2, last_active: null },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/members?sort=messages&order=asc'),
      );

      expect(res.status).toBe(200);
      expect(res.body.members[0].id).toBe('user2'); // fewer messages first
    });

    it('should sort by warnings', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { target_id: 'user1', count: 5 },
            { target_id: 'user2', count: 1 },
          ],
        });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/members?sort=warnings&order=desc'),
      );

      expect(res.status).toBe(200);
      expect(res.body.members[0].warning_count).toBe(5);
    });

    it('should return 404 for unknown guild', async () => {
      const res = await authed(request(app).get('/api/v1/guilds/unknown/members'));
      expect(res.status).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/guilds/guild1/members');
      expect(res.status).toBe(401);
    });

    it('should handle DB error gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB down'));

      const res = await authed(request(app).get('/api/v1/guilds/guild1/members'));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch members');
    });
  });

  // ─── GET /:id/members/:userId — Member detail ─────────────────────────────

  describe('GET /api/v1/guilds/:id/members/:userId', () => {
    it('should return full profile with reputation and warnings', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              messages_sent: 150,
              reactions_given: 20,
              reactions_received: 30,
              days_active: 45,
              first_seen: '2024-01-15',
              last_active: '2024-12-01',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              xp: 350,
              level: 2,
              messages_count: 120,
              voice_minutes: 60,
              helps_given: 5,
              last_xp_gain: '2024-12-01',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: 2 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              case_number: 5,
              action: 'warn',
              reason: 'Spam',
              moderator_tag: 'Mod#1',
              created_at: '2024-11-01',
            },
            {
              case_number: 3,
              action: 'warn',
              reason: 'Language',
              moderator_tag: 'Mod#2',
              created_at: '2024-10-01',
            },
          ],
        });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/members/user1'));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('user1');
      expect(res.body.username).toBe('alice');
      expect(res.body.stats.messages_sent).toBe(150);
      expect(res.body.reputation.xp).toBe(350);
      expect(res.body.reputation.level).toBe(2);
      expect(res.body.reputation.next_level_xp).toBe(600); // thresholds[2]
      expect(res.body.warnings.count).toBe(2);
      expect(res.body.warnings.recent).toHaveLength(2);
    });

    it('should return null stats when user has no stats', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/members/user1'));

      expect(res.status).toBe(200);
      expect(res.body.stats).toBeNull();
      expect(res.body.reputation.xp).toBe(0);
      expect(res.body.reputation.level).toBe(0);
    });

    it('should return 404 for unknown member', async () => {
      const res = await authed(request(app).get('/api/v1/guilds/guild1/members/unknown'));
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Member not found in guild');
    });

    it('should handle DB error gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const res = await authed(request(app).get('/api/v1/guilds/guild1/members/user1'));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch member details');
    });
  });

  // ─── GET /:id/members/:userId/cases — Mod history ──────────────────────────

  describe('GET /api/v1/guilds/:id/members/:userId/cases', () => {
    it('should return paginated mod cases for user', async () => {
      const fakeCases = [
        {
          case_number: 3,
          action: 'warn',
          reason: 'Spam',
          moderator_tag: 'Mod#1',
          created_at: '2024-11-01',
        },
        {
          case_number: 1,
          action: 'kick',
          reason: 'Repeated violations',
          moderator_tag: 'Mod#2',
          created_at: '2024-09-01',
        },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: fakeCases })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/members/user1/cases'));

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('user1');
      expect(res.body.cases).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
      expect(res.body.pages).toBe(1);
    });

    it('should handle custom pagination', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 50 }] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/members/user1/cases?page=3&limit=10'),
      );

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(3);
      expect(res.body.pages).toBe(5);
    });

    it('should return empty cases for user with no history', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/members/user2/cases'));

      expect(res.status).toBe(200);
      expect(res.body.cases).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it('should handle DB error gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const res = await authed(request(app).get('/api/v1/guilds/guild1/members/user1/cases'));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch member cases');
    });
  });

  // ─── POST /:id/members/:userId/xp — XP adjustment ─────────────────────────

  describe('POST /api/v1/guilds/:id/members/:userId/xp', () => {
    it('should adjust XP correctly and return updated level', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ xp: 350, level: 2 }] }) // upsert
          .mockResolvedValueOnce({}) // level update
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };
      mockPool.connect.mockResolvedValueOnce(mockClient);

      const res = await authed(
        request(app)
          .post('/api/v1/guilds/guild1/members/user1/xp')
          .send({ amount: 100, reason: 'Helpful contribution' }),
      );

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('user1');
      expect(res.body.xp).toBe(350);
      expect(res.body.level).toBe(2);
      expect(res.body.adjustment).toBe(100);
      expect(res.body.reason).toBe('Helpful contribution');

      // Verify transaction was used
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle negative XP adjustment', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ xp: 50, level: 0 }] }) // upsert
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };
      mockPool.connect.mockResolvedValueOnce(mockClient);

      const res = await authed(
        request(app)
          .post('/api/v1/guilds/guild1/members/user1/xp')
          .send({ amount: -200, reason: 'Penalty' }),
      );

      expect(res.status).toBe(200);
      expect(res.body.xp).toBe(50);
      expect(res.body.adjustment).toBe(-200);
    });

    it('should reject when amount is zero', async () => {
      const res = await authed(
        request(app).post('/api/v1/guilds/guild1/members/user1/xp').send({ amount: 0 }),
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('amount must be a non-zero finite number');
    });

    it('should reject when amount is missing', async () => {
      const res = await authed(
        request(app).post('/api/v1/guilds/guild1/members/user1/xp').send({}),
      );

      expect(res.status).toBe(400);
    });

    it('should reject when amount is not a number', async () => {
      const res = await authed(
        request(app).post('/api/v1/guilds/guild1/members/user1/xp').send({ amount: 'fifty' }),
      );

      expect(res.status).toBe(400);
    });

    it('should reject non-admin (no auth)', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/members/user1/xp')
        .send({ amount: 100 });

      expect(res.status).toBe(401);
    });

    it('should reject XP amount exceeding bounds', async () => {
      const res = await authed(
        request(app).post('/api/v1/guilds/guild1/members/user1/xp').send({ amount: 2000000 }),
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('amount must be between -1000000 and 1000000');
    });

    it('should handle DB error gracefully', async () => {
      mockPool.connect.mockRejectedValueOnce(new Error('DB error'));

      const res = await authed(
        request(app).post('/api/v1/guilds/guild1/members/user1/xp').send({ amount: 50 }),
      );

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to adjust XP');
    });
  });

  // ─── GET /:id/members/export — CSV export ─────────────────────────────────

  describe('GET /api/v1/guilds/:id/members/export', () => {
    it('should return CSV with correct headers and data', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'user1', messages_sent: 42, days_active: 10, last_active: '2024-12-01' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user1', xp: 250, level: 2 }],
        })
        .mockResolvedValueOnce({
          rows: [{ target_id: 'user1', count: 1 }],
        });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/members/export'));

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment.*members\.csv/);

      const lines = res.text.trim().split('\n');
      expect(lines[0]).toBe(
        'userId,username,displayName,joinedAt,messages,xp,level,daysActive,warnings',
      );
      expect(lines.length).toBeGreaterThanOrEqual(3); // header + 2 members

      // Verify user1 row has enriched data
      const user1Line = lines.find((l) => l.startsWith('user1'));
      expect(user1Line).toBeDefined();
      expect(user1Line).toContain('42'); // messages
      expect(user1Line).toContain('250'); // xp
    });

    it('should return CSV with zero defaults for members without data', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/members/export'));

      expect(res.status).toBe(200);
      const lines = res.text.trim().split('\n');
      // Each member line should have 0s for stats
      for (const line of lines.slice(1)) {
        const parts = line.split(',');
        // messages, xp, level, daysActive, warnings should be 0
        expect(parts[4]).toBe('0'); // messages
        expect(parts[5]).toBe('0'); // xp
        expect(parts[6]).toBe('0'); // level
        expect(parts[7]).toBe('0'); // daysActive
        expect(parts[8]).toBe('0'); // warnings
      }
    });

    it('should return 404 for unknown guild', async () => {
      const res = await authed(request(app).get('/api/v1/guilds/unknown/members/export'));
      expect(res.status).toBe(404);
    });
  });
});
