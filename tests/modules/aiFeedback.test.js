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

import {
  _setPoolGetter,
  clearAiMessages,
  getFeedbackStats,
  getFeedbackTrend,
  isAiMessage,
  recordFeedback,
  registerAiMessage,
  setPool,
} from '../../src/modules/aiFeedback.js';

describe('aiFeedback module', () => {
  let mockPool;

  beforeEach(() => {
    clearAiMessages();
    setPool(null);
    _setPoolGetter(null);
    mockPool = { query: vi.fn() };
    vi.clearAllMocks();
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
  });

  // ── recordFeedback ────────────────────────────────────────────────────────

  describe('recordFeedback', () => {
    it('does nothing when no pool is configured', async () => {
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

    it('inserts feedback via pool query', async () => {
      setPool(mockPool);
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

    it('handles DB errors gracefully without throwing', async () => {
      setPool(mockPool);
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

    it('uses _setPoolGetter for DI', async () => {
      _setPoolGetter(() => mockPool);
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await recordFeedback({
        messageId: 'msg-di',
        channelId: 'ch1',
        guildId: 'g1',
        userId: 'u1',
        feedbackType: 'positive',
      });

      expect(mockPool.query).toHaveBeenCalledOnce();
    });
  });

  // ── getFeedbackStats ──────────────────────────────────────────────────────

  describe('getFeedbackStats', () => {
    it('returns zeros when no pool', async () => {
      const stats = await getFeedbackStats('g1');
      expect(stats).toEqual({ positive: 0, negative: 0, total: 0, ratio: null });
    });

    it('returns aggregated stats from DB', async () => {
      setPool(mockPool);
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
      setPool(mockPool);
      mockPool.query.mockResolvedValueOnce({
        rows: [{ positive: 0, negative: 0, total: 0 }],
      });

      const stats = await getFeedbackStats('g1');
      expect(stats.ratio).toBeNull();
    });

    it('returns zeros on DB error', async () => {
      setPool(mockPool);
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const stats = await getFeedbackStats('g1');
      expect(stats).toEqual({ positive: 0, negative: 0, total: 0, ratio: null });
    });
  });

  // ── getFeedbackTrend ──────────────────────────────────────────────────────

  describe('getFeedbackTrend', () => {
    it('returns empty array when no pool', async () => {
      const trend = await getFeedbackTrend('g1');
      expect(trend).toEqual([]);
    });

    it('returns daily trend rows from DB', async () => {
      setPool(mockPool);
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
      setPool(mockPool);
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const trend = await getFeedbackTrend('g1');
      expect(trend).toEqual([]);
    });
  });
});
