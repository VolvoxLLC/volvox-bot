import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// We mock pg with a constructor that returns a mock pool
const mockClient = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
  query: vi.fn().mockResolvedValue({ rows: [] }),
  end: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
};

vi.mock('pg', () => {
  return {
    default: {
      Pool: vi.fn(function MockPool() {
        return mockPool;
      }),
    },
  };
});

describe('db module', () => {
  let initDb;
  let getPool;
  let closeDb;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Reset mock implementations
    mockClient.query.mockResolvedValue({ rows: [] });
    mockPool.connect.mockResolvedValue(mockClient);
    mockPool.query.mockResolvedValue({ rows: [] });
    mockPool.end.mockResolvedValue(undefined);

    // Set DATABASE_URL for tests
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    const db = await import('../src/db.js');
    initDb = db.initDb;
    getPool = db.getPool;
    closeDb = db.closeDb;
  });

  afterEach(async () => {
    try {
      await closeDb();
    } catch {
      // ignore
    }
    delete process.env.DATABASE_URL;
    vi.restoreAllMocks();
  });

  describe('initDb', () => {
    it('should create pool and initialize schema', async () => {
      const pool = await initDb();
      expect(pool).toBeDefined();

      // Should have created config table
      const queries = mockPool.query.mock.calls.map((c) => c[0]);
      expect(queries.some((q) => q.includes('CREATE TABLE IF NOT EXISTS config'))).toBe(true);

      // Should have created conversations table
      expect(queries.some((q) => q.includes('CREATE TABLE IF NOT EXISTS conversations'))).toBe(
        true,
      );

      // Should have created indexes
      expect(queries.some((q) => q.includes('idx_conversations_channel_created'))).toBe(true);
      expect(queries.some((q) => q.includes('idx_conversations_created_at'))).toBe(true);
    });

    it('should return existing pool on subsequent calls', async () => {
      const pool1 = await initDb();
      const pool2 = await initDb();
      expect(pool1).toBe(pool2);
    });

    it('should reject concurrent initDb calls while initialization is in progress', async () => {
      let resolveConnect;
      const pendingConnect = new Promise((resolve) => {
        resolveConnect = resolve;
      });
      mockPool.connect.mockImplementationOnce(() => pendingConnect);

      const firstInit = initDb();
      const secondInit = initDb();

      await expect(secondInit).rejects.toThrow('initDb is already in progress');

      resolveConnect(mockClient);
      const pool = await firstInit;
      expect(pool).toBeDefined();
      expect(mockPool.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPool', () => {
    it('should throw if pool not initialized', () => {
      expect(() => getPool()).toThrow('Database not initialized');
    });

    it('should return pool after initialization', async () => {
      await initDb();
      const pool = getPool();
      expect(pool).toBeDefined();
    });
  });

  describe('closeDb', () => {
    it('should close pool gracefully', async () => {
      await initDb();
      await closeDb();
      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle close when no pool exists', async () => {
      // Should not throw
      await closeDb();
    });
  });

  describe('conversations table schema', () => {
    it('should include all required columns', async () => {
      await initDb();

      const queries = mockPool.query.mock.calls.map((c) => c[0]);
      const createTableSql = queries.find((q) =>
        q.includes('CREATE TABLE IF NOT EXISTS conversations'),
      );

      expect(createTableSql).toBeDefined();
      expect(createTableSql).toContain('channel_id TEXT NOT NULL');
      expect(createTableSql).toContain('role TEXT NOT NULL');
      expect(createTableSql).toContain('content TEXT NOT NULL');
      expect(createTableSql).toContain('username TEXT');
      expect(createTableSql).toContain('created_at TIMESTAMPTZ');
      expect(createTableSql).toContain('id SERIAL PRIMARY KEY');
    });

    it('should create composite index on channel_id and created_at', async () => {
      await initDb();

      const queries = mockPool.query.mock.calls.map((c) => c[0]);
      const indexSql = queries.find((q) => q.includes('idx_conversations_channel_created'));

      expect(indexSql).toBeDefined();
      expect(indexSql).toContain('channel_id');
      expect(indexSql).toContain('created_at');
    });

    it('should create standalone created_at index for TTL cleanup', async () => {
      await initDb();

      const queries = mockPool.query.mock.calls.map((c) => c[0]);
      const indexSql = queries.find((q) => q.includes('idx_conversations_created_at'));

      expect(indexSql).toBeDefined();
      expect(indexSql).toContain('ON conversations (created_at)');
    });
  });
});
