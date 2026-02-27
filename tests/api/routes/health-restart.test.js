/**
 * Additional tests for src/api/routes/health.js — covers the restart tracker branch.
 * This file uses a DIFFERENT mock setup than health.test.js:
 * - restartTracker.js mocked to SUCCEED (returns getRestarts function)
 * - db.js mocked to return a pool with getPool
 * This allows testing the `getRestarts && getRestartPool` → true path.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock restartTracker to SUCCEED (unlike health.test.js which makes it throw)
vi.mock('../../../src/utils/restartTracker.js', () => ({
  getRestarts: vi.fn(),
}));

vi.mock('../../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/utils/logQuery.js', () => ({
  queryLogs: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../src/api/middleware/oauthJwt.js', () => ({
  handleOAuthJwt: vi.fn().mockResolvedValue(false),
  stopJwtCleanup: vi.fn(),
}));

import { createApp } from '../../../src/api/server.js';
import { getPool } from '../../../src/db.js';
import { getRestarts } from '../../../src/utils/restartTracker.js';

const TEST_SECRET = 'health-restart-test-secret';

function buildApp() {
  const client = {
    guilds: { cache: new Map() },
    ws: { status: 0, ping: 42 },
    user: { tag: 'Bot#1234' },
  };
  return createApp(client, null);
}

const mockPool = { query: vi.fn() };

describe('health route - restart tracker branches', () => {
  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);
    getPool.mockReturnValue(mockPool);
    getRestarts.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should include restart data when tracker returns rows with Date timestamps', async () => {
    const now = new Date();
    getRestarts.mockResolvedValueOnce([
      { timestamp: now, reason: 'crash', uptime: 12345 },
      { timestamp: now, reason: 'manual', uptime: 67890 },
    ]);

    const app = buildApp();
    const res = await request(app).get('/api/v1/health').set('x-api-secret', TEST_SECRET);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.restarts)).toBe(true);
    expect(res.body.restarts).toHaveLength(2);
    expect(res.body.restarts[0].timestamp).toBe(now.toISOString());
    expect(res.body.restarts[0].reason).toBe('crash');
  });

  it('should include restart data when tracker returns rows with string timestamps', async () => {
    getRestarts.mockResolvedValueOnce([
      { timestamp: '2024-01-15T10:00:00.000Z', reason: 'deploy', uptime: 5000 },
    ]);

    const app = buildApp();
    const res = await request(app).get('/api/v1/health').set('x-api-secret', TEST_SECRET);

    expect(res.status).toBe(200);
    expect(res.body.restarts).toHaveLength(1);
    expect(res.body.restarts[0].timestamp).toBe('2024-01-15T10:00:00.000Z');
  });

  it('should return empty restarts when getRestartPool returns null', async () => {
    getPool.mockReturnValueOnce(null); // pool is null

    const app = buildApp();
    const res = await request(app).get('/api/v1/health').set('x-api-secret', TEST_SECRET);

    expect(res.status).toBe(200);
    expect(res.body.restarts).toEqual([]);
  });

  it('should return empty restarts when getRestarts throws', async () => {
    getRestarts.mockRejectedValueOnce(new Error('DB error'));

    const app = buildApp();
    const res = await request(app).get('/api/v1/health').set('x-api-secret', TEST_SECRET);

    expect(res.status).toBe(200);
    expect(res.body.restarts).toEqual([]);
  });
});
