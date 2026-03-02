import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn(),
  setConfigValue: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../src/modules/webhookNotifier.js', () => ({
  WEBHOOK_EVENTS: [
    'bot.disconnected',
    'bot.reconnected',
    'bot.error',
    'moderation.action',
    'health.degraded',
    'config.changed',
    'member.flagged',
  ],
  getDeliveryLog: vi.fn().mockResolvedValue([]),
  testEndpoint: vi.fn().mockResolvedValue({ ok: true, status: 200, text: 'OK' }),
}));

import { _resetSecretCache } from '../../../src/api/middleware/verifyJwt.js';
import { createApp } from '../../../src/api/server.js';
import { guildCache } from '../../../src/api/utils/discordApi.js';
import { sessionStore } from '../../../src/api/utils/sessionStore.js';
import { getConfig, setConfigValue } from '../../../src/modules/config.js';
import { getDeliveryLog, testEndpoint } from '../../../src/modules/webhookNotifier.js';

describe('notifications routes', () => {
  let app;
  const SECRET = 'test-secret';
  const GUILD_ID = 'guild123';

  const baseWebhook = {
    id: 'uuid-1',
    url: 'https://example.com/hook',
    events: ['bot.error'],
    enabled: true,
  };

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', SECRET);

    const client = {
      guilds: { cache: new Map() },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };

    app = createApp(client, null);

    getConfig.mockReturnValue({
      notifications: { webhooks: [baseWebhook] },
    });
  });

  afterEach(() => {
    sessionStore.clear();
    guildCache.clear();
    _resetSecretCache();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function authHeaders() {
    return { 'x-api-secret': SECRET };
  }

  // ── GET /guilds/:guildId/notifications/webhooks ───────────────────────────

  describe('GET /guilds/:guildId/notifications/webhooks', () => {
    it('should list webhooks with secrets masked', async () => {
      getConfig.mockReturnValue({
        notifications: {
          webhooks: [{ ...baseWebhook, secret: 'mysecret' }],
        },
      });

      const res = await request(app)
        .get(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].secret).toBeUndefined();
      expect(res.body[0].hasSecret).toBe(true);
      expect(res.body[0].url).toBe('https://example.com/hook');
    });

    it('should return empty array when no webhooks configured', async () => {
      getConfig.mockReturnValue({ notifications: { webhooks: [] } });

      const res = await request(app)
        .get(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return empty array when notifications not in config', async () => {
      getConfig.mockReturnValue({});

      const res = await request(app)
        .get(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .get(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`);

      expect(res.status).toBe(401);
    });

    it('should indicate hasSecret=false when no secret', async () => {
      getConfig.mockReturnValue({
        notifications: { webhooks: [baseWebhook] },
      });

      const res = await request(app)
        .get(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders());

      expect(res.body[0].hasSecret).toBe(false);
    });
  });

  // ── POST /guilds/:guildId/notifications/webhooks ──────────────────────────

  describe('POST /guilds/:guildId/notifications/webhooks', () => {
    beforeEach(() => {
      // Start fresh with no webhooks
      getConfig.mockReturnValue({ notifications: { webhooks: [] } });
    });

    it('should add a webhook endpoint', async () => {
      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders())
        .send({ url: 'https://example.com/hook', events: ['bot.error'] });

      expect(res.status).toBe(201);
      expect(res.body.url).toBe('https://example.com/hook');
      expect(res.body.events).toEqual(['bot.error']);
      expect(res.body.id).toBeTruthy();
      expect(res.body.secret).toBeUndefined();
      expect(setConfigValue).toHaveBeenCalledWith(
        'notifications.webhooks',
        expect.arrayContaining([expect.objectContaining({ url: 'https://example.com/hook' })]),
        GUILD_ID,
      );
    });

    it('should return 400 when url is missing', async () => {
      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders())
        .send({ events: ['bot.error'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('url');
    });

    it('should return 400 for invalid URL format', async () => {
      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders())
        .send({ url: 'not-a-url', events: ['bot.error'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('URL');
    });

    it('should return 400 when events is missing', async () => {
      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders())
        .send({ url: 'https://example.com/hook' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('events');
    });

    it('should return 400 when events is empty array', async () => {
      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders())
        .send({ url: 'https://example.com/hook', events: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('events');
    });

    it('should return 400 for invalid event types', async () => {
      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders())
        .send({ url: 'https://example.com/hook', events: ['not.a.real.event'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid event types');
      expect(res.body.validEvents).toBeTruthy();
    });

    it('should return 400 when exceeding 20 endpoints', async () => {
      const existing = Array.from({ length: 20 }, (_, i) => ({ id: `ep${i}`, url: 'https://x.com', events: ['bot.error'] }));
      getConfig.mockReturnValue({ notifications: { webhooks: existing } });

      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders())
        .send({ url: 'https://example.com/hook', events: ['bot.error'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Maximum');
    });

    it('should accept optional secret', async () => {
      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .set(authHeaders())
        .send({ url: 'https://example.com/hook', events: ['bot.error'], secret: 'topsecret' });

      expect(res.status).toBe(201);
      expect(res.body.secret).toBeUndefined();
      expect(res.body.hasSecret).toBe(true);

      // Secret should be saved in the config
      const saved = setConfigValue.mock.calls[0][1][0];
      expect(saved.secret).toBe('topsecret');
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks`)
        .send({ url: 'https://example.com/hook', events: ['bot.error'] });

      expect(res.status).toBe(401);
    });
  });

  // ── DELETE /guilds/:guildId/notifications/webhooks/:endpointId ────────────

  describe('DELETE /guilds/:guildId/notifications/webhooks/:endpointId', () => {
    it('should remove an existing endpoint', async () => {
      const res = await request(app)
        .delete(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks/uuid-1`)
        .set(authHeaders());

      expect(res.status).toBe(204);
      expect(setConfigValue).toHaveBeenCalledWith(
        'notifications.webhooks',
        [],
        GUILD_ID,
      );
    });

    it('should return 404 when endpoint not found', async () => {
      const res = await request(app)
        .delete(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks/nonexistent-id`)
        .set(authHeaders());

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .delete(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks/uuid-1`);

      expect(res.status).toBe(401);
    });
  });

  // ── POST /guilds/:guildId/notifications/webhooks/:endpointId/test ─────────

  describe('POST /guilds/:guildId/notifications/webhooks/:endpointId/test', () => {
    it('should send a test event and return result', async () => {
      testEndpoint.mockResolvedValueOnce({ ok: true, status: 200, text: 'received' });

      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks/uuid-1/test`)
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.status).toBe(200);
      expect(testEndpoint).toHaveBeenCalledWith(GUILD_ID, baseWebhook);
    });

    it('should return 404 when endpoint not found', async () => {
      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks/bad-id/test`)
        .set(authHeaders());

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`/api/v1/guilds/${GUILD_ID}/notifications/webhooks/uuid-1/test`);

      expect(res.status).toBe(401);
    });
  });

  // ── GET /guilds/:guildId/notifications/deliveries ─────────────────────────

  describe('GET /guilds/:guildId/notifications/deliveries', () => {
    it('should return delivery log', async () => {
      const rows = [
        { id: 1, endpoint_id: 'ep1', event_type: 'bot.error', status: 'success', attempt: 1, delivered_at: '2026-01-01' },
      ];
      getDeliveryLog.mockResolvedValueOnce(rows);

      const res = await request(app)
        .get(`/api/v1/guilds/${GUILD_ID}/notifications/deliveries`)
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body).toEqual(rows);
      expect(getDeliveryLog).toHaveBeenCalledWith(GUILD_ID, 50);
    });

    it('should accept limit query param (capped at 100)', async () => {
      getDeliveryLog.mockResolvedValueOnce([]);

      await request(app)
        .get(`/api/v1/guilds/${GUILD_ID}/notifications/deliveries?limit=200`)
        .set(authHeaders());

      expect(getDeliveryLog).toHaveBeenCalledWith(GUILD_ID, 100);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .get(`/api/v1/guilds/${GUILD_ID}/notifications/deliveries`);

      expect(res.status).toBe(401);
    });
  });
});
