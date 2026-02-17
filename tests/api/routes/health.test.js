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
  });

  function buildApp() {
    const client = {
      guilds: { cache: new Map([['guild1', {}]]) },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };
    return createApp(client, null);
  }

  it('should return health status with discord info', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.uptime).toBeTypeOf('number');
    expect(res.body.memory).toBeDefined();
    expect(res.body.memory.heapUsed).toBeTypeOf('number');
    expect(res.body.discord).toEqual({
      status: 0,
      ping: 42,
      guilds: 1,
    });
  });

  it('should not require authentication', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
  });
});
