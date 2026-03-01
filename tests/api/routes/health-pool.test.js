/**
 * Health route — DB pool stats tests
 */
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getPool: vi.fn(() => null),
  getPoolStats: vi.fn(),
}));

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../src/utils/logQuery.js', () => ({
  queryLogs: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));

// restartTracker not available
vi.mock('../../../src/utils/restartTracker.js', () => {
  throw new Error('Module not found');
});

vi.mock('../../../src/db.js', () => ({
  getPool: dbMocks.getPool,
  getPoolStats: dbMocks.getPoolStats,
}));

import { createApp } from '../../../src/api/server.js';

describe('health route — pool stats', () => {
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

  it('should not include pool stats without authentication', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.pool).toBeUndefined();
  });

  it('should include pool stats when authenticated and pool is initialized', async () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    dbMocks.getPoolStats.mockReturnValue({ total: 3, idle: 2, waiting: 0 });

    const app = buildApp();
    const res = await request(app).get('/api/v1/health').set('x-api-secret', 'test-secret');

    expect(res.status).toBe(200);
    expect(res.body.pool).toEqual({ total: 3, idle: 2, waiting: 0 });
  });

  it('should include pool: null when pool is not initialized', async () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    dbMocks.getPoolStats.mockReturnValue(null);

    const app = buildApp();
    const res = await request(app).get('/api/v1/health').set('x-api-secret', 'test-secret');

    expect(res.status).toBe(200);
    expect(res.body.pool).toBeNull();
  });

  it('should handle getPoolStats throwing gracefully', async () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    dbMocks.getPoolStats.mockImplementation(() => {
      throw new Error('pool error');
    });

    const app = buildApp();
    const res = await request(app).get('/api/v1/health').set('x-api-secret', 'test-secret');

    expect(res.status).toBe(200);
    expect(res.body.pool).toBeNull();
  });
});
