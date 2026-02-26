import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/utils/logQuery.js', () => ({
  queryLogs: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));

// restartTracker doesn't exist yet — mock the attempted import to fail gracefully
vi.mock('../../../src/utils/restartTracker.js', () => {
  throw new Error('Module not found');
});

import { createApp } from '../../../src/api/server.js';
import { queryLogs } from '../../../src/utils/logQuery.js';

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
    expect(res.body.system).toBeUndefined();
    expect(res.body.errors).toBeUndefined();
    expect(res.body.restarts).toBeUndefined();
  });

  it('should include memory when valid x-api-secret is provided', async () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    const app = buildApp();

    const res = await request(app).get('/api/v1/health').set('x-api-secret', 'test-secret');

    expect(res.status).toBe(200);
    expect(res.body.discord).toEqual({ status: 0, ping: 42, guilds: 1 });
    expect(res.body).toHaveProperty('memory');
    expect(res.body.memory.heapUsed).toBeTypeOf('number');
  });

  it('should not include memory with invalid secret', async () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    const app = buildApp();

    const res = await request(app).get('/api/v1/health').set('x-api-secret', 'wrong-secret');

    expect(res.status).toBe(200);
    expect(res.body.discord).toBeUndefined();
    expect(res.body.memory).toBeUndefined();
    expect(res.body.system).toBeUndefined();
    expect(res.body.errors).toBeUndefined();
    expect(res.body.restarts).toBeUndefined();
  });

  it('should not require authentication', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
  });

  it('should include system info for authenticated requests', async () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    const app = buildApp();

    const res = await request(app).get('/api/v1/health').set('x-api-secret', 'test-secret');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('system');
    expect(res.body.system.platform).toBe(process.platform);
    expect(res.body.system.nodeVersion).toBe(process.version);
    expect(res.body.system).toHaveProperty('cpuUsage');
    expect(res.body.system.cpuUsage.user).toBeTypeOf('number');
    expect(res.body.system.cpuUsage.system).toBeTypeOf('number');
  });

  it('should include error counts for authenticated requests', async () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    queryLogs
      .mockResolvedValueOnce({ rows: [], total: 3 }) // lastHour
      .mockResolvedValueOnce({ rows: [], total: 15 }); // lastDay

    const app = buildApp();

    const res = await request(app).get('/api/v1/health').set('x-api-secret', 'test-secret');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors.lastHour).toBe(3);
    expect(res.body.errors.lastDay).toBe(15);
    expect(queryLogs).toHaveBeenCalledTimes(2);
    expect(queryLogs).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', limit: 1 }));
  });

  it('should handle queryLogs failure gracefully', async () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    queryLogs.mockRejectedValueOnce(new Error('db connection failed'));

    const app = buildApp();

    const res = await request(app).get('/api/v1/health').set('x-api-secret', 'test-secret');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors.lastHour).toBeNull();
    expect(res.body.errors.lastDay).toBeNull();
    expect(res.body.errors.error).toBe('query failed');
  });

  it('should include restart data fallback when restartTracker unavailable', async () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    const app = buildApp();

    const res = await request(app).get('/api/v1/health').set('x-api-secret', 'test-secret');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.restarts)).toBe(true);
    expect(res.body.restarts).toHaveLength(0);
  });
});
