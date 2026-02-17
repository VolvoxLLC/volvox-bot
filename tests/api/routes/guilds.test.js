import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({ ai: { model: 'claude-3' } }),
  setConfigValue: vi.fn().mockResolvedValue({ model: 'claude-4' }),
}));

vi.mock('../../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue({ id: 'msg1' }),
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
      fetch: vi.fn().mockResolvedValue(new Map([['user1', mockMember]])),
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
    it('should return config', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/config')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ai: { model: 'claude-3' } });
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
    it('should return stats', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 42 }] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] });

      const res = await request(app).get('/api/v1/guilds/guild1/stats').set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.aiConversations).toBe(42);
      expect(res.body.moderationCases).toBe(5);
      expect(res.body.memberCount).toBe(100);
      expect(res.body.uptime).toBeTypeOf('number');
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
    it('should return paginated members', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/members')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(25);
      expect(res.body.total).toBe(100);
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0].username).toBe('testuser');
      expect(res.body.members[0].roles).toEqual([{ id: 'role1', name: 'Admin' }]);
    });

    it('should respect custom pagination params', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/members?page=2&limit=10')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(10);
      expect(mockGuild.members.fetch).toHaveBeenCalledWith({ limit: 10 });
    });

    it('should cap limit at 100', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/members?limit=200')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });

    it('should return 500 on fetch error', async () => {
      mockGuild.members.fetch.mockRejectedValueOnce(new Error('Discord error'));

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
      expect(safeSend).toHaveBeenCalledWith(mockChannel, 'Hello!');
    });

    it('should return 400 when content exceeds 2000 characters', async () => {
      const longContent = 'a'.repeat(2001);
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({ action: 'sendMessage', channelId: 'ch1', content: longContent });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('2000');
    });

    it('should return 400 when action is missing', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('action');
    });

    it('should return 400 for unknown action', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/actions')
        .set('x-api-secret', SECRET)
        .send({ action: 'unknown' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unknown action');
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
