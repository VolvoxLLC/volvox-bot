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
  deleteFeedback,
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
      await recordFeedback({
        messageId: 'm1',
        channelId: 'c1',
        guildId: 'g1',
        userId: 'u1',
        feedbackType: 'positive',
      });
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('inserts feedback via pool query', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      setPool(mockPool);

      await recordFeedback({
        messageId: 'm1',
        channelId: 'c1',
        guildId: 'g1',
        userId: 'u1',
        feedbackType: 'positive',
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ai_feedback'),
        ['m1', 'c1', 'g1', 'u1', 'positive'],
      );
    });

    it('handles DB errors gracefully without throwing', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));
      setPool(mockPool);

      await expect(
        recordFeedback({
          messageId: 'm1',
          channelId: 'c1',
          guildId: 'g1',
          userId: 'u1',
          feedbackType: 'positive',
        }),
      ).resolves.toBeUndefined();
    });

    it('uses _setPoolGetter for DI', async () => {
      const altPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      _setPoolGetter(() => altPool);

      await recordFeedback({
        messageId: 'm2',
        channelId: 'c2',
        guildId: 'g2',
        userId: 'u2',
        feedbackType: 'negative',
      });

      expect(altPool.query).toHaveBeenCalled();
    });
  });

  // ── getFeedbackStats ────────────────────────────────────────────────────────

  describe('getFeedbackStats', () => {
    it('returns zeros when no pool', async () => {
      const stats = await getFeedbackStats('g1');
      expect(stats).toEqual({ positive: 0, negative: 0, total: 0, ratio: null });
    });

    it('returns aggregated stats from DB', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ positive: 5, negative: 2, total: 7 }],
      });
      setPool(mockPool);

      const stats = await getFeedbackStats('g1');

      expect(stats.positive).toBe(5);
      expect(stats.negative).toBe(2);
      expect(stats.total).toBe(7);
      expect(stats.ratio).toBe(71);
    });

    it('returns null ratio when total is 0', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ positive: 0, negative: 0, total: 0 }],
      });
      setPool(mockPool);

      const stats = await getFeedbackStats('g1');
      expect(stats.ratio).toBeNull();
    });
  });

  // ── deleteFeedback ─────────────────────────────────────────────────────────

  describe('deleteFeedback', () => {
    it('does nothing when no pool is configured', async () => {
      await deleteFeedback({ messageId: 'm1', userId: 'u1' });
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('executes correct DELETE query', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });
      setPool(mockPool);

      await deleteFeedback({ messageId: 'm1', userId: 'u1' });

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM ai_feedback WHERE message_id = $1 AND user_id = $2',
        ['m1', 'u1'],
      );
    });

    it('scopes deletion to feedbackType when provided', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });
      setPool(mockPool);

      await deleteFeedback({ messageId: 'm1', userId: 'u1', feedbackType: 'positive' });

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM ai_feedback WHERE message_id = $1 AND user_id = $2 AND feedback_type = $3',
        ['m1', 'u1', 'positive'],
      );
    });

    it('handles DB errors gracefully without throwing', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));
      setPool(mockPool);

      await expect(
        deleteFeedback({ messageId: 'm1', userId: 'u1' }),
      ).resolves.toBeUndefined();
    });
  });

  // ── getFeedbackTrend ────────────────────────────────────────────────────────

  describe('getFeedbackTrend', () => {
    it('returns empty array when no pool', async () => {
      const trend = await getFeedbackTrend('g1', 7);
      expect(trend).toEqual([]);
    });

    it('returns daily trend rows from DB', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { date: '2026-03-01', positive: 3, negative: 1 },
          { date: '2026-03-02', positive: 2, negative: 0 },
        ],
      });
      setPool(mockPool);

      const trend = await getFeedbackTrend('g1', 30);

      expect(trend).toHaveLength(2);
      expect(trend[0].date).toBe('2026-03-01');
      expect(trend[0].positive).toBe(3);
      expect(trend[0].negative).toBe(1);
    });
  });
});
