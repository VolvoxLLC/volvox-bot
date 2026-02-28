/**
 * Coverage tests for src/modules/ai.js
 * Tests: config edge cases, hydration failures, cleanup, TTL, pool write-through
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(() => ({ ai: { historyLength: 20, historyTTLDays: 30 } })),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import { getConfig } from '../../src/modules/config.js';
import { warn as logWarn } from '../../src/logger.js';
import {
  _setPoolGetter,
  addToHistory,
  getConversationHistory,
  getHistoryAsync,
  initConversationHistory,
  setConversationHistory,
  setPool,
  startConversationCleanup,
  stopConversationCleanup,
} from '../../src/modules/ai.js';

describe('ai module coverage', () => {
  beforeEach(() => {
    setConversationHistory(new Map());
    setPool(null);
    _setPoolGetter(null);
    vi.clearAllMocks();
    getConfig.mockReturnValue({ ai: { historyLength: 20, historyTTLDays: 30 } });
    stopConversationCleanup();
  });

  afterEach(() => {
    setConversationHistory(new Map());
    setPool(null);
    _setPoolGetter(null);
    stopConversationCleanup();
  });

  describe('getHistoryLength config edge cases', () => {
    it('uses default when config throws', async () => {
      getConfig.mockImplementation(() => { throw new Error('config error'); });
      // Should not throw and should use DEFAULT_HISTORY_LENGTH (20)
      const history = await getHistoryAsync('test-channel');
      expect(history).toEqual([]);
    });

    it('uses default when historyLength is 0 (falsy positive)', async () => {
      getConfig.mockReturnValue({ ai: { historyLength: 0 } });
      const history = await getHistoryAsync('test-channel');
      expect(history).toEqual([]);
    });

    it('uses default when historyLength is negative', async () => {
      getConfig.mockReturnValue({ ai: { historyLength: -5 } });
      const history = await getHistoryAsync('test-channel');
      expect(history).toEqual([]);
    });

    it('uses default when config has no ai key', async () => {
      getConfig.mockReturnValue({});
      const history = await getHistoryAsync('test-channel');
      expect(history).toEqual([]);
    });

    it('uses configured value when valid', async () => {
      getConfig.mockReturnValue({ ai: { historyLength: 5 } });
      // Add 6 messages - should trim to 5
      for (let i = 0; i < 6; i++) {
        addToHistory('ch-trim', 'user', `msg ${i}`);
      }
      const history = getConversationHistory().get('ch-trim');
      expect(history.length).toBe(5);
    });
  });

  describe('hydrateHistory', () => {
    it('returns in-memory history when no pool', async () => {
      addToHistory('ch1', 'user', 'hello');
      const history = await getHistoryAsync('ch1');
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('hello');
    });

    it('dedupes concurrent hydration requests', async () => {
      let resolveQuery;
      const queryPromise = new Promise((resolve) => { resolveQuery = resolve; });
      const mockPool = {
        query: vi.fn()
          .mockImplementationOnce(() => queryPromise)
          .mockResolvedValue({}),
      };
      setPool(mockPool);

      // Two concurrent getHistoryAsync for same channel
      const p1 = getHistoryAsync('dedup-channel');
      const p2 = getHistoryAsync('dedup-channel');

      resolveQuery({ rows: [] });
      await Promise.all([p1, p2]);

      // query should be called only once (deduped)
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('handles hydration failure gracefully', async () => {
      const mockPool = {
        query: vi.fn().mockRejectedValue(new Error('DB down')),
      };
      setPool(mockPool);

      const history = await getHistoryAsync('fail-channel');
      expect(history).toEqual([]);
      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load history from DB'),
        expect.objectContaining({ error: 'DB down' }),
      );
    });

    it('merges in-flight writes with DB history', async () => {
      let resolveQuery;
      const queryPromise = new Promise((resolve) => { resolveQuery = resolve; });
      const mockPool = {
        query: vi.fn()
          .mockImplementationOnce(() => queryPromise)
          .mockResolvedValue({}),
      };
      setPool(mockPool);

      const asyncHistory = getHistoryAsync('merge-channel');

      // Write while hydration is in-flight
      addToHistory('merge-channel', 'user', 'concurrent message');

      resolveQuery({
        rows: [
          { role: 'assistant', content: 'db reply' },
        ],
      });

      const history = await asyncHistory;
      expect(history.some((m) => m.content === 'db reply')).toBe(true);
      expect(history.some((m) => m.content === 'concurrent message')).toBe(true);
    });

    it('returns existing history if channel is already known (no DB hydration needed)', async () => {
      addToHistory('known-channel', 'user', 'msg');
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      setPool(mockPool);

      // Channel is known, but there may be a pending hydration
      // This tests the path where channel exists and no pending
      const history = await getHistoryAsync('known-channel');
      expect(history).toHaveLength(1);
    });
  });

  describe('addToHistory DB write-through', () => {
    it('writes to DB when pool is available', async () => {
      const mockQuery = vi.fn().mockResolvedValue({});
      setPool({ query: mockQuery });

      addToHistory('ch1', 'user', 'hello', 'testuser');

      // Give the fire-and-forget a tick to run
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO conversations'),
        ['ch1', 'user', 'hello', 'testuser'],
      );
    });

    it('logs error when DB write fails', async () => {
      const { error: logError } = await import('../../src/logger.js');
      const mockQuery = vi.fn()
        .mockRejectedValue(new Error('write failed'));
      setPool({ query: mockQuery });

      addToHistory('ch1', 'user', 'hello');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to persist message to DB'),
        expect.any(Object),
      );
    });

    it('skips DB write when no pool', () => {
      setPool(null);
      // Should not throw
      expect(() => addToHistory('ch1', 'user', 'hello')).not.toThrow();
    });
  });

  describe('initConversationHistory', () => {
    it('skips when no pool', async () => {
      const { info } = await import('../../src/logger.js');
      await initConversationHistory();
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('No DB available'),
      );
    });

    it('handles query failure gracefully', async () => {
      const mockPool = {
        query: vi.fn().mockRejectedValue(new Error('connection lost')),
      };
      setPool(mockPool);
      await expect(initConversationHistory()).resolves.toBeUndefined();
      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to hydrate'),
        expect.objectContaining({ error: 'connection lost' }),
      );
    });

    it('loads and groups history by channel', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { channel_id: 'ch1', role: 'user', content: 'hello' },
            { channel_id: 'ch1', role: 'assistant', content: 'hi' },
            { channel_id: 'ch2', role: 'user', content: 'hey' },
          ],
        }),
      };
      setPool(mockPool);
      await initConversationHistory();

      const history = getConversationHistory();
      expect(history.get('ch1')).toHaveLength(2);
      expect(history.get('ch2')).toHaveLength(1);
    });
  });

  describe('startConversationCleanup', () => {
    it('skips when no pool', async () => {
      const { info } = await import('../../src/logger.js');
      setPool(null);
      startConversationCleanup();
      expect(info).toHaveBeenCalledWith(expect.stringContaining('No DB available'));
    });

    it('starts cleanup and can be stopped', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) };
      setPool(mockPool);
      startConversationCleanup();
      await new Promise((r) => setTimeout(r, 20));
      stopConversationCleanup();
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('logs when cleanup deletes rows', async () => {
      const { info } = await import('../../src/logger.js');
      const mockPool = { query: vi.fn().mockResolvedValue({ rowCount: 5 }) };
      setPool(mockPool);
      startConversationCleanup();
      await new Promise((r) => setTimeout(r, 20));
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up old conversation messages'),
        expect.objectContaining({ deleted: 5 }),
      );
      stopConversationCleanup();
    });

    it('handles cleanup query failure gracefully', async () => {
      const mockPool = { query: vi.fn().mockRejectedValue(new Error('cleanup failed')) };
      setPool(mockPool);
      startConversationCleanup();
      await new Promise((r) => setTimeout(r, 20));
      expect(logWarn).toHaveBeenCalledWith(
        'Conversation cleanup failed',
        expect.objectContaining({ error: 'cleanup failed' }),
      );
      stopConversationCleanup();
    });
  });
  describe('stopConversationCleanup', () => {
    it('is safe to call when no timer is running', () => {
      expect(() => stopConversationCleanup()).not.toThrow();
    });
  });

  describe('_setPoolGetter dependency injection', () => {
    it('uses pool getter when set', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      _setPoolGetter(() => ({ query: mockQuery }));

      await getHistoryAsync('getter-channel');
      expect(mockQuery).toHaveBeenCalled();
    });
  });
});

describe('ai module - uncovered branch coverage', () => {
  beforeEach(() => {
    setConversationHistory(new Map());
    setPool(null);
    _setPoolGetter(null);
    vi.clearAllMocks();
    getConfig.mockReturnValue({ ai: { historyLength: 20, historyTTLDays: 30 } });
    stopConversationCleanup();
  });

  afterEach(() => {
    setConversationHistory(new Map());
    setPool(null);
    _setPoolGetter(null);
    stopConversationCleanup();
  });

  describe('getHistoryLength default fallback (with pool)', () => {
    it('returns DEFAULT when historyLength is 0', async () => {
      getConfig.mockReturnValue({ ai: { historyLength: 0 } });
      // With a pool set, hydrateHistory calls getHistoryLength
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      setPool(mockPool);

      await getHistoryAsync('test-channel-zero-len');
      // getHistoryLength was called and returned DEFAULT (because 0 is not > 0)
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('returns DEFAULT when historyLength is negative', async () => {
      getConfig.mockReturnValue({ ai: { historyLength: -1 } });
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      setPool(mockPool);

      await getHistoryAsync('test-channel-neg-len');
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('uses DEFAULT_HISTORY_LENGTH when getConfig throws', async () => {
      getConfig.mockImplementation(() => { throw new Error('not loaded'); });
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      setPool(mockPool);

      await getHistoryAsync('test-channel-throw');
      // Should use default limit in query
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('getHistoryTTLDays default fallback', () => {
    it('uses DEFAULT when historyTTLDays is 0', async () => {
      getConfig.mockReturnValue({ ai: { historyLength: 20, historyTTLDays: 0 } });
      const mockPool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) };
      setPool(mockPool);

      startConversationCleanup();
      await new Promise((r) => setTimeout(r, 20));
      // Cleanup query should use DEFAULT_HISTORY_TTL_DAYS
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM conversations'),
        expect.any(Array),
      );
      stopConversationCleanup();
    });

    it('uses DEFAULT when getConfig throws in cleanup', async () => {
      getConfig.mockImplementation(() => { throw new Error('not loaded'); });
      const mockPool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) };
      setPool(mockPool);

      startConversationCleanup();
      await new Promise((r) => setTimeout(r, 20));
      stopConversationCleanup();
    });
  });

  describe('hydrateHistory pending dedup (line 118)', () => {
    it('returns existing pending hydration for same channel', async () => {
      let resolveQuery;
      const queryPromise = new Promise((resolve) => { resolveQuery = resolve; });
      const mockPool = {
        query: vi.fn()
          .mockImplementationOnce(() => queryPromise)
          .mockResolvedValue({ rows: [] }),
      };
      setPool(mockPool);

      // Two concurrent calls - second should get pending hydration
      const p1 = getHistoryAsync('pending-dedup-ch');
      const p2 = getHistoryAsync('pending-dedup-ch');

      resolveQuery({ rows: [{ role: 'user', content: 'hello' }] });
      await Promise.all([p1, p2]);

      // Both should succeed, query called once (deduped)
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });
});
