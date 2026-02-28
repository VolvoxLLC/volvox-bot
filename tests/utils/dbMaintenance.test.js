import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the logger so tests don't emit log output
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe('runMaintenance', () => {
  let runMaintenance;
  let mockPool;
  let logger;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    logger = await import('../../src/logger.js');
    const mod = await import('../../src/utils/dbMaintenance.js');
    runMaintenance = mod.runMaintenance;

    // Default mock: every query succeeds with rowCount 0
    mockPool = {
      query: vi.fn().mockResolvedValue({ rowCount: 0 }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs all three maintenance tasks without throwing', async () => {
    await expect(runMaintenance(mockPool)).resolves.toBeUndefined();
    // tickets, sessions, rate_limits — 3 queries total
    expect(mockPool.query).toHaveBeenCalledTimes(3);
  });

  it('logs start and completion messages', async () => {
    await runMaintenance(mockPool);
    expect(logger.info).toHaveBeenCalledWith(
      'DB maintenance: starting routine cleanup',
      expect.objectContaining({ source: 'db_maintenance' }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'DB maintenance: cleanup complete',
      expect.objectContaining({ source: 'db_maintenance' }),
    );
  });

  it('logs info when tickets are purged', async () => {
    mockPool.query.mockImplementation((sql) => {
      if (typeof sql === 'string' && sql.includes('tickets')) {
        return Promise.resolve({ rowCount: 5 });
      }
      return Promise.resolve({ rowCount: 0 });
    });

    await runMaintenance(mockPool);
    expect(logger.info).toHaveBeenCalledWith(
      'DB maintenance: purged old closed tickets',
      expect.objectContaining({ count: 5 }),
    );
  });

  it('logs info when sessions are purged', async () => {
    mockPool.query.mockImplementation((sql) => {
      if (typeof sql === 'string' && sql.includes('sessions')) {
        return Promise.resolve({ rowCount: 12 });
      }
      return Promise.resolve({ rowCount: 0 });
    });

    await runMaintenance(mockPool);
    expect(logger.info).toHaveBeenCalledWith(
      'DB maintenance: purged expired sessions',
      expect.objectContaining({ count: 12 }),
    );
  });

  it('logs info when rate limits are purged', async () => {
    mockPool.query.mockImplementation((sql) => {
      if (typeof sql === 'string' && sql.includes('rate_limits')) {
        return Promise.resolve({ rowCount: 3 });
      }
      return Promise.resolve({ rowCount: 0 });
    });

    await runMaintenance(mockPool);
    expect(logger.info).toHaveBeenCalledWith(
      'DB maintenance: purged stale rate limit entries',
      expect.objectContaining({ count: 3 }),
    );
  });

  describe('missing table handling (42P01)', () => {
    it('skips gracefully when tickets table is missing', async () => {
      const tableError = Object.assign(new Error('relation "tickets" does not exist'), {
        code: '42P01',
      });

      mockPool.query.mockImplementation((sql) => {
        if (typeof sql === 'string' && sql.includes('tickets')) {
          return Promise.reject(tableError);
        }
        return Promise.resolve({ rowCount: 0 });
      });

      await expect(runMaintenance(mockPool)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'DB maintenance: tickets table does not exist, skipping',
        expect.objectContaining({ source: 'db_maintenance' }),
      );
    });

    it('skips gracefully when sessions table is missing', async () => {
      const tableError = Object.assign(new Error('relation "sessions" does not exist'), {
        code: '42P01',
      });

      mockPool.query.mockImplementation((sql) => {
        if (typeof sql === 'string' && sql.includes('sessions')) {
          return Promise.reject(tableError);
        }
        return Promise.resolve({ rowCount: 0 });
      });

      await expect(runMaintenance(mockPool)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'DB maintenance: sessions table does not exist, skipping',
        expect.objectContaining({ source: 'db_maintenance' }),
      );
    });

    it('skips gracefully when rate_limits table is missing', async () => {
      const tableError = Object.assign(new Error('relation "rate_limits" does not exist'), {
        code: '42P01',
      });

      mockPool.query.mockImplementation((sql) => {
        if (typeof sql === 'string' && sql.includes('rate_limits')) {
          return Promise.reject(tableError);
        }
        return Promise.resolve({ rowCount: 0 });
      });

      await expect(runMaintenance(mockPool)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'DB maintenance: rate_limits table does not exist, skipping',
        expect.objectContaining({ source: 'db_maintenance' }),
      );
    });

    it('handles all three tables missing simultaneously', async () => {
      const tableError = Object.assign(new Error('relation does not exist'), { code: '42P01' });
      mockPool.query.mockRejectedValue(tableError);

      await expect(runMaintenance(mockPool)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledTimes(3);
    });
  });

  it('logs error and resolves when an unexpected error is thrown', async () => {
    const unexpectedError = new Error('connection refused');
    mockPool.query.mockRejectedValue(unexpectedError);

    // runMaintenance catches top-level errors via try/catch around Promise.all
    await expect(runMaintenance(mockPool)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'DB maintenance: error during cleanup',
      expect.objectContaining({ error: 'connection refused' }),
    );
  });

  it('uses closed_at column (not updated_at) in tickets query', async () => {
    await runMaintenance(mockPool);
    const ticketsCall = mockPool.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('tickets'),
    );
    expect(ticketsCall).toBeDefined();
    expect(ticketsCall[0]).toContain('closed_at');
    expect(ticketsCall[0]).not.toContain('updated_at');
  });
});

describe('TICKET_RETENTION_DAYS env var parsing', () => {
  let originalRetentionEnv;

  beforeEach(() => {
    originalRetentionEnv = process.env.TICKET_RETENTION_DAYS;
  });

  afterEach(() => {
    if (originalRetentionEnv !== undefined) {
      process.env.TICKET_RETENTION_DAYS = originalRetentionEnv;
    } else {
      delete process.env.TICKET_RETENTION_DAYS;
    }
  });

  /**
   * Load dbMaintenance with a specific env var value, run maintenance,
   * and return the pool.query call for the tickets table.
   */
  async function getTicketsCallWith(value) {
    if (value !== undefined) {
      process.env.TICKET_RETENTION_DAYS = value;
    } else {
      delete process.env.TICKET_RETENTION_DAYS;
    }
    vi.resetModules();
    const mod = await import('../../src/utils/dbMaintenance.js');
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) };
    await mod.runMaintenance(pool);
    return pool.query.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('tickets'));
  }

  it('uses 0 retention days when TICKET_RETENTION_DAYS=0 (not the default 30)', async () => {
    const ticketsCall = await getTicketsCallWith('0');
    expect(ticketsCall).toBeDefined();
    expect(ticketsCall[1][0]).toBe(0);
  });

  it('falls back to 30 when TICKET_RETENTION_DAYS is negative', async () => {
    const ticketsCall = await getTicketsCallWith('-5');
    expect(ticketsCall).toBeDefined();
    expect(ticketsCall[1][0]).toBe(30);
  });

  it('falls back to 30 when TICKET_RETENTION_DAYS is not a number', async () => {
    const ticketsCall = await getTicketsCallWith('notanumber');
    expect(ticketsCall).toBeDefined();
    expect(ticketsCall[1][0]).toBe(30);
  });

  it('falls back to 30 when TICKET_RETENTION_DAYS is unset', async () => {
    const ticketsCall = await getTicketsCallWith(undefined);
    expect(ticketsCall).toBeDefined();
    expect(ticketsCall[1][0]).toBe(30);
  });

  it('uses configured value when set to a positive integer', async () => {
    const ticketsCall = await getTicketsCallWith('90');
    expect(ticketsCall).toBeDefined();
    expect(ticketsCall[1][0]).toBe(90);
  });
});
