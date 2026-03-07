import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

import { getPool } from '../../src/db.js';
import {
  calculateExpiry,
  clearWarnings,
  createWarning,
  editWarning,
  getActiveWarningStats,
  getSeverityPoints,
  getWarnings,
  processExpiredWarnings,
  removeWarning,
  startWarningExpiryScheduler,
  stopWarningExpiryScheduler,
} from '../../src/modules/warningEngine.js';

describe('warningEngine module', () => {
  let mockPool;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPool = {
      query: vi.fn(),
    };

    getPool.mockReturnValue(mockPool);
  });

  afterEach(() => {
    stopWarningExpiryScheduler();
    vi.useRealTimers();
  });

  // ── getSeverityPoints ───────────────────────────────────────────────
  describe('getSeverityPoints', () => {
    it('should return default points when no config provided', () => {
      expect(getSeverityPoints(null, 'low')).toBe(1);
      expect(getSeverityPoints(null, 'medium')).toBe(2);
      expect(getSeverityPoints(null, 'high')).toBe(3);
    });

    it('should return config-overridden points', () => {
      const config = {
        moderation: {
          warnings: {
            severityPoints: { low: 2, medium: 4, high: 6 },
          },
        },
      };
      expect(getSeverityPoints(config, 'low')).toBe(2);
      expect(getSeverityPoints(config, 'medium')).toBe(4);
      expect(getSeverityPoints(config, 'high')).toBe(6);
    });

    it('should fallback to 1 for unknown severity', () => {
      expect(getSeverityPoints(null, 'unknown')).toBe(1);
    });
  });

  // ── calculateExpiry ─────────────────────────────────────────────────
  describe('calculateExpiry', () => {
    it('should return null when no expiryDays configured', () => {
      expect(calculateExpiry(null)).toBeNull();
      expect(calculateExpiry({})).toBeNull();
      expect(calculateExpiry({ moderation: {} })).toBeNull();
    });

    it('should return null when expiryDays is 0 or negative', () => {
      expect(calculateExpiry({ moderation: { warnings: { expiryDays: 0 } } })).toBeNull();
      expect(calculateExpiry({ moderation: { warnings: { expiryDays: -1 } } })).toBeNull();
    });

    it('should return a future date when expiryDays is positive', () => {
      const config = { moderation: { warnings: { expiryDays: 90 } } };
      const result = calculateExpiry(config);
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThan(Date.now());

      // Should be roughly 90 days from now (within 2 hour tolerance for DST)
      const expectedMs = Date.now() + 90 * 24 * 60 * 60 * 1000;
      expect(Math.abs(result.getTime() - expectedMs)).toBeLessThan(2 * 60 * 60 * 1000);
    });
  });

  // ── createWarning ───────────────────────────────────────────────────
  describe('createWarning', () => {
    it('should insert a warning and return it', async () => {
      const mockWarning = {
        id: 1,
        guild_id: 'guild1',
        user_id: 'user1',
        moderator_id: 'mod1',
        moderator_tag: 'Mod#0001',
        reason: 'test reason',
        severity: 'low',
        points: 1,
        active: true,
        expires_at: null,
        case_id: 5,
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockWarning] });

      const result = await createWarning('guild1', {
        userId: 'user1',
        moderatorId: 'mod1',
        moderatorTag: 'Mod#0001',
        reason: 'test reason',
        severity: 'low',
        caseId: 5,
      });

      expect(result).toEqual(mockWarning);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO warnings'),
        expect.arrayContaining(['guild1', 'user1', 'mod1', 'Mod#0001', 'test reason', 'low', 1]),
      );
    });

    it('should use config severity points', async () => {
      const config = {
        moderation: { warnings: { severityPoints: { high: 10 }, expiryDays: 30 } },
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 2, points: 10 }],
      });

      await createWarning(
        'guild1',
        {
          userId: 'user1',
          moderatorId: 'mod1',
          moderatorTag: 'Mod#0001',
          severity: 'high',
        },
        config,
      );

      // Points should be 10 (from config)
      const queryArgs = mockPool.query.mock.calls[0][1];
      expect(queryArgs[6]).toBe(10); // points param
      expect(queryArgs[7]).toBeInstanceOf(Date); // expires_at param
    });

    it('should default severity to low when not specified', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 3, severity: 'low', points: 1 }] });

      await createWarning('guild1', {
        userId: 'user1',
        moderatorId: 'mod1',
        moderatorTag: 'Mod#0001',
      });

      const queryArgs = mockPool.query.mock.calls[0][1];
      expect(queryArgs[5]).toBe('low'); // severity
      expect(queryArgs[6]).toBe(1); // points
    });
  });

  // ── getWarnings ─────────────────────────────────────────────────────
  describe('getWarnings', () => {
    it('should return all warnings for a user', async () => {
      const mockWarnings = [
        { id: 1, active: true },
        { id: 2, active: false },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockWarnings });

      const result = await getWarnings('guild1', 'user1');

      expect(result).toEqual(mockWarnings);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM warnings'),
        expect.arrayContaining(['guild1', 'user1']),
      );
    });

    it('should filter active only when requested', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, active: true }] });

      await getWarnings('guild1', 'user1', { activeOnly: true });

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('active = TRUE');
    });

    it('should respect limit option', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await getWarnings('guild1', 'user1', { limit: 10 });

      const queryArgs = mockPool.query.mock.calls[0][1];
      expect(queryArgs[queryArgs.length - 1]).toBe(10);
    });
  });

  // ── getActiveWarningStats ───────────────────────────────────────────
  describe('getActiveWarningStats', () => {
    it('should return count and points for active warnings', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ count: 3, points: 7 }],
      });

      const result = await getActiveWarningStats('guild1', 'user1');

      expect(result).toEqual({ count: 3, points: 7 });
    });

    it('should return zeros when no active warnings', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ count: 0, points: 0 }],
      });

      const result = await getActiveWarningStats('guild1', 'user1');

      expect(result).toEqual({ count: 0, points: 0 });
    });

    it('should handle empty result', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await getActiveWarningStats('guild1', 'user1');

      expect(result).toEqual({ count: 0, points: 0 });
    });
  });

  // ── editWarning ─────────────────────────────────────────────────────
  describe('editWarning', () => {
    it('should update reason', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, reason: 'updated reason' }],
      });

      const result = await editWarning('guild1', 1, { reason: 'updated reason' });

      expect(result).toEqual({ id: 1, reason: 'updated reason' });
      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('reason =');
    });

    it('should update severity and recalculate points', async () => {
      const config = {
        moderation: { warnings: { severityPoints: { high: 5 } } },
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, severity: 'high', points: 5 }],
      });

      const result = await editWarning('guild1', 1, { severity: 'high' }, config);

      expect(result).toEqual({ id: 1, severity: 'high', points: 5 });
      const queryArgs = mockPool.query.mock.calls[0][1];
      // severity and points should both be in the params
      expect(queryArgs).toContain('high');
      expect(queryArgs).toContain(5);
    });

    it('should return null when warning not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await editWarning('guild1', 999, { reason: 'test' });

      expect(result).toBeNull();
    });
  });

  // ── removeWarning ───────────────────────────────────────────────────
  describe('removeWarning', () => {
    it('should deactivate a warning', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, active: false, removed_by: 'mod1', user_id: 'user1' }],
      });

      const result = await removeWarning('guild1', 1, 'mod1', 'pardoned');

      expect(result).toEqual(expect.objectContaining({ id: 1, removed_by: 'mod1' }));
      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('active = FALSE');
      expect(query).toContain('AND active = TRUE');
    });

    it('should return null when warning not found or already inactive', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await removeWarning('guild1', 999, 'mod1');

      expect(result).toBeNull();
    });
  });

  // ── clearWarnings ───────────────────────────────────────────────────
  describe('clearWarnings', () => {
    it('should deactivate all active warnings for a user', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 3 });

      const result = await clearWarnings('guild1', 'user1', 'mod1', 'clean slate');

      expect(result).toBe(3);
      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('active = FALSE');
      expect(query).toContain('AND active = TRUE');
    });

    it('should return 0 when no active warnings exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await clearWarnings('guild1', 'user1', 'mod1');

      expect(result).toBe(0);
    });

    it('should use default reason when none provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await clearWarnings('guild1', 'user1', 'mod1');

      const queryArgs = mockPool.query.mock.calls[0][1];
      expect(queryArgs[1]).toBe('Bulk clear');
    });
  });

  // ── processExpiredWarnings ──────────────────────────────────────────
  describe('processExpiredWarnings', () => {
    it('should deactivate expired warnings', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 5 });

      const result = await processExpiredWarnings();

      expect(result).toBe(5);
      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('active = FALSE');
      expect(query).toContain('expires_at <= NOW()');
    });

    it('should return 0 when no expired warnings', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await processExpiredWarnings();

      expect(result).toBe(0);
    });

    it('should handle errors gracefully and return 0', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await processExpiredWarnings();

      expect(result).toBe(0);
    });
  });

  // ── scheduler ──────────────────────────────────────────────────────
  describe('warning expiry scheduler', () => {
    it('should start and stop without errors', () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });

      startWarningExpiryScheduler();
      // Starting again should be a no-op
      startWarningExpiryScheduler();

      stopWarningExpiryScheduler();
      // Stopping again should be a no-op
      stopWarningExpiryScheduler();
    });

    it('should run an immediate check on startup', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });

      startWarningExpiryScheduler();

      // Wait for the initial poll to complete
      await vi.waitFor(() => {
        expect(mockPool.query).toHaveBeenCalled();
      });

      stopWarningExpiryScheduler();
    });

    it('should poll periodically', async () => {
      vi.useFakeTimers();
      mockPool.query.mockResolvedValue({ rowCount: 0 });

      startWarningExpiryScheduler();

      // Initial call
      await vi.advanceTimersByTimeAsync(0);
      const initialCalls = mockPool.query.mock.calls.length;

      // Advance to trigger interval
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockPool.query.mock.calls.length).toBeGreaterThan(initialCalls);

      stopWarningExpiryScheduler();
    });
  });
});
