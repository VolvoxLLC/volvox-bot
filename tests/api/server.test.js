import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({}),
  setConfigValue: vi.fn(),
}));

import { createApp, startServer, stopServer } from '../../src/api/server.js';

describe('API server', () => {
  let client;

  beforeEach(() => {
    client = {
      guilds: { cache: new Map() },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };
  });

  afterEach(async () => {
    await stopServer();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('createApp', () => {
    it('should create an Express app with client and dbPool in locals', () => {
      const mockPool = { query: vi.fn() };
      const app = createApp(client, mockPool);

      expect(app.locals.client).toBe(client);
      expect(app.locals.dbPool).toBe(mockPool);
    });

    it('should parse JSON request bodies', async () => {
      vi.stubEnv('BOT_API_SECRET', 'secret');
      client.guilds.cache.set('g1', {
        id: 'g1',
        name: 'Test',
        channels: { cache: new Map() },
      });
      const app = createApp(client, null);

      const res = await request(app)
        .patch('/api/v1/guilds/g1/config')
        .set('x-api-secret', 'secret')
        .send({ path: 'ai.model', value: 'test' });

      // Should parse body (not 400 from missing body)
      expect(res.status).not.toBe(415);
    });

    it('should handle CORS preflight when DASHBOARD_URL is set', async () => {
      vi.stubEnv('DASHBOARD_URL', 'http://localhost:3000');
      const app = createApp(client, null);

      const res = await request(app).options('/api/v1/health');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-headers']).toContain('x-api-secret');
    });

    it('should skip CORS headers for OPTIONS when DASHBOARD_URL is not set', async () => {
      vi.stubEnv('DASHBOARD_URL', '');
      const app = createApp(client, null);

      const res = await request(app).options('/api/v1/nonexistent');

      expect(res.status).toBe(404);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should return 404 for unknown routes', async () => {
      const app = createApp(client, null);

      const res = await request(app).get('/api/v1/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('startServer / stopServer', () => {
    it('should start and stop the server', async () => {
      vi.stubEnv('BOT_API_PORT', '0');
      const server = await startServer(client, null);

      expect(server).toBeDefined();
      expect(server.listening).toBe(true);

      await stopServer();
      expect(server.listening).toBe(false);
    });

    it('should handle stopServer when no server is running', async () => {
      // Should not throw
      await stopServer();
    });
  });
});
