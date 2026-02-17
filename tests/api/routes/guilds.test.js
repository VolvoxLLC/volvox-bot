import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    ai: { model: 'claude-3' },
    welcome: { enabled: true },
    database: { host: 'secret-host' },
    token: 'secret-token',
  }),
  setConfigValue: vi.fn().mockResolvedValue({ model: 'claude-4' }),
}));

vi.mock('../../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue({ id: 'msg1', content: 'Hello!' }),
}));

import { createApp } from '../../../src/api/server.js';
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
    user: { username: 'testuser' },
    displayName: 'Test User',
    roles: { cache: new Map([['role1', { id: 'role1', name: 'Admin' }]]) },
    joinedAt: new Date('2024-01-01'),
  };

  const mockGuild = {
    id: 'guild1',
    name: 'Test Server',
    iconURL: () => 'https://cdn.example.com/icon.png',
    memberCount: 100,
    channels: { cache: channelCache },
    members: {
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
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('authentication', () => {
    it('should return 401 without x-api-secret header', async () => {
      const res = await request(app).get('/api/v1/guilds/guild1');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 with wrong secret', async () => {
      const res = await request(app).get('/api/v1/guilds/guild1').set('x-api-secret', 'wrong');

      expect(res.status).toBe(401);
    });
  });

  describe('guild validation', () => {
    it('should return 404 for unknown guild', async () => {
      const res = await request(app).get('/api/v1/guilds/unknown').set('x-api-secret', SECRET);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Guild not found');
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

  describe('GET /:id/config', () => {
    it('should return only safe config keys', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.ai).toEqual({ model: 'claude-3' });
      expect(res.body.welcome).toEqual({ enabled: true });
      expect(res.body.database).toBeUndefined();
      expect(res.body.token).toBeUndefined();
      expect(getConfig).toHaveBeenCalled();
    });
  });

  describe('PATCH /:id/config', () => {
    it('should update config value', async () => {
      const res = await request(app)
        .patch('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET)
        .send({ path: 'ai.model', value: 'claude-4' });

      expect(res.status).toBe(200);
      expect(setConfigValue).toHaveBeenCalledWith('ai.model', 'claude-4');
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
  });

  describe('POST /:id/actions', () => {
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

    it('should reject content exceeding 2000 characters', async () => {
      const longContent = 'a'.repeat(2001);
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({ action: 'sendMessage', channelId: 'ch1', content: longContent });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/2000/);
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
      expect(res.body.error).toContain('Unknown action');
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
