import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/api/utils/validateWebhookUrl.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, validateDnsResolution: vi.fn().mockResolvedValue(true) };
});

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    ai: { enabled: true, model: 'claude-3', historyLength: 20 },
    welcome: { enabled: true, channelId: 'ch1' },
    spam: { enabled: true },
    moderation: { enabled: true },
    triage: {
      enabled: true,
      classifyApiKey: 'sk-secret-classify',
      respondApiKey: 'sk-secret-respond',
    },
    permissions: { botOwners: [] },
    database: { host: 'secret-host' },
    token: 'secret-token',
  }),
  setConfigValue: vi.fn().mockResolvedValue({}),
}));

import { _resetSecretCache } from '../../../src/api/middleware/verifyJwt.js';
import {
  flattenToLeafPaths,
  validateConfigSchema,
  validateSingleValue,
} from '../../../src/api/routes/config.js';
import { createApp } from '../../../src/api/server.js';
import { guildCache } from '../../../src/api/utils/discordApi.js';
import { sessionStore } from '../../../src/api/utils/sessionStore.js';
import { getConfig, setConfigValue } from '../../../src/modules/config.js';

describe('config routes', () => {
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

  describe('authentication', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/config');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 with wrong secret', async () => {
      const res = await request(app).get('/api/v1/config').set('x-api-secret', 'wrong');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid API secret');
    });

    it('should allow api-secret auth', async () => {
      const res = await request(app).get('/api/v1/config').set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
    });

    it('should deny non-bot-owner OAuth users', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOAuthToken();

      const res = await request(app).get('/api/v1/config').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('bot owner');
    });

    it('should allow bot-owner OAuth users', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      getConfig.mockReturnValueOnce({
        ai: { enabled: true },
        welcome: { enabled: true },
        spam: { enabled: true },
        moderation: { enabled: true },
        permissions: { botOwners: ['owner-1'] },
      });
      const token = createOAuthToken('jwt-test-secret', 'owner-1');

      const res = await request(app).get('/api/v1/config').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('should allow bot owners via BOT_OWNER_IDS env var', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      vi.stubEnv('BOT_OWNER_IDS', 'env-owner-1,env-owner-2');
      const token = createOAuthToken('jwt-test-secret', 'env-owner-1');

      const res = await request(app).get('/api/v1/config').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /', () => {
    it('should return readable config keys only', async () => {
      const res = await request(app).get('/api/v1/config').set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.ai).toEqual({ enabled: true, model: 'claude-3', historyLength: 20 });
      expect(res.body.welcome).toEqual({ enabled: true, channelId: 'ch1' });
      expect(res.body.spam).toEqual({ enabled: true });
      expect(res.body.moderation).toEqual({ enabled: true });
      expect(res.body.triage.enabled).toBe(true);
      expect(res.body.permissions).toEqual({ botOwners: [] });
    });

    it('should exclude sensitive config keys', async () => {
      const res = await request(app).get('/api/v1/config').set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.database).toBeUndefined();
      expect(res.body.token).toBeUndefined();
    });

    it('should mask triage API keys in GET responses', async () => {
      const res = await request(app).get('/api/v1/config').set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.triage.classifyApiKey).toBe('••••••••');
      expect(res.body.triage.respondApiKey).toBe('••••••••');
    });

    it('should call getConfig without guild ID for global config', async () => {
      await request(app).get('/api/v1/config').set('x-api-secret', SECRET);

      expect(getConfig).toHaveBeenCalledWith();
    });
  });

  describe('PUT /', () => {
    it('should update config and return updated result', async () => {
      getConfig
        .mockReturnValueOnce({
          ai: { enabled: true },
          welcome: { enabled: true },
          spam: { enabled: true },
          moderation: { enabled: true },
          permissions: { botOwners: [] },
        })
        .mockReturnValueOnce({
          ai: { enabled: false, model: 'claude-3', historyLength: 20 },
          welcome: { enabled: true },
          spam: { enabled: true },
          moderation: { enabled: true },
          permissions: { botOwners: [] },
        });

      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { enabled: false } });

      expect(res.status).toBe(200);
      expect(setConfigValue).toHaveBeenCalledWith('ai.enabled', false);
      expect(res.body.ai).toBeDefined();
    });

    it('should update multiple sections at once', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({
          ai: { enabled: false },
          welcome: { enabled: true, message: 'Hello!' },
        });

      expect(res.status).toBe(200);
      expect(setConfigValue).toHaveBeenCalledWith('ai.enabled', false);
      expect(setConfigValue).toHaveBeenCalledWith('welcome.enabled', true);
      expect(setConfigValue).toHaveBeenCalledWith('welcome.message', 'Hello!');
    });

    it('should flatten nested objects to dot-notation paths', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({
          ai: { threadMode: { enabled: true, autoArchiveMinutes: 120 } },
        });

      expect(res.status).toBe(200);
      expect(setConfigValue).toHaveBeenCalledWith('ai.threadMode.enabled', true);
      expect(setConfigValue).toHaveBeenCalledWith('ai.threadMode.autoArchiveMinutes', 120);
    });

    it('should pass arrays as leaf values without flattening', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({
          ai: { channels: ['ch1', 'ch2'] },
        });

      expect(res.status).toBe(200);
      expect(setConfigValue).toHaveBeenCalledWith('ai.channels', ['ch1', 'ch2']);
    });

    it('should return 400 for empty body', async () => {
      const res = await request(app).put('/api/v1/config').set('x-api-secret', SECRET).send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('empty');
    });

    it('should return 400 for non-object body', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .set('Content-Type', 'text/plain')
        .send('not json');

      expect(res.status).toBe(400);
    });

    it('should return 400 for array body', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send([{ ai: { enabled: true } }]);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('JSON object');
    });

    it('should return 400 for non-writable config sections', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ database: { host: 'evil-host' } });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('validation failed');
      expect(res.body.details[0]).toContain('database');
      expect(res.body.details[0]).toContain('not a writable');
    });

    it('should silently skip masked sentinel values for sensitive fields', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({
          triage: {
            enabled: true,
            classifyApiKey: '••••••••',
            respondApiKey: '••••••••',
          },
        });

      expect(res.status).toBe(200);
      // The mask sentinel values should NOT be written
      expect(setConfigValue).not.toHaveBeenCalledWith('triage.classifyApiKey', '••••••••');
      expect(setConfigValue).not.toHaveBeenCalledWith('triage.respondApiKey', '••••••••');
      // But non-sensitive fields should still be written
      expect(setConfigValue).toHaveBeenCalledWith('triage.enabled', true);
    });

    it('should return 400 when all writes are masked sentinel values', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({
          triage: {
            classifyApiKey: '••••••••',
            respondApiKey: '••••••••',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No valid config values');
    });

    it('should allow patching moderation config via PUT', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ moderation: { enabled: false } });

      expect(res.status).toBe(200);
      expect(setConfigValue).toHaveBeenCalledWith('moderation.enabled', false);
    });

    it('should return 400 for type mismatch — boolean expected', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { enabled: 'yes' } });

      expect(res.status).toBe(400);
      expect(res.body.details[0]).toContain('expected boolean');
    });

    it('should return 400 for type mismatch — number expected', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { historyLength: 'twenty' } });

      expect(res.status).toBe(400);
      expect(res.body.details[0]).toContain('expected finite number');
    });

    it('should return 400 for type mismatch — string expected', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { systemPrompt: 123 } });

      expect(res.status).toBe(400);
      expect(res.body.details[0]).toContain('expected string');
    });

    it('should return 400 for type mismatch — array expected', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { channels: 'not-an-array' } });

      expect(res.status).toBe(400);
      expect(res.body.details[0]).toContain('expected array');
    });

    it('should return 400 for type mismatch — object expected', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { threadMode: 'not-an-object' } });

      expect(res.status).toBe(400);
      expect(res.body.details[0]).toContain('expected object');
    });

    it('should return 400 for non-null where null is not allowed', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { enabled: null } });

      expect(res.status).toBe(400);
      expect(res.body.details[0]).toContain('must not be null');
    });

    it('should allow null for nullable fields', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ welcome: { channelId: null } });

      expect(res.status).toBe(200);
      expect(setConfigValue).toHaveBeenCalledWith('welcome.channelId', null);
    });

    it('should reject unknown keys within a section (strict schema)', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { customSetting: 'test' } });

      expect(res.status).toBe(400);
      expect(res.body.details).toContain('ai.customSetting: unknown config key');
    });

    it('should reject null on non-nullable number field (Infinity serializes to null)', async () => {
      // JSON.stringify(Infinity) becomes null, so this tests the edge case
      // when sent as a raw number via test helper
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { historyLength: null } });

      expect(res.status).toBe(400);
    });

    it('should return 500 when setConfigValue throws', async () => {
      setConfigValue.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { enabled: true } });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to update config');
    });

    it('should collect multiple validation errors at once', async () => {
      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({
          database: { host: 'evil' },
          ai: { enabled: 'yes', historyLength: 'nope' },
        });

      expect(res.status).toBe(400);
      expect(res.body.details.length).toBeGreaterThanOrEqual(3);
    });

    describe('webhook notifications', () => {
      it('should fire webhook when CONFIG_CHANGE_WEBHOOK_URL is set', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
        vi.stubEnv('CONFIG_CHANGE_WEBHOOK_URL', 'https://example.com/hook');

        const res = await request(app)
          .put('/api/v1/config')
          .set('x-api-secret', SECRET)
          .send({ ai: { enabled: true } });

        expect(res.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledOnce();
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://example.com/hook');
        expect(opts.method).toBe('POST');
        const body = JSON.parse(opts.body);
        expect(body.event).toBe('config.updated');
        expect(body.sections).toEqual(['ai']);
        expect(body.timestamp).toBeTypeOf('number');
      });

      it('should not fire webhook when CONFIG_CHANGE_WEBHOOK_URL is unset', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });

        const res = await request(app)
          .put('/api/v1/config')
          .set('x-api-secret', SECRET)
          .send({ ai: { enabled: true } });

        expect(res.status).toBe(200);
        expect(fetchSpy).not.toHaveBeenCalled();
      });

      it('should not block response when webhook fails', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
        vi.stubEnv('CONFIG_CHANGE_WEBHOOK_URL', 'https://example.com/hook');

        const res = await request(app)
          .put('/api/v1/config')
          .set('x-api-secret', SECRET)
          .send({ ai: { enabled: true } });

        expect(res.status).toBe(200);
      });
    });
  });

  describe('PUT / partial write handling', () => {
    it('should return 207 when some writes fail', async () => {
      setConfigValue
        .mockResolvedValueOnce({}) // ai.enabled succeeds
        .mockRejectedValueOnce(new Error('DB write error')); // ai.historyLength fails

      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { enabled: true, historyLength: 30 } });

      expect(res.status).toBe(207);
      expect(res.body.error).toContain('Partial');
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0].status).toBe('success');
      expect(res.body.results[1].status).toBe('failed');
      expect(res.body.config).toBeDefined();
    });

    it('should return 500 with results when all writes fail', async () => {
      setConfigValue.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { enabled: true, historyLength: 30 } });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('all writes failed');
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results.every((r) => r.status === 'failed')).toBe(true);
    });

    it('should include per-field error messages in results', async () => {
      setConfigValue
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('specific error message'));

      const res = await request(app)
        .put('/api/v1/config')
        .set('x-api-secret', SECRET)
        .send({ ai: { enabled: true, historyLength: 30 } });

      expect(res.status).toBe(207);
      const failedResult = res.body.results.find((r) => r.status === 'failed');
      expect(failedResult.error).toBe('specific error message');
      expect(failedResult.path).toBe('ai.historyLength');
    });
  });
});

