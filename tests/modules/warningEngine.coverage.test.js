/**
 * Coverage tests for warningEngine.js — DB failure paths, edge cases,
 * and error handling not covered by the main test file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    moderation: {
      warnings: { expiryDays: 30, severityPoints: { low: 1, medium: 2, high: 3 } },
    },
  }),
}));

import { getPool } from '../../src/db.js';
import { error as logError, warn as logWarn } from '../../src/logger.js';
import { getConfig } from '../../src/modules/config.js';
import {
  calculateExpiry,
  clearWarnings,
  createWarning,
  editWarning,
  getActiveWarningStats,
  getWarnings,
  processExpiredWarnings,
  removeWarning,
  startWarningExpiryScheduler,
  stopWarningExpiryScheduler,
} from '../../src/modules/warningEngine.js';

describe('warningEngine — DB failure coverage', () => {
  let mockPool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() };
    getPool.mockReturnValue(mockPool);
  });

  afterEach(() => {
    stopWarningExpiryScheduler();
    vi.useRealTimers();
  });

  // ── createWarning DB failure ──────────────────────────────────────────

  describe('createWarning DB failure', () => {
    it('should throw when INSERT query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('INSERT failed'));

      await expect(
        createWarning('g1', {
          targetId: 't1',
          targetTag: 'target#0001',
          moderatorId: 'm1',
          moderatorTag: 'mod#0001',
          reason: 'test',
          severity: 'medium',
        }),
      ).rejects.toThrow('INSERT failed');
    });
  });

  // ── getWarnings DB failure ────────────────────────────────────────────

  describe('getWarnings DB failure', () => {
    it('should throw when SELECT query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('SELECT failed'));

      await expect(getWarnings('g1', 't1')).rejects.toThrow('SELECT failed');
    });
  });

  // ── getActiveWarningStats DB failure ──────────────────────────────────

  describe('getActiveWarningStats DB failure', () => {
    it('should throw when stats query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('stats query failed'));

      await expect(getActiveWarningStats('g1', 't1')).rejects.toThrow('stats query failed');
    });
  });

  // ── editWarning DB failure ────────────────────────────────────────────

  describe('editWarning DB failure', () => {
    it('should throw when UPDATE query fails', async () => {
      // First query is SELECT to get original, second is UPDATE
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, severity: 'low', reason: 'old', points: 1 }] }) // SELECT
        .mockRejectedValueOnce(new Error('UPDATE failed')); // UPDATE

      await expect(editWarning('g1', 1, { reason: 'new reason' })).rejects.toThrow('UPDATE failed');
    });

    it('should return null when warning not found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT returns nothing
        .mockResolvedValueOnce({ rows: [] }); // UPDATE returns nothing

      const result = await editWarning('g1', 999, { reason: 'test' });
      expect(result).toBeNull();
    });
  });

  // ── removeWarning DB failure ──────────────────────────────────────────

  describe('removeWarning DB failure', () => {
    it('should throw when deactivation query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('deactivation failed'));

      await expect(removeWarning(1, 'm1', 'test reason')).rejects.toThrow('deactivation failed');
    });
  });

  // ── clearWarnings DB failure ──────────────────────────────────────────

  describe('clearWarnings DB failure', () => {
    it('should throw when bulk clear query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('bulk clear failed'));

      await expect(clearWarnings('g1', 't1', 'm1')).rejects.toThrow('bulk clear failed');
    });
  });

  // ── processExpiredWarnings DB failure ─────────────────────────────────

  describe('processExpiredWarnings DB failure', () => {
    it('should log error and return 0 when expiry query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('expiry query failed'));

      const result = await processExpiredWarnings();

      expect(result).toBe(0);
      expect(logError).toHaveBeenCalledWith(
        'Failed to process expired warnings',
        expect.objectContaining({ error: 'expiry query failed' }),
      );
    });
  });

  // ── calculateExpiry edge cases ────────────────────────────────────────

  describe('calculateExpiry edge cases', () => {
    it('should return null when expiryDays is 0', () => {
      const config = { moderation: { warnings: { expiryDays: 0 } } };
      const result = calculateExpiry(config);
      expect(result).toBeNull();
    });

    it('should return null when expiryDays is undefined', () => {
      const config = { moderation: { warnings: {} } };
      const result = calculateExpiry(config);
      expect(result).toBeNull();
    });

    it('should return null when config has no warnings key', () => {
      const config = { moderation: {} };
      const result = calculateExpiry(config);
      expect(result).toBeNull();
    });

    it('should return a future date when expiryDays is positive', () => {
      const config = { moderation: { warnings: { expiryDays: 30 } } };
      const result = calculateExpiry(config);
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThan(Date.now());
    });
  });

  // ── Scheduler DB failure ──────────────────────────────────────────────

  describe('warning expiry scheduler DB failure', () => {
    it('should handle scheduler query failure gracefully', async () => {
      mockPool.query.mockRejectedValue(new Error('scheduler query failed'));

      startWarningExpiryScheduler();

      // Give the initial poll time to settle
      await new Promise((r) => setTimeout(r, 50));

      // processExpiredWarnings catches errors and logs them
      expect(logError).toHaveBeenCalledWith(
        'Failed to process expired warnings',
        expect.objectContaining({ error: 'scheduler query failed' }),
      );
      stopWarningExpiryScheduler();
    });
  });
});
