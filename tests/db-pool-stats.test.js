/**
 * db.js — pool stats and slow query logging tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pgMocks = vi.hoisted(() => ({
  poolConfig: null,
  poolQuery: vi.fn(),
  poolOn: vi.fn(),
  poolConnect: vi.fn(),
  poolEnd: vi.fn(),
  clientQuery: vi.fn(),
  clientRelease: vi.fn(),
  totalCount: 3,
  idleCount: 2,
  waitingCount: 0,
}));

const migrationMocks = vi.hoisted(() => ({
  runner: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node-pg-migrate', () => ({
  runner: migrationMocks.runner,
}));

vi.mock('pg', () => {
  class Pool {
    constructor(config) {
      pgMocks.poolConfig = config;
    }

    get totalCount() {
      return pgMocks.totalCount;
    }
    get idleCount() {
      return pgMocks.idleCount;
    }
    get waitingCount() {
      return pgMocks.waitingCount;
    }

    query(...args) {
      return pgMocks.poolQuery(...args);
    }

    on(...args) {
      return pgMocks.poolOn(...args);
    }

    connect(...args) {
      return pgMocks.poolConnect(...args);
    }

    end(...args) {
      return pgMocks.poolEnd(...args);
    }
  }

  return { default: { Pool } };
});

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../src/logger.js', () => loggerMocks);

describe('db module — pool stats', () => {
  let dbModule;

  beforeEach(async () => {
    vi.resetModules();

    pgMocks.poolConfig = null;
    pgMocks.totalCount = 3;
    pgMocks.idleCount = 2;
    pgMocks.waitingCount = 0;
    pgMocks.poolQuery.mockReset().mockResolvedValue({ rows: [] });
    pgMocks.poolOn.mockReset();
    pgMocks.poolConnect.mockReset().mockResolvedValue({
      query: pgMocks.clientQuery,
      release: pgMocks.clientRelease,
    });
    pgMocks.poolEnd.mockReset().mockResolvedValue(undefined);
    pgMocks.clientQuery.mockReset().mockResolvedValue({});
    pgMocks.clientRelease.mockReset();
    migrationMocks.runner.mockReset().mockResolvedValue(undefined);
    loggerMocks.warn.mockReset();
    loggerMocks.debug.mockReset();

    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    delete process.env.PG_SLOW_QUERY_MS;

    dbModule = await import('../src/db.js');
  });

  afterEach(async () => {
    try {
      await dbModule.closeDb();
    } catch {
      // ignore
    }
    delete process.env.DATABASE_URL;
    delete process.env.PG_SLOW_QUERY_MS;
    vi.clearAllMocks();
  });

  describe('getPoolStats', () => {
    it('should return null before init', () => {
      expect(dbModule.getPoolStats()).toBeNull();
    });

    it('should return pool stats after init', async () => {
      await dbModule.initDb();

      pgMocks.totalCount = 3;
      pgMocks.idleCount = 2;
      pgMocks.waitingCount = 0;

      const stats = dbModule.getPoolStats();
      expect(stats).toEqual({ total: 3, idle: 2, waiting: 0 });
    });

    it('should reflect updated pool counts', async () => {
      await dbModule.initDb();

      pgMocks.totalCount = 5;
      pgMocks.idleCount = 1;
      pgMocks.waitingCount = 2;

      const stats = dbModule.getPoolStats();
      expect(stats).toEqual({ total: 5, idle: 1, waiting: 2 });
    });
  });

  describe('slow query logging', () => {
    it('should not warn for fast queries', async () => {
      process.env.PG_SLOW_QUERY_MS = '100';
      await dbModule.initDb();

      // poolQuery resolves immediately (< 100ms)
      pgMocks.poolQuery.mockResolvedValue({ rows: [] });

      await dbModule.getPool().query('SELECT 1');

      expect(loggerMocks.warn).not.toHaveBeenCalledWith('Slow query detected', expect.anything());
    });

    it('should warn for slow queries exceeding threshold', async () => {
      process.env.PG_SLOW_QUERY_MS = '1'; // 1ms threshold — everything is slow
      await dbModule.initDb();

      // Simulate a slow query by delaying resolution
      pgMocks.poolQuery.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ rows: [] }), 10)),
      );

      await dbModule.getPool().query('SELECT slow_thing FROM big_table');

      expect(loggerMocks.warn).toHaveBeenCalledWith(
        'Slow query detected',
        expect.objectContaining({
          threshold_ms: 1,
          query: expect.stringContaining('SELECT'),
          source: 'slow_query_log',
        }),
      );
    });

    it('should use PG_SLOW_QUERY_MS env var for threshold', async () => {
      process.env.PG_SLOW_QUERY_MS = '500';
      await dbModule.initDb();

      // The pool config itself doesn't need testing here — just verify
      // that a query completing in < 500ms does NOT trigger a warn
      pgMocks.poolQuery.mockResolvedValue({ rows: [] });
      await dbModule.getPool().query('SELECT 1');

      expect(loggerMocks.warn).not.toHaveBeenCalledWith('Slow query detected', expect.anything());
    });

    it('should re-throw query errors after logging', async () => {
      await dbModule.initDb();

      const queryErr = new Error('syntax error');
      pgMocks.poolQuery.mockRejectedValue(queryErr);

      await expect(dbModule.getPool().query('INVALID SQL')).rejects.toThrow('syntax error');

      expect(loggerMocks.error).toHaveBeenCalledWith(
        'Query failed',
        expect.objectContaining({ error: 'syntax error', source: 'db_query' }),
      );
    });
  });

  describe('env var overrides', () => {
    it('should use PG_IDLE_TIMEOUT_MS for idle timeout', async () => {
      process.env.PG_IDLE_TIMEOUT_MS = '60000';
      await dbModule.initDb();
      expect(pgMocks.poolConfig.idleTimeoutMillis).toBe(60000);
      delete process.env.PG_IDLE_TIMEOUT_MS;
    });

    it('should use PG_CONNECTION_TIMEOUT_MS for connection timeout', async () => {
      process.env.PG_CONNECTION_TIMEOUT_MS = '5000';
      await dbModule.initDb();
      expect(pgMocks.poolConfig.connectionTimeoutMillis).toBe(5000);
      delete process.env.PG_CONNECTION_TIMEOUT_MS;
    });

    it('should default idle timeout to 30000', async () => {
      delete process.env.PG_IDLE_TIMEOUT_MS;
      await dbModule.initDb();
      expect(pgMocks.poolConfig.idleTimeoutMillis).toBe(30000);
    });

    it('should default connection timeout to 10000', async () => {
      delete process.env.PG_CONNECTION_TIMEOUT_MS;
      await dbModule.initDb();
      expect(pgMocks.poolConfig.connectionTimeoutMillis).toBe(10000);
    });
  });

  describe('pool event listeners', () => {
    it('should register connect, acquire, remove, and error event listeners', async () => {
      await dbModule.initDb();

      const registeredEvents = pgMocks.poolOn.mock.calls.map((c) => c[0]);
      expect(registeredEvents).toContain('error');
      expect(registeredEvents).toContain('connect');
      expect(registeredEvents).toContain('acquire');
      expect(registeredEvents).toContain('remove');
    });
  });
});
