import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock pg before importing the module
vi.mock('pg', () => {
  return {
    default: {
      Pool: vi.fn(),
    },
    Pool: vi.fn(),
  };
});

describe('database module', () => {
  let db;
  let mockPool;
  let mockClient;

  beforeEach(async () => {
    // Reset modules to ensure clean state
    vi.resetModules();

    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };

    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };

    // Mock Pool constructor
    const pg = await import('pg');
    pg.Pool.mockImplementation(() => mockPool);

    // Import module after mocking
    db = await import('../src/db.js');
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  describe('initDb', () => {
    it('should throw error if DATABASE_URL is not set', async () => {
      const originalUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      await expect(db.initDb()).rejects.toThrow('DATABASE_URL');

      process.env.DATABASE_URL = originalUrl;
    });

    it('should create connection pool', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';

      await db.initDb();

      const pg = await import('pg');
      expect(pg.Pool).toHaveBeenCalled();
    });

    it('should create config table', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';

      await db.initDb();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS config'),
      );
    });

    it('should test connection on init', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';

      await db.initDb();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT NOW()');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return existing pool on subsequent calls', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';

      const pool1 = await db.initDb();
      const pool2 = await db.initDb();

      expect(pool1).toBe(pool2);
      const pg = await import('pg');
      expect(pg.Pool).toHaveBeenCalledTimes(1);
    });

    it('should handle connection errors', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      mockPool.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(db.initDb()).rejects.toThrow('Connection failed');
    });

    it('should clean up pool on initialization error', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      mockClient.query.mockRejectedValue(new Error('Query failed'));

      await expect(db.initDb()).rejects.toThrow('Query failed');
      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should prevent concurrent initialization', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';

      const promise1 = db.initDb();
      const promise2 = db.initDb();

      await expect(promise2).rejects.toThrow('already in progress');
      await promise1;
    });

    it('should register error handler on pool', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';

      await db.initDb();

      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('getPool', () => {
    it('should throw error if pool is not initialized', () => {
      expect(() => db.getPool()).toThrow('not initialized');
    });

    it('should return pool after initialization', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';

      await db.initDb();
      const pool = db.getPool();

      expect(pool).toBeDefined();
    });
  });

  describe('closeDb', () => {
    it('should close the pool', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';

      await db.initDb();
      await db.closeDb();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      mockPool.end.mockRejectedValue(new Error('Close failed'));

      await db.initDb();
      await expect(db.closeDb()).resolves.not.toThrow();
    });

    it('should be safe to call when pool is not initialized', async () => {
      await expect(db.closeDb()).resolves.not.toThrow();
    });

    it('should allow re-initialization after close', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';

      await db.initDb();
      await db.closeDb();

      // Reset the mock to track new calls
      const pg = await import('pg');
      pg.Pool.mockClear();

      await db.initDb();

      expect(pg.Pool).toHaveBeenCalled();
    });
  });

  describe('SSL configuration', () => {
    it('should disable SSL for railway.internal connections', async () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host.railway.internal:5432/db';

      await db.initDb();

      const pg = await import('pg');
      const poolConfig = pg.Pool.mock.calls[0][0];
      expect(poolConfig.ssl).toBe(false);
    });

    it('should disable SSL when DATABASE_SSL is "false"', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DATABASE_SSL = 'false';

      await db.initDb();

      const pg = await import('pg');
      const poolConfig = pg.Pool.mock.calls[0][0];
      expect(poolConfig.ssl).toBe(false);

      delete process.env.DATABASE_SSL;
    });

    it('should disable SSL when DATABASE_SSL is "off"', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DATABASE_SSL = 'off';

      await db.initDb();

      const pg = await import('pg');
      const poolConfig = pg.Pool.mock.calls[0][0];
      expect(poolConfig.ssl).toBe(false);

      delete process.env.DATABASE_SSL;
    });

    it('should use SSL without verification when DATABASE_SSL is "no-verify"', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DATABASE_SSL = 'no-verify';

      await db.initDb();

      const pg = await import('pg');
      const poolConfig = pg.Pool.mock.calls[0][0];
      expect(poolConfig.ssl).toEqual({ rejectUnauthorized: false });

      delete process.env.DATABASE_SSL;
    });

    it('should use SSL with verification by default', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';

      await db.initDb();

      const pg = await import('pg');
      const poolConfig = pg.Pool.mock.calls[0][0];
      expect(poolConfig.ssl).toEqual({ rejectUnauthorized: true });
    });
  });
});