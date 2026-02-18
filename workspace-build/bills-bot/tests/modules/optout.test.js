import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock db module
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(() => {
    throw new Error('Database not initialized');
  }),
}));

import { getPool } from '../../src/db.js';
import { warn } from '../../src/logger.js';
import {
  _resetOptouts,
  _setPool,
  isOptedOut,
  loadOptOuts,
  toggleOptOut,
} from '../../src/modules/optout.js';

/** Helper to create a mock pool */
function createMockPool() {
  return { query: vi.fn() };
}

describe('optout module', () => {
  let mockPool;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetOptouts();
    mockPool = createMockPool();
    _setPool(mockPool);
  });

  afterEach(() => {
    _resetOptouts();
  });

  describe('isOptedOut', () => {
    it('should return false for users who have not opted out', () => {
      expect(isOptedOut('user123')).toBe(false);
    });

    it('should return true for users who have opted out', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      await toggleOptOut('user123');
      expect(isOptedOut('user123')).toBe(true);
    });

    it('should return false for different users', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      await toggleOptOut('user123');
      expect(isOptedOut('user456')).toBe(false);
    });
  });

  describe('toggleOptOut', () => {
    it('should opt out a user who is opted in', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await toggleOptOut('user123');
      expect(result).toEqual({ optedOut: true });
      expect(isOptedOut('user123')).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        'INSERT INTO memory_optouts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
        ['user123'],
      );
    });

    it('should opt in a user who is opted out', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      await toggleOptOut('user123'); // opt out
      const result = await toggleOptOut('user123'); // opt back in
      expect(result).toEqual({ optedOut: false });
      expect(isOptedOut('user123')).toBe(false);
      expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM memory_optouts WHERE user_id = $1', [
        'user123',
      ]);
    });

    it('should persist to database on each toggle', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      await toggleOptOut('user123');
      expect(mockPool.query).toHaveBeenCalledTimes(1);

      await toggleOptOut('user123');
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple users independently', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      await toggleOptOut('user1');
      await toggleOptOut('user2');

      expect(isOptedOut('user1')).toBe(true);
      expect(isOptedOut('user2')).toBe(true);
      expect(isOptedOut('user3')).toBe(false);

      await toggleOptOut('user1'); // opt back in
      expect(isOptedOut('user1')).toBe(false);
      expect(isOptedOut('user2')).toBe(true);
    });

    it('should keep in-memory state when DB insert fails', async () => {
      mockPool.query.mockRejectedValue(new Error('connection refused'));
      const result = await toggleOptOut('user123');
      expect(result).toEqual({ optedOut: true });
      expect(isOptedOut('user123')).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        'Failed to persist opt-out to database',
        expect.objectContaining({ userId: 'user123' }),
      );
    });

    it('should keep in-memory state when DB delete fails', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // insert succeeds
      await toggleOptOut('user123'); // opt out

      mockPool.query.mockRejectedValueOnce(new Error('connection refused'));
      const result = await toggleOptOut('user123'); // opt back in
      expect(result).toEqual({ optedOut: false });
      expect(isOptedOut('user123')).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        'Failed to delete opt-out from database',
        expect.objectContaining({ userId: 'user123' }),
      );
    });

    it('should work without a pool (no DB available)', async () => {
      _setPool(null);
      // getPool already mocked to throw
      const result = await toggleOptOut('user123');
      expect(result).toEqual({ optedOut: true });
      expect(isOptedOut('user123')).toBe(true);
    });
  });

  describe('loadOptOuts', () => {
    it('should load opted-out users from database', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ user_id: 'user1' }, { user_id: 'user2' }],
      });

      await loadOptOuts();

      expect(isOptedOut('user1')).toBe(true);
      expect(isOptedOut('user2')).toBe(true);
      expect(isOptedOut('user3')).toBe(false);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT user_id FROM memory_optouts');
    });

    it('should handle empty result set', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await loadOptOuts();

      expect(isOptedOut('anyone')).toBe(false);
    });

    it('should handle database query failure gracefully', async () => {
      mockPool.query.mockRejectedValue(new Error('relation does not exist'));

      await loadOptOuts();

      expect(isOptedOut('anyone')).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        'Failed to load opt-outs from database',
        expect.objectContaining({ error: 'relation does not exist' }),
      );
    });

    it('should handle no pool available gracefully', async () => {
      _setPool(null);
      // getPool already mocked to throw

      await loadOptOuts();

      expect(isOptedOut('anyone')).toBe(false);
      expect(warn).toHaveBeenCalledWith('Database not available, starting with empty opt-out set');
    });

    it('should fall back to getPool when no injected pool', async () => {
      _setPool(null);
      const fallbackPool = createMockPool();
      fallbackPool.query.mockResolvedValue({
        rows: [{ user_id: 'user1' }],
      });
      getPool.mockReturnValue(fallbackPool);

      await loadOptOuts();

      expect(isOptedOut('user1')).toBe(true);
      expect(getPool).toHaveBeenCalled();
    });
  });
});
