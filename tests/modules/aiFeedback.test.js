/**
 * Tests for src/modules/aiFeedback.js
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

// Mock db.js so tests can control the pool without real PG connections.
// Mirrors real db.js: getPool() throws when not initialized (pool is null).
let _mockPool = null;
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(() => {
    if (!_mockPool) throw new Error('Database not initialized');
    return _mockPool;
  }),
}));

// Mock config — feedback enabled by default in tests so recordFeedback/deleteFeedback proceed
let _feedbackEnabled = true;
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn((_guildId) => ({
    ai: { feedback: { enabled: _feedbackEnabled } },
  })),
}));

import {
  clearAiMessages,
  deleteFeedback,
  getFeedbackStats,
  getFeedbackTrend,
  isAiMessage,
  recordFeedback,
  registerAiMessage,
} from '../../src/modules/aiFeedback.js';

describe('aiFeedback module', () => {
  let mockPool;

  beforeEach(() => {
    clearAiMessages();
    _feedbackEnabled = true;
    mockPool = { query: vi.fn() };
    _mockPool = mockPool;
    vi.clearAllMocks();
    // Re-apply after clearAllMocks so the pool getter still works
    _mockPool = mockPool;
  });

  // ── registerAiMessage / isAiMessage ──────────────────────────────────────

  describe('registerAiMessage / isAiMessage', () => {
    it('registers a message ID and returns true for isAiMessage', () => {
      registerAiMessage('msg-123');
      expect(isAiMessage('msg-123')).toBe(true);
    });

    it('returns false for unknown message ID', () => {
      expect(isAiMessage('unknown-id')).toBe(false);
    });

    it('clears all registered IDs on clearAiMessages', () => {
      registerAiMessage('msg-a');
      registerAiMessage('msg-b');
      clearAiMessages();
      expect(isAiMessage('msg-a')).toBe(false);
      expect(isAiMessage('msg-b')).toBe(false);
    });

    it('does not evict when re-adding an existing messageId', () => {
      // Fill up near capacity
      registerAiMessage('existing');
      // Re-adding should not evict 'existing' or grow the set
      const sizeBefore = 1;
      registerAiMessage('existing');
      expect(isAiMessage('existing')).toBe(true);
      // Adding a second unique entry should work
      registerAiMessage('new-one');
      expect(isAiMessage('new-one')).toBe(true);
      expect(isAiMessage('existing')).toBe(true);
    });
  });

  // ── recordFeedback ────────────────────────────────────────────────────────

  describe('recordFeedback', () => {
    it('does nothing when no pool is configured', async () => {
      _mockPool = null;
      await expect(
        recordFeedback({
          messageId: 'msg1',
          channelId: 'ch1',
          guildId: 'g1',
          userId: 'u1',
          feedbackType: 'positive',
        }),
      ).resolves.toBeUndefined();
    });

    it('does nothing when feedback is disabled in guild config', async () => {
      _feedbackEnabled = false;
      await recordFeedback({
        messageId: 'msg1',
        channelId: 'ch1',
        guildId: 'g1',
        userId: 'u1',
        feedbackType: 'positive',
      });
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('inserts feedback via pool query', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await recordFeedback({
        messageId: 'msg1',
        channelId: 'ch1',
        guildId: 'g1',
        userId: 'u1',
        feedbackType: 'positive',
      });

      expect(mockPool.query).toHaveBeenCalledOnce();
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO ai_feedback');
      expect(params).toEqual(['msg1', 'ch1', 'g1', 'u1', 'positive']);
    });

    it('ON CONFLICT updates feedback_type and updated_at, not created_at', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await recordFeedback({
        messageId: 'msg1',
        channelId: 'ch1',
        guildId: 'g1',
        userId: 'u1',
        feedbackType: 'negative',
      });

      const [sql] = mockPool.query.mock.calls[0];
      expect(sql).toContain('updated_at = NOW()');
      expect(sql).not.toContain('created_at = NOW()');
    });

    it('handles DB errors gracefully without throwing', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB down'));

      await expect(
        recordFeedback({
          messageId: 'msg1',
          channelId: 'ch1',
          guildId: 'g1',
          userId: 'u1',
          feedbackType: 'negative',
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ── deleteFeedback ────────────────────────────────────────────────────────

  describe('deleteFeedback', () => {
    it('does nothing when no pool is configured', async () => {
      _mockPool = null;
      await expect(
        deleteFeedback({ messageId: 'msg1', guildId: 'g1', userId: 'u1' }),
      ).resolves.toBeUndefined();
    });

    it('does nothing when feedback is disabled in guild config', async () => {
      _feedbackEnabled = false;
      await deleteFeedback({ messageId: 'msg1', guildId: 'g1', userId: 'u1' });
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('deletes feedback row via pool query', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await deleteFeedback({ messageId: 'msg1', guildId: 'g1', userId: 'u1' });

      expect(mockPool.query).toHaveBeenCalledOnce();
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('DELETE FROM ai_feedback');
      expect(params).toEqual(['msg1', 'u1', 'g1']);
    });

    it('handles DB errors gracefully without throwing', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB down'));

      await expect(
        deleteFeedback({ messageId: 'msg1', guildId: 'g1', userId: 'u1' }),
      ).resolves.toBeUndefined();
    });
  });

  // ── getFeedbackStats ──────────────────────────────────────────────────────

  describe('getFeedbackStats', () => {
    it('returns zeros when no pool', async () => {
      _mockPool = null;
      const stats = await getFeedbackStats('g1');
      expect(stats).toEqual({ positive: 0, negative: 0, total: 0, ratio: null });
    });

    it('returns aggregated stats from DB', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ positive: 8, negative: 2, total: 10 }],
      });

      const stats = await getFeedbackStats('g1');
      expect(stats.positive).toBe(8);
      expect(stats.negative).toBe(2);
      expect(stats.total).toBe(10);
      expect(stats.ratio).toBe(80);
    });

    it('returns null ratio when total is 0', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ positive: 0, negative: 0, total: 0 }],
      });

      const stats = await getFeedbackStats('g1');
      expect(stats.ratio).toBeNull();
    });

    it('returns zeros on DB error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const stats = await getFeedbackStats('g1');
      expect(stats).toEqual({ positive: 0, negative: 0, total: 0, ratio: null });
    });
  });

  // ── getFeedbackTrend ──────────────────────────────────────────────────────

  describe('getFeedbackTrend', () => {
    it('returns empty array when no pool', async () => {
      _mockPool = null;
      const trend = await getFeedbackTrend('g1');
      expect(trend).toEqual([]);
    });

    it('returns daily trend rows from DB', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { date: '2026-02-28', positive: 5, negative: 1 },
          { date: '2026-03-01', positive: 3, negative: 2 },
        ],
      });

      const trend = await getFeedbackTrend('g1', 7);
      expect(trend).toHaveLength(2);
      expect(trend[0]).toEqual({ date: '2026-02-28', positive: 5, negative: 1 });

      // Verify days param is passed
      const [, params] = mockPool.query.mock.calls[0];
      expect(params).toContain(7);
    });

    it('returns empty array on DB error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const trend = await getFeedbackTrend('g1');
      expect(trend).toEqual([]);
    });
  });
});
