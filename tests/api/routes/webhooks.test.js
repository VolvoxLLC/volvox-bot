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
        ai: { enabled: true, model: 'claude-4' },
      });

      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: 'ai.model', value: 'claude-4' });

      expect(res.status).toBe(200);
      expect(setConfigValue).toHaveBeenCalledWith('ai.model', 'claude-4', 'guild1');
      expect(getConfig).toHaveBeenCalledWith('guild1');
      expect(res.body).toEqual({ enabled: true, model: 'claude-4' });
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .send({ guildId: 'guild1', path: 'ai.model', value: 'claude-4' });

      expect(res.status).toBe(401);
    });

    it('should return 403 for OAuth auth (api-secret only)', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();

      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('Authorization', `Bearer ${token}`)
        .send({ guildId: 'guild1', path: 'ai.model', value: 'claude-4' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('API secret');
    });

    it('should return 400 when guildId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ path: 'ai.model', value: 'claude-4' });

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
        .send({ guildId: 'guild1', path: 'ai.model' });

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

    it('should return 403 when path targets moderation config', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/config-update')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1', path: 'moderation.enabled', value: false });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not allowed');
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
        .send({ guildId: 'guild1', path: 'ai.model', value: 'x' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to update config');
    });
  });
});