describe('validateConfigSchema', () => {
  it('should return empty array for valid config', () => {
    const errors = validateConfigSchema({
      ai: { enabled: true, historyLength: 20 },
      welcome: { enabled: false },
    });

    expect(errors).toEqual([]);
  });

  it('should reject non-object config', () => {
    expect(validateConfigSchema('string')).toEqual(['Config must be a JSON object']);
    expect(validateConfigSchema(null)).toEqual(['Config must be a JSON object']);
    expect(validateConfigSchema([])).toEqual(['Config must be a JSON object']);
  });

  it('should reject unknown top-level sections', () => {
    const errors = validateConfigSchema({ database: { host: 'localhost' } });

    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('database');
    expect(errors[0]).toContain('not a writable');
  });
});

describe('flattenToLeafPaths', () => {
  it('should flatten simple object', () => {
    const result = flattenToLeafPaths({ enabled: true, model: 'claude-3' }, 'ai');

    expect(result).toEqual([
      ['ai.enabled', true],
      ['ai.model', 'claude-3'],
    ]);
  });

  it('should flatten nested objects', () => {
    const result = flattenToLeafPaths({ threadMode: { enabled: true, timeout: 60 } }, 'ai');

    expect(result).toEqual([
      ['ai.threadMode.enabled', true],
      ['ai.threadMode.timeout', 60],
    ]);
  });

  it('should treat arrays as leaf values', () => {
    const result = flattenToLeafPaths({ channels: ['ch1', 'ch2'] }, 'ai');

    expect(result).toEqual([['ai.channels', ['ch1', 'ch2']]]);
  });

  it('should treat null as leaf value', () => {
    const result = flattenToLeafPaths({ channelId: null }, 'welcome');

    expect(result).toEqual([['welcome.channelId', null]]);
  });

  it('should skip __proto__, constructor, and prototype keys', () => {
    const malicious = JSON.parse('{"__proto__":{"polluted":true},"safe":"value"}');
    const result = flattenToLeafPaths(malicious, 'ai');

    expect(result).toEqual([['ai.safe', 'value']]);
  });
});

describe('validateSingleValue', () => {
  it('should return empty array for valid boolean', () => {
    expect(validateSingleValue('ai.enabled', true)).toEqual([]);
  });

  it('should return error for boolean type mismatch', () => {
    const errors = validateSingleValue('ai.enabled', 'yes');
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('expected boolean');
  });

  it('should return error for number type mismatch', () => {
    const errors = validateSingleValue('ai.historyLength', 'twenty');
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('expected finite number');
  });

  it('should return error for unknown property within a known section', () => {
    const errors = validateSingleValue('ai.customSetting', 'anything');
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('Unknown config path');
  });

  it('should return empty array for unknown section', () => {
    expect(validateSingleValue('unknown.key', 'value')).toEqual([]);
  });

  it('should validate nested paths', () => {
    const errors = validateSingleValue('ai.threadMode.enabled', 'not-a-bool');
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('expected boolean');
  });

  it('should validate nullable fields', () => {
    expect(validateSingleValue('welcome.channelId', null)).toEqual([]);
    const errors = validateSingleValue('ai.enabled', null);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('must not be null');
  });
});


