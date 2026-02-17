import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { createApp } from '../../../src/api/server.js';

describe('health route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  function buildApp() {
    const client = {
      guilds: { cache: new Map([['guild1', {}]]) },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };
    return createApp(client, null);
  }

  it('should return basic health status without memory by default', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.uptime).toBeTypeOf('number');
    expect(res.body.memory).toBeUndefined();
    expect(res.body.discord).toBeUndefined();
  });

  it('should include memory when valid x-api-secret is provided', async () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    const app = buildApp();

    const res = await request(app).get('/api/v1/health').set('x-api-secret', 'test-secret');

    expect(res.status).toBe(200);
    expect(res.body.discord).toEqual({ status: 0, ping: 42, guilds: 1 });
    expect(res.body.memory).toBeDefined();
    expect(res.body.memory.heapUsed).toBeTypeOf('number');
  });

  it('should not include memory with invalid secret', async () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    const app = buildApp();

    const res = await request(app).get('/api/v1/health').set('x-api-secret', 'wrong-secret');

    expect(res.status).toBe(200);
    expect(res.body.discord).toBeUndefined();
    expect(res.body.memory).toBeUndefined();
  });

  it('should not require authentication', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
  });
});
