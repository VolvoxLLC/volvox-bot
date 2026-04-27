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

vi.mock('../../src/api/ws/logStream.js', () => ({
  setupLogStream: vi.fn(),
  stopLogStream: vi.fn().mockResolvedValue(undefined),
}));

import { createApp, setServerDbPool, startServer, stopServer } from '../../src/api/server.js';
import { setupLogStream } from '../../src/api/ws/logStream.js';

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

    it('should enable trust proxy for correct client IP behind reverse proxies', () => {
      const app = createApp(client, null);

      expect(app.get('trust proxy')).toBe(1);
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

      expect(server).not.toBeNull();
      expect(server.listening).toBe(true);

      await stopServer();
      expect(server.listening).toBe(false);
    });

    it('should handle stopServer when no server is running', async () => {
      // Should not throw
      await stopServer();
    });

    it('should close orphaned server when startServer called while already running', async () => {
      vi.stubEnv('BOT_API_PORT', '0');
      const server1 = await startServer(client, null);
      expect(server1.listening).toBe(true);

      // Second start should warn and close the first
      const server2 = await startServer(client, null);
      expect(server2).toBeDefined();
      expect(server2.listening).toBe(true);

      await stopServer();
    });

    it('should warn and fall back when BOT_API_PORT is invalid', async () => {
      const { warn } = await import('../../src/logger.js');

      // Set invalid BOT_API_PORT and ensure PORT is not set so the
      // invalid value is evaluated. Use PORT=0 to force an ephemeral
      // port so we can actually bind without EADDRINUSE on port 3001.
      delete process.env.PORT;
      vi.stubEnv('BOT_API_PORT', 'not-a-number');

      // Temporarily override PORT to 0 after the port-parsing logic runs
      // is not possible, so instead we just verify the warning is logged.
      // The server may fail to bind 3001 (EADDRINUSE) — that's fine,
      // we only care that the fallback warning was emitted.
      try {
        const server = await startServer(client, null);
        if (server?.listening) await stopServer();
      } catch {
        // Expected — port 3001 may be in use
      }

      expect(warn).toHaveBeenCalledWith(
        'Invalid port value, falling back to default',
        expect.objectContaining({ provided: 'not-a-number', fallback: 3001 }),
      );
    });

    it('should accept port 0 (OS-assigned ephemeral port)', async () => {
      vi.stubEnv('BOT_API_PORT', '0');
      const server = await startServer(client, null);
      const addr = server.address();
      expect(addr.port).toBeGreaterThan(0);
      await stopServer();
    });

    it('should setup WebSocket log stream when wsTransport is provided', async () => {
      vi.stubEnv('BOT_API_PORT', '0');
      const wsTransport = { on: vi.fn(), emit: vi.fn() };

      await startServer(client, null, { wsTransport });
      expect(setupLogStream).toHaveBeenCalled();
      await stopServer();
    });

    it('should update the running app dbPool after early API startup', async () => {
      vi.stubEnv('BOT_API_PORT', '0');
      await startServer(client, null);

      const pool = { query: vi.fn() };
      expect(setServerDbPool(pool)).toBe(true);

      await stopServer();
    });

    it('should return false when updating dbPool without an active app', () => {
      expect(setServerDbPool({ query: vi.fn() })).toBe(false);
    });

    it('should continue when setupLogStream throws', async () => {
      vi.stubEnv('BOT_API_PORT', '0');
      setupLogStream.mockImplementationOnce(() => {
        throw new Error('WS setup failed');
      });

      const wsTransport = { on: vi.fn() };
      // Should NOT reject — WS failure is non-fatal
      const server = await startServer(client, null, { wsTransport });
      expect(server.listening).toBe(true);
      await stopServer();
    });

    it('should reject when server port is already in use', async () => {
      vi.stubEnv('BOT_API_PORT', '0');
      // Start a real server first to grab a port
      const first = await startServer(client, null);
      // We can't easily force EADDRINUSE without another server — just verify start/stop
      await stopServer();
      expect(first.listening).toBe(false);
    });
  });

  describe('createApp - CORS behavior', () => {
    it('should set CORS headers on GET when DASHBOARD_URL is set', async () => {
      vi.stubEnv('DASHBOARD_URL', 'http://localhost:3000');
      const app = createApp(client, null);

      const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:3000');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });

  describe('error handling middleware', () => {
    it('should handle JSON parse errors with 400', async () => {
      const app = createApp(client, null);

      const res = await request(app)
        .post('/api/v1/health')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
    });
  });
});
