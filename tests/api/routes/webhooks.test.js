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
  }),
  setConfigValue: vi.fn().mockResolvedValue({}),
}));

import { _resetSecretCache } from '../../../src/api/middleware/verifyJwt.js';
import { createApp } from '../../../src/api/server.js';
import { guildCache } from '../../../src/api/utils/discordApi.js';
import { sessionStore } from '../../../src/api/utils/sessionStore.js';
import { getConfig, setConfigValue } from '../../../src/modules/config.js';

describe('webhooks routes', () => {
  let app;
  const SECRET = 'test-secret';

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', SECRET);

    const client = {
      guilds: { cache: new Map() },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };

    app = createApp(client, null);
  });

  afterEach(() => {
    sessionStore.clear();
    guildCache.clear();
    _resetSecretCache();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function createOAuthToken(secret = 'jwt-test-secret', userId = '123') {
    sessionStore.set(userId, 'discord-access-token');
    return jwt.sign({ userId, username: 'testuser' }, secret, { algorithm: 'HS256' });
  }

  describe('POST /config-update', () => {
    it('should update config with api-secret auth', async () => {
      getConfig.mockReturnValueOnce({
        ai: { enabled: true, systemPrompt: 'claude-4' },
      });

      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: 'ai.systemPrompt', value: 'claude-4' });

      expect(res.status).toBe(200);
      expect(setConfigValue).toHaveBeenCalledWith('ai.systemPrompt', 'claude-4', 'guild1');
      expect(getConfig).toHaveBeenCalledWith('guild1');
      expect(res.body).toEqual({ enabled: true, systemPrompt: 'claude-4' });
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .send({ guildId: 'guild1', path: 'ai.systemPrompt', value: 'claude-4' });

      expect(res.status).toBe(401);
    });

    it('should return 403 for OAuth auth (api-secret only)', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();

      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('Authorization', `Bearer ${token}`)
        .send({ guildId: 'guild1', path: 'ai.systemPrompt', value: 'claude-4' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('API secret');
    });

    it('should return 400 when guildId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ path: 'ai.systemPrompt', value: 'claude-4' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('guildId');
    });

    it('should return 400 when path is missing', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', value: 'claude-4' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('path');
    });

    it('should return 400 when value is missing', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: 'ai.systemPrompt' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('value');
    });

    it('should return 403 when path targets a disallowed config key', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: 'database.host', value: 'evil-host' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not allowed');
    });

    it('should allow patching moderation config', async () => {
      getConfig.mockReturnValueOnce({
        moderation: { enabled: false },
      });

      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: 'moderation.enabled', value: false });

      expect(res.status).toBe(200);
      expect(setConfigValue).toHaveBeenCalledWith('moderation.enabled', false, 'guild1');
    });

    it('should return 400 when path has no dot separator', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: 'ai', value: {} });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('dot separator');
    });

    it('should return 400 when path has empty segments', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: 'ai..model', value: 'x' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('empty segments');
    });

    it('should return 500 when setConfigValue throws', async () => {
      setConfigValue.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: 'ai.systemPrompt', value: 'x' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to update config');
    });

    it('should return 400 when path exceeds 200 characters', async () => {
      const longPath = `ai.${'a'.repeat(200)}`;
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: longPath, value: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('maximum length');
    });

    it('should return 400 when path exceeds 10 segments', async () => {
      const deepPath = 'ai.a.b.c.d.e.f.g.h.i.j';
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: deepPath, value: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('maximum depth');
    });

    it('should return 400 for type mismatch on webhook config-update', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: 'ai.enabled', value: 'not-a-boolean' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Value validation failed');
      expect(res.body.details[0]).toContain('expected boolean');
    });

    it('should allow valid values through schema validation', async () => {
      getConfig.mockReturnValueOnce({ ai: { enabled: false } });
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: 'ai.enabled', value: false });

      expect(res.status).toBe(200);
    });
  });
});
