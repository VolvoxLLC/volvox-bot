import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger — must be defined before imports that use it
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Lazily import after mocks are set up
let recordRestart, updateUptimeOnShutdown, getRestarts, getLastRestart, getStartedAt, _resetState;

/**
 * Build a minimal pg pool mock.
 * `queryResponses` is a map of SQL fragment → result object.
 */
function makePool(queryResponses = {}) {
  return {
    query: vi.fn(async (sql, _params) => {
      for (const [fragment, result] of Object.entries(queryResponses)) {
        if (sql.includes(fragment)) return result;
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('restartTracker', () => {
  beforeEach(async () => {
    vi.resetModules();
    // Re-import fresh module so module-level state is reset
    const mod = await import('../../src/utils/restartTracker.js');
    recordRestart = mod.recordRestart;
    updateUptimeOnShutdown = mod.updateUptimeOnShutdown;
    getRestarts = mod.getRestarts;
    getLastRestart = mod.getLastRestart;
    getStartedAt = mod.getStartedAt;
    _resetState = mod._resetState;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // recordRestart
  // ---------------------------------------------------------------------------

  describe('recordRestart', () => {
    it('creates the table then inserts a row, returns the new id', async () => {
      const pool = makePool({
        'RETURNING id': { rows: [{ id: 42 }] },
      });

      const id = await recordRestart(pool, 'startup', '1.0.0');

      expect(id).toBe(42);
      // First call: CREATE TABLE IF NOT EXISTS
      expect(pool.query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS bot_restarts');
      // Second call: INSERT
      const insertCall = pool.query.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO bot_restarts');
      expect(insertCall[1]).toEqual(['startup', '1.0.0']);
    });

    it('sets startedAt to a recent timestamp', async () => {
      const before = Date.now();
      const pool = makePool({ 'RETURNING id': { rows: [{ id: 1 }] } });

      await recordRestart(pool);

      const after = Date.now();
      const started = getStartedAt();
      expect(started).toBeGreaterThanOrEqual(before);
      expect(started).toBeLessThanOrEqual(after);
    });

    it('defaults reason to "startup" and version to null', async () => {
      const pool = makePool({ 'RETURNING id': { rows: [{ id: 1 }] } });

      await recordRestart(pool);

      const insertCall = pool.query.mock.calls[1];
      expect(insertCall[1]).toEqual(['startup', null]);
    });

    it('returns null and logs error when query throws', async () => {
      const pool = { query: vi.fn().mockRejectedValue(new Error('db down')) };
      const { error: logError } = await import('../../src/logger.js');

      const id = await recordRestart(pool);

      expect(id).toBeNull();
      expect(logError).toHaveBeenCalledWith(
        'Failed to record restart',
        expect.objectContaining({ error: 'db down' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateUptimeOnShutdown
  // ---------------------------------------------------------------------------

  describe('updateUptimeOnShutdown', () => {
    it('updates the restart row with uptime_seconds', async () => {
      const pool = makePool({ 'RETURNING id': { rows: [{ id: 7 }] } });
      await recordRestart(pool, 'startup', null);

      // Small artificial delay so uptime > 0
      await new Promise((r) => setTimeout(r, 10));

      const updatePool = makePool({});
      await updateUptimeOnShutdown(updatePool);

      const [sql, params] = updatePool.query.mock.calls[0];
      expect(sql).toContain('UPDATE bot_restarts SET uptime_seconds');
      expect(params[0]).toBeGreaterThan(0); // uptime > 0
      expect(params[1]).toBe(7); // correct row id
    });

    it('warns and skips when called before recordRestart', async () => {
      // Module freshly loaded — no recordRestart has run yet
      const pool = makePool({});
      const { warn } = await import('../../src/logger.js');

      await updateUptimeOnShutdown(pool);

      expect(pool.query).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('updateUptimeOnShutdown called before recordRestart'),
      );
    });

    it('logs error but does not throw when update query fails', async () => {
      const pool = makePool({ 'RETURNING id': { rows: [{ id: 3 }] } });
      await recordRestart(pool);

      const badPool = { query: vi.fn().mockRejectedValue(new Error('write fail')) };
      const { error: logError } = await import('../../src/logger.js');

      await expect(updateUptimeOnShutdown(badPool)).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalledWith(
        'Failed to update uptime on shutdown',
        expect.objectContaining({ error: 'write fail' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getRestarts
  // ---------------------------------------------------------------------------

  describe('getRestarts', () => {
    it('returns rows from the database', async () => {
      const rows = [
        { id: 2, timestamp: new Date(), reason: 'startup', version: '1.0.0', uptime_seconds: 300 },
        { id: 1, timestamp: new Date(), reason: 'startup', version: '1.0.0', uptime_seconds: 120 },
      ];
      const pool = makePool({ 'FROM bot_restarts': { rows } });

      const result = await getRestarts(pool);

      expect(result).toEqual(rows);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toContain('ORDER BY timestamp DESC');
      expect(params[0]).toBe(20); // default limit
    });

    it('respects custom limit', async () => {
      const pool = makePool({ 'FROM bot_restarts': { rows: [] } });

      await getRestarts(pool, 5);

      expect(pool.query.mock.calls[0][1][0]).toBe(5);
    });

    it('clamps fractional and tiny limits to at least 1', async () => {
      const pool = makePool({ 'FROM bot_restarts': { rows: [] } });

      await getRestarts(pool, 0.9);

      expect(pool.query.mock.calls[0][1][0]).toBe(1);
    });

    it('returns empty array and logs error on query failure', async () => {
      const pool = { query: vi.fn().mockRejectedValue(new Error('oops')) };
      const { error: logError } = await import('../../src/logger.js');

      const result = await getRestarts(pool);

      expect(result).toEqual([]);
      expect(logError).toHaveBeenCalledWith(
        'Failed to query restarts',
        expect.objectContaining({ error: 'oops' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getLastRestart
  // ---------------------------------------------------------------------------

  describe('getLastRestart', () => {
    it('returns the single most recent row', async () => {
      const row = {
        id: 9,
        timestamp: new Date(),
        reason: 'startup',
        version: null,
        uptime_seconds: null,
      };
      const pool = makePool({ 'FROM bot_restarts': { rows: [row] } });

      const result = await getLastRestart(pool);

      expect(result).toEqual(row);
      // Limit of 1 was passed through
      expect(pool.query.mock.calls[0][1][0]).toBe(1);
    });

    it('returns null when no restarts exist', async () => {
      const pool = makePool({ 'FROM bot_restarts': { rows: [] } });

      const result = await getLastRestart(pool);

      expect(result).toBeNull();
    });
  });
});
