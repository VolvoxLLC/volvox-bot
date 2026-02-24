import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    ai: { enabled: true, model: 'claude-3', historyLength: 20 },
    welcome: { enabled: true },
    spam: { enabled: true },
    moderation: { enabled: true },
    triage: { enabled: true },
    permissions: { botOwners: [] },
    database: { host: 'secret-host' },
    token: 'secret-token',
  }),
  setConfigValue: vi.fn().mockResolvedValue({ model: 'claude-4' }),
}));

vi.mock('../../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue({ id: 'msg1', content: 'Hello!' }),
}));

import { _resetSecretCache } from '../../../src/api/middleware/verifyJwt.js';
import { createApp } from '../../../src/api/server.js';
import { guildCache } from '../../../src/api/utils/discordApi.js';
import { sessionStore } from '../../../src/api/utils/sessionStore.js';
import { getConfig, setConfigValue } from '../../../src/modules/config.js';
import { safeSend } from '../../../src/utils/safeSend.js';

describe('guilds routes', () => {
  let app;
  let mockPool;
  const SECRET = 'test-secret';

  const mockChannel = {
    id: 'ch1',
    name: 'general',
    type: 0,
    isTextBased: () => true,
    send: vi.fn().mockResolvedValue({ id: 'msg1' }),
  };

  const mockVoiceChannel = {
    id: 'ch2',
    name: 'voice',
    type: 2,
    isTextBased: () => false,
  };

  const channelCache = new Map([
    ['ch1', mockChannel],
    ['ch2', mockVoiceChannel],
  ]);

  const mockMember = {
    id: 'user1',
    user: { username: 'testuser', bot: false },
    displayName: 'Test User',
    roles: { cache: new Map([['role1', { id: 'role1', name: 'Admin' }]]) },
    joinedAt: new Date('2024-01-01'),
    joinedTimestamp: new Date('2024-01-01').getTime(),
    presence: { status: 'online' },
  };

  const mockGuild = {
    id: 'guild1',
    name: 'Test Server',
    iconURL: () => 'https://cdn.example.com/icon.png',
    memberCount: 100,
    channels: { cache: channelCache },
    members: {
      cache: new Map([['user1', mockMember]]),
      list: vi.fn().mockResolvedValue(new Map([['user1', mockMember]])),
    },
  };

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', SECRET);

    mockPool = {
      query: vi.fn(),
    };

    const client = {
      guilds: { cache: new Map([['guild1', mockGuild]]) },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };

    app = createApp(client, mockPool);
  });

  afterEach(() => {
    sessionStore.clear();
    guildCache.clear();
    _resetSecretCache();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /**
   * Helper: create a JWT and populate the server-side session store
   */
  function createOAuthToken(secret = 'jwt-test-secret', userId = '123') {
    sessionStore.set(userId, 'discord-access-token');
    return jwt.sign(
      {
        userId,
        username: 'testuser',
      },
      secret,
      { algorithm: 'HS256' },
    );
  }

  function mockFetchGuilds(guilds) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => guilds,
    });
  }

  describe('authentication', () => {
    it('should return 401 without x-api-secret header', async () => {
      const res = await request(app).get('/api/v1/guilds/guild1');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 with wrong secret', async () => {
      const res = await request(app).get('/api/v1/guilds/guild1').set('x-api-secret', 'wrong');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid API secret');
    });

    it('should authenticate with valid JWT Bearer token', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();
      mockFetchGuilds([{ id: 'guild1', name: 'Test Server', permissions: String(0x8) }]);

      const res = await request(app)
        .get('/api/v1/guilds/guild1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('guild1');
    });

    it('should return 401 when session has been revoked', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      // Sign a valid JWT but do NOT populate sessionStore
      const token = jwt.sign({ userId: '789', username: 'revokeduser' }, 'jwt-test-secret', {
        algorithm: 'HS256',
      });

      const res = await request(app)
        .get('/api/v1/guilds/guild1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Session expired or revoked');
    });
  });

  describe('guild validation', () => {
    it('should return 404 for unknown guild', async () => {
      const res = await request(app).get('/api/v1/guilds/unknown').set('x-api-secret', SECRET);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Guild not found');
    });
  });

  describe('GET /', () => {
    it('should return all guilds for api-secret auth', async () => {
      const res = await request(app).get('/api/v1/guilds').set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('guild1');
      expect(res.body[0].name).toBe('Test Server');
      expect(res.body[0].memberCount).toBe(100);
    });

    it('should return OAuth guilds with access metadata', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();
      mockFetchGuilds([
        { id: 'guild1', name: 'Test Server', permissions: '8' },
        { id: 'guild-not-in-bot', name: 'Other Server', permissions: '8' },
      ]);

      const res = await request(app).get('/api/v1/guilds').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      // Only guild1 (bot is in it AND user has admin), not guild-not-in-bot
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('guild1');
      expect(res.body[0].access).toBe('admin');
    });

    it('should include guilds where OAuth user has MANAGE_GUILD', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();
      // 0x20 = MANAGE_GUILD but not ADMINISTRATOR
      mockFetchGuilds([{ id: 'guild1', name: 'Test Server', permissions: '32' }]);

      const res = await request(app).get('/api/v1/guilds').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('guild1');
      expect(res.body[0].access).toBe('moderator');
    });

    it('should include admin and moderator access values when both are present', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();
      const mockGuild2 = {
        ...mockGuild,
        id: 'guild2',
        name: 'Second Server',
        memberCount: 50,
      };
      const client = {
        guilds: {
          cache: new Map([
            ['guild1', mockGuild],
            ['guild2', mockGuild2],
          ]),
        },
        ws: { status: 0, ping: 42 },
        user: { tag: 'Bot#1234' },
      };
      app = createApp(client, mockPool);
      mockFetchGuilds([
        { id: 'guild1', name: 'Test Server', permissions: String(0x8) },
        { id: 'guild2', name: 'Second Server', permissions: String(0x20) },
      ]);

      const res = await request(app).get('/api/v1/guilds').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.find((g) => g.id === 'guild1')?.access).toBe('admin');
      expect(res.body.find((g) => g.id === 'guild2')?.access).toBe('moderator');
    });

    it('should allow bot-owner OAuth users to list all bot guilds without Discord fetch', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      getConfig.mockReturnValueOnce({
        ai: { model: 'claude-3' },
        welcome: { enabled: true },
        spam: { enabled: true },
        moderation: { enabled: true },
        permissions: { botOwners: ['owner-1'] },
      });
      const token = createOAuthToken('jwt-test-secret', 'owner-1');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await request(app).get('/api/v1/guilds').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('guild1');
      expect(res.body[0].access).toBe('bot-owner');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should exclude guilds where OAuth user has no admin permissions', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();
      mockFetchGuilds([{ id: 'guild1', name: 'Test Server', permissions: '0' }]);

      const res = await request(app).get('/api/v1/guilds').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('GET /:id', () => {
    it('should return guild info', async () => {
      const res = await request(app).get('/api/v1/guilds/guild1').set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('guild1');
      expect(res.body.name).toBe('Test Server');
      expect(res.body.icon).toBe('https://cdn.example.com/icon.png');
      expect(res.body.memberCount).toBe(100);
      expect(res.body.channels).toBeInstanceOf(Array);
      expect(res.body.channels).toHaveLength(2);
    });
  });

  describe('guild admin verification (OAuth)', () => {
    it('should allow api-secret users to access admin endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
    });

    it('should allow OAuth users with admin permission on guild', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();
      mockFetchGuilds([{ id: 'guild1', name: 'Test', permissions: '8' }]);

      const res = await request(app)
        .get('/api/v1/guilds/guild1/config')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('should deny OAuth users with only MANAGE_GUILD on admin endpoints', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();
      // 0x20 = MANAGE_GUILD but not ADMINISTRATOR — admin requires ADMINISTRATOR only
      mockFetchGuilds([{ id: 'guild1', name: 'Test', permissions: '32' }]);

      const res = await request(app)
        .get('/api/v1/guilds/guild1/config')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('admin access');
    });

    it('should deny OAuth users without admin or manage-guild permission', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();
      mockFetchGuilds([{ id: 'guild1', name: 'Test', permissions: '0' }]);

      const res = await request(app)
        .get('/api/v1/guilds/guild1/config')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('admin access');
    });

    it('should deny OAuth users not in the guild', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();
      mockFetchGuilds([{ id: 'other-guild', name: 'Other', permissions: '8' }]);

      const res = await request(app)
        .get('/api/v1/guilds/guild1/config')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('admin access');
    });

    it('should allow bot-owner OAuth users to access admin endpoints without Discord fetch', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      getConfig.mockReturnValueOnce({
        ai: { model: 'claude-3' },
        welcome: { enabled: true },
        spam: { enabled: true },
        moderation: { enabled: true },
        permissions: { botOwners: ['owner-admin'] },
      });
      const token = createOAuthToken('jwt-test-secret', 'owner-admin');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await request(app)
        .get('/api/v1/guilds/guild1/config')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('GET /:id/config', () => {
    it('should return only safe config keys', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.ai).toEqual({ enabled: true, model: 'claude-3', historyLength: 20 });
      expect(res.body.welcome).toEqual({ enabled: true });
      expect(res.body.moderation).toEqual({ enabled: true });
      expect(res.body.triage).toEqual({ enabled: true });
      expect(res.body.permissions).toEqual({ botOwners: [] });
      expect(res.body.database).toBeUndefined();
      expect(res.body.token).toBeUndefined();
      expect(getConfig).toHaveBeenCalledWith('guild1');
    });
  });

  describe('PATCH /:id/config', () => {
    it('should update config value', async () => {
      getConfig.mockReturnValueOnce({
        ai: { enabled: true, model: 'claude-4', historyLength: 20 },
      });

      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ path: 'ai.model', value: 'claude-4' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ enabled: true, model: 'claude-4', historyLength: 20 });
      expect(setConfigValue).toHaveBeenCalledWith('ai.model', 'claude-4', 'guild1');
      expect(getConfig).toHaveBeenCalledWith('guild1');
    });

    it('should return 400 when request body is missing', async () => {
      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .set('Content-Type', 'text/plain')
        .send('not json');

      expect(res.status).toBe(400);
    });

    it('should return 400 when path is missing', async () => {
      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ value: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('path');
    });

    it('should return 403 when path targets a disallowed config key', async () => {
      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ path: 'database.host', value: 'evil-host' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not allowed');
    });

    it('should allow patching moderation config', async () => {
      getConfig.mockReturnValueOnce({
        moderation: { enabled: false },
      });

      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ path: 'moderation.enabled', value: false });

      expect(res.status).toBe(200);
      expect(setConfigValue).toHaveBeenCalledWith('moderation.enabled', false, 'guild1');
    });

    it('should return 400 when value is missing', async () => {
      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ path: 'ai.model' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('value');
    });

    it('should return 500 when setConfigValue throws', async () => {
      setConfigValue.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ path: 'ai.model', value: 'x' });

      expect(res.status).toBe(500);
    });

    it('should return 400 when path exceeds 200 characters', async () => {
      const longPath = `ai.${'a'.repeat(200)}`;
      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ path: longPath, value: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('maximum length');
    });

    it('should return 400 when path exceeds 10 segments', async () => {
      const deepPath = 'ai.a.b.c.d.e.f.g.h.i.j';
      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ path: deepPath, value: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('maximum depth');
    });

    it('should accept path with exactly 10 segments', async () => {
      getConfig.mockReturnValueOnce({ ai: {} });
      const exactPath = 'ai.a.b.c.d.e.f.g.h.i';
      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ path: exactPath, value: 'test' });

      expect(res.status).toBe(200);
    });

    it('should return 400 for type mismatch on PATCH', async () => {
      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ path: 'ai.enabled', value: 'not-a-boolean' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Value validation failed');
      expect(res.body.details[0]).toContain('expected boolean');
    });

    it('should allow valid values through schema validation on PATCH', async () => {
      getConfig.mockReturnValueOnce({ ai: { enabled: true } });
      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ path: 'ai.enabled', value: true });

      expect(res.status).toBe(200);
    });

    describe('dashboard webhook notifications', () => {
      it('should fire dashboard webhook when DASHBOARD_WEBHOOK_URL is set', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
        vi.stubEnv('DASHBOARD_WEBHOOK_URL', 'https://dashboard.example.com/hook');
        getConfig.mockReturnValueOnce({
          ai: { enabled: true, model: 'claude-4' },
        });

        const res = await request(app)
          .patch('/api/v1/guilds/guild1/config')
          .set('x-api-secret', SECRET)
          .send({ path: 'ai.model', value: 'claude-4' });

        expect(res.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledOnce();
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://dashboard.example.com/hook');
        expect(opts.method).toBe('POST');
        const body = JSON.parse(opts.body);
        expect(body.event).toBe('config.updated');
        expect(body.guildId).toBe('guild1');
        expect(body.updatedKeys).toEqual(['ai.model']);
        expect(body.timestamp).toBeTypeOf('number');
      });

      it('should not fire dashboard webhook when DASHBOARD_WEBHOOK_URL is unset', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
        getConfig.mockReturnValueOnce({
          ai: { enabled: true, model: 'claude-4' },
        });

        const res = await request(app)
          .patch('/api/v1/guilds/guild1/config')
          .set('x-api-secret', SECRET)
          .send({ path: 'ai.model', value: 'claude-4' });

        expect(res.status).toBe(200);
        expect(fetchSpy).not.toHaveBeenCalled();
      });

      it('should not block response when dashboard webhook fails', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
        vi.stubEnv('DASHBOARD_WEBHOOK_URL', 'https://dashboard.example.com/hook');
        getConfig.mockReturnValueOnce({
          ai: { enabled: true, model: 'claude-4' },
        });

        const res = await request(app)
          .patch('/api/v1/guilds/guild1/config')
          .set('x-api-secret', SECRET)
          .send({ path: 'ai.model', value: 'claude-4' });

        expect(res.status).toBe(200);
      });
    });
  });

  describe('GET /:id/stats', () => {
    it('should return stats scoped to guild', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 42 }] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] });

      const res = await request(app).get('/api/v1/guilds/guild1/stats').set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.aiConversations).toBe(42);
      expect(res.body.moderationCases).toBe(5);
      expect(res.body.memberCount).toBe(100);
      expect(res.body.uptime).toBeTypeOf('number');
      // Conversations query should be scoped to guild ID
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM conversations WHERE guild_id'),
        ['guild1'],
      );
    });

    it('should return 503 when database is not available', async () => {
      const client = {
        guilds: { cache: new Map([['guild1', mockGuild]]) },
        ws: { status: 0, ping: 42 },
        user: { tag: 'Bot#1234' },
      };
      const noDbApp = createApp(client, null);

      const res = await request(noDbApp)
        .get('/api/v1/guilds/guild1/stats')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(503);
    });

    it('should return 500 on query error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/api/v1/guilds/guild1/stats').set('x-api-secret', SECRET);

      expect(res.status).toBe(500);
    });
  });

  describe('GET /:id/analytics', () => {
    it('should return analytics payload with KPIs, charts, and realtime indicators', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              total_messages: 120,
              ai_requests: 40,
              active_users: 10,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              bucket: '2026-02-17T00:00:00.000Z',
              messages: 120,
              ai_requests: 40,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              channel_id: 'ch1',
              messages: 80,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              day_of_week: 2,
              hour_of_day: 14,
              messages: 12,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              model: 'claude-sonnet-4-20250514',
              requests: 40,
              prompt_tokens: 5000,
              completion_tokens: 2000,
              cost_usd: '0.0456',
            },
          ],
        });

      const res = await request(app)
        .get('/api/v1/guilds/guild1/analytics?range=week')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.guildId).toBe('guild1');
      expect(res.body.kpis.totalMessages).toBe(120);
      expect(res.body.kpis.aiRequests).toBe(40);
      expect(res.body.kpis.activeUsers).toBe(10);
      expect(res.body.kpis.aiCostUsd).toBeCloseTo(0.0456, 6);
      expect(res.body.kpis.newMembers).toBeTypeOf('number');
      expect(res.body.realtime.activeAiConversations).toBe(3);
      expect(res.body.aiUsage.tokens.prompt).toBe(5000);
      expect(res.body.aiUsage.tokens.completion).toBe(2000);
      expect(res.body.channelActivity[0]).toEqual({
        channelId: 'ch1',
        name: 'general',
        messages: 80,
      });
      expect(res.body.messageVolume).toHaveLength(1);
      expect(res.body.heatmap).toHaveLength(1);
    });

    it('should return 400 for invalid custom range params', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/analytics?range=custom')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/from/i);
    });

    it('should anchor today range to UTC midnight', async () => {
      const setUTCHoursSpy = vi.spyOn(Date.prototype, 'setUTCHours');

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total_messages: 1, ai_requests: 1, active_users: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/guilds/guild1/analytics?range=today')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(setUTCHoursSpy).toHaveBeenCalledWith(0, 0, 0, 0);
    });

    it('should include channelId in query filters when provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total_messages: 1, ai_requests: 1, active_users: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/guilds/guild1/analytics?range=week&channelId=ch1')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(
        mockPool.query.mock.calls.some(([, params]) =>
          Array.isArray(params) ? params.includes('ch1') : false,
        ),
      ).toBe(true);
    });

    it('should gracefully degrade when logs query fails', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total_messages: 1, ai_requests: 1, active_users: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockRejectedValueOnce(new Error('logs relation missing'));

      const res = await request(app)
        .get('/api/v1/guilds/guild1/analytics?range=week')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.aiUsage.byModel).toEqual([]);
      expect(res.body.kpis.aiCostUsd).toBe(0);
      expect(res.body.kpis.newMembers).toBeTypeOf('number');
    });
  });

  describe('GET /:id/members', () => {
    it('should return cursor-paginated members', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/members')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(25);
      expect(res.body.after).toBeNull();
      expect(res.body.nextAfter).toBe('user1');
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0].username).toBe('testuser');
      expect(res.body.members[0].roles).toEqual([{ id: 'role1', name: 'Admin' }]);
      expect(mockGuild.members.list).toHaveBeenCalledWith({ limit: 25, after: undefined });
    });

    it('should pass after cursor and custom limit to guild.members.list', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/members?limit=10&after=user0')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(10);
      expect(res.body.after).toBe('user0');
      expect(mockGuild.members.list).toHaveBeenCalledWith({ limit: 10, after: 'user0' });
    });

    it('should cap limit at 100', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/members?limit=200')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
      expect(mockGuild.members.list).toHaveBeenCalledWith({ limit: 100, after: undefined });
    });

    it('should return null nextAfter when no members returned', async () => {
      mockGuild.members.list.mockResolvedValueOnce(new Map());

      const res = await request(app)
        .get('/api/v1/guilds/guild1/members')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.nextAfter).toBeNull();
      expect(res.body.members).toHaveLength(0);
    });

    it('should return 500 on fetch error', async () => {
      mockGuild.members.list.mockRejectedValueOnce(new Error('Discord error'));

      const res = await request(app)
        .get('/api/v1/guilds/guild1/members')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(500);
    });
  });

  describe('GET /:id/moderation', () => {
    it('should return paginated mod cases', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 50 }] }).mockResolvedValueOnce({
        rows: [{ id: 1, case_number: 1, action: 'warn', guild_id: 'guild1' }],
      });

      const res = await request(app)
        .get('/api/v1/guilds/guild1/moderation')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(25);
      expect(res.body.total).toBe(50);
      expect(res.body.cases).toHaveLength(1);
    });

    it('should return 503 when database is not available', async () => {
      const client = {
        guilds: { cache: new Map([['guild1', mockGuild]]) },
        ws: { status: 0, ping: 42 },
        user: { tag: 'Bot#1234' },
      };
      const noDbApp = createApp(client, null);

      const res = await request(noDbApp)
        .get('/api/v1/guilds/guild1/moderation')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(503);
    });

    it('should use parameterized queries', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/api/v1/guilds/guild1/moderation?page=2&limit=10')
        .set('x-api-secret', SECRET);

      // COUNT query
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE guild_id = $1'), [
        'guild1',
      ]);
      // SELECT query with LIMIT/OFFSET
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $2 OFFSET $3'), [
        'guild1',
        10,
        10,
      ]);
    });

    it('should allow OAuth users with MANAGE_GUILD permission', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();
      mockFetchGuilds([{ id: 'guild1', name: 'Test', permissions: String(0x20) }]);
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] }).mockResolvedValueOnce({
        rows: [{ id: 1, case_number: 1, action: 'warn', guild_id: 'guild1' }],
      });

      const res = await request(app)
        .get('/api/v1/guilds/guild1/moderation')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    it('should allow bot-owner OAuth users on moderator endpoints without Discord fetch', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      getConfig.mockReturnValueOnce({
        ai: { model: 'claude-3' },
        welcome: { enabled: true },
        spam: { enabled: true },
        moderation: { enabled: true },
        permissions: { botOwners: ['owner-mod'] },
      });
      const token = createOAuthToken('jwt-test-secret', 'owner-mod');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] }).mockResolvedValueOnce({
        rows: [{ id: 1, case_number: 1, action: 'warn', guild_id: 'guild1' }],
      });

      const res = await request(app)
        .get('/api/v1/guilds/guild1/moderation')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should deny OAuth users without moderator permissions', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();
      mockFetchGuilds([{ id: 'guild1', name: 'Test', permissions: '0' }]);

      const res = await request(app)
        .get('/api/v1/guilds/guild1/moderation')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('moderator access');
    });
  });

  describe('POST /:id/actions', () => {
    it('should return 400 when request body is missing', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .set('Content-Type', 'text/plain')
        .send('not json');

      expect(res.status).toBe(400);
    });

    it('should send a message to a channel using safeSend', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({ action: 'sendMessage', channelId: 'ch1', content: 'Hello!' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('msg1');
      expect(res.body.content).toBe('Hello!');
      expect(safeSend).toHaveBeenCalledWith(mockChannel, 'Hello!');
    });

    it('should allow content over 2000 chars (safeSend handles splitting)', async () => {
      const longContent = 'a'.repeat(3000);
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({ action: 'sendMessage', channelId: 'ch1', content: longContent });

      expect(res.status).toBe(201);
      expect(safeSend).toHaveBeenCalledWith(mockChannel, longContent);
    });

    it('should reject content exceeding 10000 characters', async () => {
      const longContent = 'a'.repeat(10001);
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({ action: 'sendMessage', channelId: 'ch1', content: longContent });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/10000/);
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should return 400 when action is missing', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('action');
    });

    it('should return 400 for unknown action without reflecting input', async () => {
      const maliciousAction = '<script>alert("xss")</script>';
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({ action: maliciousAction });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unsupported action type');
      expect(res.body.error).not.toContain(maliciousAction);
    });

    it('should return 400 when channelId or content is missing for sendMessage', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({ action: 'sendMessage' });

      expect(res.status).toBe(400);
    });

    it('should return 404 when channel not in guild', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({ action: 'sendMessage', channelId: 'unknown', content: 'Hi' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Channel not found');
    });

    it('should return 400 when channel is not text-based', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({ action: 'sendMessage', channelId: 'ch2', content: 'Hi' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not a text channel');
    });

    it('should return 500 when send fails', async () => {
      safeSend.mockRejectedValueOnce(new Error('Discord error'));

      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({ action: 'sendMessage', channelId: 'ch1', content: 'Hi' });

      expect(res.status).toBe(500);
    });
  });
});
