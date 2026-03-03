/**
 * Tests for src/api/routes/performance.js
 */

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../src/utils/logQuery.js', () => ({
  queryLogs: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));

vi.mock('../../../src/utils/restartTracker.js', () => {
  throw new Error('Module not found');
});

import { createApp } from '../../../src/api/server.js';
import { PerformanceMonitor } from '../../../src/modules/performanceMonitor.js';

const TEST_SECRET = 'perf-test-secret';

function buildApp() {
  const client = {
    guilds: { cache: new Map([['guild1', {}]]) },
    ws: { status: 0, ping: 10 },
    user: { tag: 'TestBot#0001' },
  };
  return createApp(client, null);
}

describe('GET /api/v1/performance', () => {
  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);
    // Reset singleton so each test gets a fresh instance
    PerformanceMonitor.instance = null;
  });

  afterEach(() => {
    if (PerformanceMonitor.instance) {
      PerformanceMonitor.instance.stop();
    }
    PerformanceMonitor.instance = null;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/performance');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 with wrong secret', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/performance').set('x-api-secret', 'wrong');
    expect(res.status).toBe(401);
  });

  it('returns snapshot with valid auth', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/performance').set('x-api-secret', TEST_SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('current');
    expect(res.body).toHaveProperty('thresholds');
    expect(res.body).toHaveProperty('timeSeries');
    expect(res.body).toHaveProperty('responseTimes');
    expect(res.body).toHaveProperty('summary');
  });

  it('snapshot current includes expected fields', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/performance').set('x-api-secret', TEST_SECRET);
    const { current } = res.body;
    expect(current).toHaveProperty('memoryHeapMb');
    expect(current).toHaveProperty('memoryRssMb');
    expect(current).toHaveProperty('cpuPercent');
    expect(current).toHaveProperty('uptime');
    expect(typeof current.memoryHeapMb).toBe('number');
    expect(typeof current.uptime).toBe('number');
  });

  it('snapshot includes response times recorded via monitor', async () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.recordResponseTime('ping', 42, 'command');

    const app = buildApp();
    const res = await request(app).get('/api/v1/performance').set('x-api-secret', TEST_SECRET);
    expect(res.body.responseTimes).toHaveLength(1);
    expect(res.body.responseTimes[0].name).toBe('ping');
  });
});

describe('GET /api/v1/performance/thresholds', () => {
  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);
    PerformanceMonitor.instance = null;
  });

  afterEach(() => {
    if (PerformanceMonitor.instance) {
      PerformanceMonitor.instance.stop();
    }
    PerformanceMonitor.instance = null;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/performance/thresholds');
    expect(res.status).toBe(401);
  });

  it('returns current thresholds with valid auth', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/performance/thresholds')
      .set('x-api-secret', TEST_SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('memoryHeapMb');
    expect(res.body).toHaveProperty('memoryRssMb');
    expect(res.body).toHaveProperty('cpuPercent');
    expect(res.body).toHaveProperty('responseTimeMs');
  });
});

describe('PUT /api/v1/performance/thresholds', () => {
  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);
    PerformanceMonitor.instance = null;
  });

  afterEach(() => {
    if (PerformanceMonitor.instance) {
      PerformanceMonitor.instance.stop();
    }
    PerformanceMonitor.instance = null;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    const app = buildApp();
    const res = await request(app)
      .put('/api/v1/performance/thresholds')
      .send({ memoryHeapMb: 256 });
    expect(res.status).toBe(401);
  });

  it('updates thresholds and returns new values', async () => {
    const app = buildApp();
    const res = await request(app)
      .put('/api/v1/performance/thresholds')
      .set('x-api-secret', TEST_SECRET)
      .send({ memoryHeapMb: 256, cpuPercent: 90 });
    expect(res.status).toBe(200);
    expect(res.body.memoryHeapMb).toBe(256);
    expect(res.body.cpuPercent).toBe(90);
  });

  it('returns 400 when no valid fields provided', async () => {
    const app = buildApp();
    const res = await request(app)
      .put('/api/v1/performance/thresholds')
      .set('x-api-secret', TEST_SECRET)
      .send({ unknownField: 999 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when value is not a positive number', async () => {
    const app = buildApp();
    const res = await request(app)
      .put('/api/v1/performance/thresholds')
      .set('x-api-secret', TEST_SECRET)
      .send({ memoryHeapMb: -100 });
    expect(res.status).toBe(400);
  });

  it('ignores unknown fields', async () => {
    const app = buildApp();
    const res = await request(app)
      .put('/api/v1/performance/thresholds')
      .set('x-api-secret', TEST_SECRET)
      .send({ memoryHeapMb: 512, hackerField: 'inject' });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('hackerField');
  });
});
