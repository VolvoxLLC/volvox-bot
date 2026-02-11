import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock config module
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(() => ({
    ai: {
      historyLength: 20,
      historyTTLDays: 30,
    },
  })),
}));

import { info, error as logError, warn } from '../../src/logger.js';
import {
  _setPoolGetter,
  addToHistory,
  generateResponse,
  getConversationHistory,
  getHistoryAsync,
  initConversationHistory,
  OPENCLAW_TOKEN,
  OPENCLAW_URL,
  setConversationHistory,
  setPool,
  startConversationCleanup,
  stopConversationCleanup,
} from '../../src/modules/ai.js';
import { getConfig } from '../../src/modules/config.js';

describe('ai module', () => {
  beforeEach(() => {
    // Reset conversation history before each test
    setConversationHistory(new Map());
    setPool(null);
    _setPoolGetter(null);
    vi.clearAllMocks();
    // Reset config mock to defaults
    getConfig.mockReturnValue({ ai: { historyLength: 20, historyTTLDays: 30 } });
  });

  afterEach(() => {
    stopConversationCleanup();
    vi.restoreAllMocks();
  });

  describe('getConversationHistory / setConversationHistory', () => {
    it('should get and set conversation history', () => {
      const history = new Map([['channel1', [{ role: 'user', content: 'hi' }]]]);
      setConversationHistory(history);
      expect(getConversationHistory()).toBe(history);
    });
  });

  describe('OPENCLAW_URL and OPENCLAW_TOKEN', () => {
    it('should export URL and token constants', () => {
      expect(typeof OPENCLAW_URL).toBe('string');
      expect(typeof OPENCLAW_TOKEN).toBe('string');
    });
  });

  describe('getHistoryAsync', () => {
    it('should create empty history for new channel', async () => {
      const history = await getHistoryAsync('new-channel');
      expect(history).toEqual([]);
    });

    it('should return existing history for known channel', async () => {
      addToHistory('ch1', 'user', 'hello');
      const history = await getHistoryAsync('ch1');
      expect(history.length).toBe(1);
      expect(history[0]).toEqual({ role: 'user', content: 'hello' });
    });

    it('should hydrate DB history in-place when concurrent messages are added', async () => {
      let resolveHydration;
      const hydrationPromise = new Promise((resolve) => {
        resolveHydration = resolve;
      });

      const mockQuery = vi
        .fn()
        .mockImplementationOnce(() => hydrationPromise)
        .mockResolvedValue({});
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      // Start hydration by calling getHistoryAsync (but don't await yet)
      const asyncHistoryPromise = getHistoryAsync('race-channel');
      
      // We know it's pending, so we can check the in-memory state via getConversationHistory
      const historyRef = getConversationHistory().get('race-channel');
      expect(historyRef).toEqual([]);

      // Add a message while DB hydration is still pending
      addToHistory('race-channel', 'user', 'concurrent message');

      // DB returns newest-first; hydrateHistory() reverses into chronological order
      resolveHydration({
        rows: [
          { role: 'assistant', content: 'db reply' },
          { role: 'user', content: 'db message' },
        ],
      });

      await hydrationPromise;
      await asyncHistoryPromise;

      await vi.waitFor(() => {
        expect(historyRef).toEqual([
          { role: 'user', content: 'db message' },
          { role: 'assistant', content: 'db reply' },
          { role: 'user', content: 'concurrent message' },
        ]);
        expect(getConversationHistory().get('race-channel')).toBe(historyRef);
      });
    });
  });

  describe('addToHistory', () => {
    it('should add messages to channel history', async () => {
      addToHistory('ch1', 'user', 'hello');
      addToHistory('ch1', 'assistant', 'hi there');
      const history = await getHistoryAsync('ch1');
      expect(history.length).toBe(2);
    });

    it('should trim history beyond configured historyLength (20)', async () => {
      for (let i = 0; i < 25; i++) {
        addToHistory('ch1', 'user', `message ${i}`);
      }
      const history = await getHistoryAsync('ch1');
      expect(history.length).toBe(20);
      expect(history[0].content).toBe('message 5');
    });

    it('should respect custom historyLength from config', async () => {
      getConfig.mockReturnValue({ ai: { historyLength: 5, historyTTLDays: 30 } });

      for (let i = 0; i < 10; i++) {
        addToHistory('ch1', 'user', `message ${i}`);
      }
      const history = await getHistoryAsync('ch1');
      expect(history.length).toBe(5);
      expect(history[0].content).toBe('message 5');
    });

    it('should write to DB when pool is available', () => {
      const mockQuery = vi.fn().mockResolvedValue({});
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      addToHistory('ch1', 'user', 'hello', 'testuser');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO conversations'), [
        'ch1',
        'user',
        'hello',
        'testuser',
      ]);
    });

    it('should not crash when DB write fails', async () => {
      const mockQuery = vi.fn().mockRejectedValue(new Error('DB error'));
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      // Should not throw
      addToHistory('ch1', 'user', 'hello');
      expect(mockQuery).toHaveBeenCalled();

      await vi.waitFor(() => {
        expect(logError).toHaveBeenCalledWith(
          'Failed to persist message to DB',
          expect.objectContaining({
            channelId: 'ch1',
            role: 'user',
            username: null,
            error: 'DB error',
          }),
        );
      });
    });

    it('should work without DB (graceful fallback)', async () => {
      setPool(null);
      addToHistory('ch1', 'user', 'hello');
      const history = await getHistoryAsync('ch1');
      expect(history.length).toBe(1);
    });

    it('should pass null username when not provided', () => {
      const mockQuery = vi.fn().mockResolvedValue({});
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      addToHistory('ch1', 'user', 'hello');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO conversations'), [
        'ch1',
        'user',
        'hello',
        null,
      ]);
    });
  });

  describe('getHistoryAsync', () => {
    it('should return cached history if available', async () => {
      addToHistory('ch1', 'user', 'cached message');
      const history = await getHistoryAsync('ch1');
      expect(history.length).toBe(1);
      expect(history[0].content).toBe('cached message');
    });

    it('should load from DB on cache miss', async () => {
      // DB returns newest-first (ORDER BY created_at DESC)
      const mockQuery = vi.fn().mockResolvedValue({
        rows: [
          { role: 'assistant', content: 'response' },
          { role: 'user', content: 'from db' },
        ],
      });
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      const history = await getHistoryAsync('ch-new');
      expect(history.length).toBe(2);
      // After reversing, oldest comes first
      expect(history[0].content).toBe('from db');
      expect(history[1].content).toBe('response');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT role, content FROM conversations'),
        ['ch-new', 20],
      );
    });

    it('should dedupe concurrent hydration calls for the same channel', async () => {
      let resolveHydration;
      const mockQuery = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveHydration = resolve;
          }),
      );
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      const p1 = getHistoryAsync('ch-race');
      const p2 = getHistoryAsync('ch-race');

      expect(mockQuery).toHaveBeenCalledTimes(1);

      resolveHydration({
        rows: [{ role: 'user', content: 'hydrated once' }],
      });

      const [h1, h2] = await Promise.all([p1, p2]);
      expect(h1).toBe(h2);
      expect(h1).toEqual([{ role: 'user', content: 'hydrated once' }]);
    });

    it('should return empty array when DB has no data', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      const history = await getHistoryAsync('ch-empty');
      expect(history).toEqual([]);
    });

    it('should handle DB errors gracefully', async () => {
      const mockQuery = vi.fn().mockRejectedValue(new Error('connection failed'));
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      const history = await getHistoryAsync('ch-error');
      expect(history).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load history from DB'),
        expect.any(Object),
      );
    });

    it('should work without DB pool', async () => {
      setPool(null);
      const history = await getHistoryAsync('ch-nodb');
      expect(history).toEqual([]);
    });
  });

  describe('initConversationHistory', () => {
    it('should skip if no DB pool', async () => {
      setPool(null);
      await initConversationHistory();
      expect(info).toHaveBeenCalledWith('No DB available, skipping conversation history hydration');
    });

    it('should load messages from DB for all channels', async () => {
      // Single ROW_NUMBER() query returns rows per-channel in chronological order
      const mockQuery = vi.fn().mockResolvedValueOnce({
        rows: [
          { channel_id: 'ch1', role: 'user', content: 'msg1' },
          { channel_id: 'ch1', role: 'assistant', content: 'reply1' },
          { channel_id: 'ch2', role: 'user', content: 'msg2' },
        ],
      });

      const mockPool = { query: mockQuery };
      setPool(mockPool);

      await initConversationHistory();

      const ch1 = await getHistoryAsync('ch1');
      expect(ch1.length).toBe(2);
      // Rows are already chronological per channel: msg1 then reply1
      expect(ch1[0].content).toBe('msg1');
      expect(ch1[1].content).toBe('reply1');

      const ch2 = await getHistoryAsync('ch2');
      expect(ch2.length).toBe(1);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ROW_NUMBER()'), [20, 30]);
      expect(info).toHaveBeenCalledWith(
        'Conversation history hydrated from DB',
        expect.objectContaining({ channels: 2, totalMessages: 3 }),
      );
    });

    it('should replace existing channel history when hydrating from DB', async () => {
      // Simulate startup state loaded from file persistence
      setConversationHistory(
        new Map([
          [
            'ch1',
            [
              { role: 'user', content: 'stale-file-msg' },
              { role: 'assistant', content: 'stale-file-reply' },
            ],
          ],
        ]),
      );

      const mockQuery = vi.fn().mockResolvedValueOnce({
        rows: [
          { channel_id: 'ch1', role: 'user', content: 'db-msg' },
          { channel_id: 'ch1', role: 'assistant', content: 'db-reply' },
        ],
      });
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      await initConversationHistory();

      expect(await getHistoryAsync('ch1')).toEqual([
        { role: 'user', content: 'db-msg' },
        { role: 'assistant', content: 'db-reply' },
      ]);
    });

    it('should handle DB errors gracefully during hydration', async () => {
      const mockQuery = vi.fn().mockRejectedValue(new Error('DB down'));
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      await initConversationHistory();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to hydrate'),
        expect.any(Object),
      );
    });

    it('should handle empty result set', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      await initConversationHistory();
      expect(info).toHaveBeenCalledWith(
        'Conversation history hydrated from DB',
        expect.objectContaining({ channels: 0, totalMessages: 0 }),
      );
    });
  });

  describe('startConversationCleanup / stopConversationCleanup', () => {
    it('should skip if no DB pool', () => {
      setPool(null);
      startConversationCleanup();
      expect(info).toHaveBeenCalledWith('No DB available, skipping conversation cleanup scheduler');
    });

    it('should start and stop cleanup timer', () => {
      const mockQuery = vi.fn().mockResolvedValue({ rowCount: 0 });
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      startConversationCleanup();
      expect(info).toHaveBeenCalledWith(
        'Conversation cleanup scheduler started',
        expect.any(Object),
      );

      stopConversationCleanup();
      expect(info).toHaveBeenCalledWith('Conversation cleanup scheduler stopped');
    });

    it('should unref cleanup timer so it does not keep the event loop alive', () => {
      const mockQuery = vi.fn().mockResolvedValue({ rowCount: 0 });
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      const unref = vi.fn();
      const fakeTimer = { unref };
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(fakeTimer);
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

      startConversationCleanup();

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(unref).toHaveBeenCalledTimes(1);

      stopConversationCleanup();
      expect(clearIntervalSpy).toHaveBeenCalledWith(fakeTimer);
    });

    it('should run cleanup query on start', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rowCount: 5 });
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      startConversationCleanup();

      // Wait for the async cleanup to complete
      await vi.waitFor(() => {
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM conversations'),
          [30],
        );
      });

      stopConversationCleanup();
    });

    it('should handle cleanup errors gracefully', async () => {
      const mockQuery = vi.fn().mockRejectedValue(new Error('cleanup failed'));
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      startConversationCleanup();

      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledWith('Conversation cleanup failed', expect.any(Object));
      });

      stopConversationCleanup();
    });

    it('should be safe to call stopConversationCleanup when not started', () => {
      // Should not throw
      stopConversationCleanup();
    });
  });

  describe('setPool / _setPoolGetter', () => {
    it('should allow setting pool directly', () => {
      const mockPool = { query: vi.fn() };
      setPool(mockPool);

      // addToHistory should use the pool
      const mockQuery = vi.fn().mockResolvedValue({});
      mockPool.query = mockQuery;
      addToHistory('ch1', 'user', 'test');
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should allow setting pool getter function', () => {
      const mockPool = { query: vi.fn().mockResolvedValue({}) };
      _setPoolGetter(() => mockPool);

      addToHistory('ch1', 'user', 'test');
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('generateResponse', () => {
    it('should return AI response on success', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hello!' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const config = {
        ai: { model: 'test-model', maxTokens: 512, systemPrompt: 'You are a bot' },
      };
      const result = await generateResponse('ch1', 'Hi', 'testuser', config);

      expect(result).toBe('Hello!');
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it('should use default system prompt if not configured', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Response' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const config = { ai: {} };
      const result = await generateResponse('ch1', 'Hi', 'testuser', config);

      expect(result).toBe('Response');
      const fetchCall = globalThis.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.model).toBe('claude-sonnet-4-20250514');
      expect(body.max_tokens).toBe(1024);
    });

    it('should handle empty choices gracefully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ choices: [] }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const config = { ai: {} };
      const result = await generateResponse('ch1', 'Hi', 'testuser', config);
      expect(result).toBe('I got nothing. Try again?');
    });

    it('should return fallback on API error', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const mockHealth = { setAPIStatus: vi.fn(), recordAIRequest: vi.fn() };
      const config = { ai: {} };
      const result = await generateResponse('ch1', 'Hi', 'testuser', config, mockHealth);

      expect(result).toContain('trouble thinking');
      expect(mockHealth.setAPIStatus).toHaveBeenCalledWith('error');
    });

    it('should return fallback on fetch exception', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network failure'));

      const config = { ai: {} };
      const result = await generateResponse('ch1', 'Hi', 'testuser', config);
      expect(result).toContain('trouble thinking');
    });

    it('should update health monitor on success', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'OK' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const mockHealth = { setAPIStatus: vi.fn(), recordAIRequest: vi.fn() };
      const config = { ai: {} };
      await generateResponse('ch1', 'Hi', 'testuser', config, mockHealth);

      expect(mockHealth.recordAIRequest).toHaveBeenCalled();
      expect(mockHealth.setAPIStatus).toHaveBeenCalledWith('ok');
    });

    it('should update conversation history on success', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Reply' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const config = { ai: {} };
      await generateResponse('ch1', 'Hello', 'user1', config);

      const history = await getHistoryAsync('ch1');
      expect(history.length).toBe(2);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toContain('user1: Hello');
      expect(history[1].role).toBe('assistant');
      expect(history[1].content).toBe('Reply');
    });

    it('should include correct headers in fetch request', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'OK' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const config = { ai: {} };
      await generateResponse('ch1', 'Hi', 'user', config);

      const fetchCall = globalThis.fetch.mock.calls[0];
      expect(fetchCall[1].headers['Content-Type']).toBe('application/json');
    });

    it('should pass username when adding to history', async () => {
      const mockQuery = vi.fn().mockResolvedValue({});
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'OK' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const config = { ai: {} };
      await generateResponse('ch1', 'Hi', 'testuser', config);

      // First call should have the username
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO conversations'), [
        'ch1',
        'user',
        'testuser: Hi',
        'testuser',
      ]);
    });
  });

  describe('graceful fallback (sub_6)', () => {
    it('should work entirely in-memory without any DB', async () => {
      setPool(null);

      addToHistory('ch1', 'user', 'hello');
      addToHistory('ch1', 'assistant', 'world');

      const history = await getHistoryAsync('ch1');
      expect(history.length).toBe(2);
      expect(history[0]).toEqual({ role: 'user', content: 'hello' });
      expect(history[1]).toEqual({ role: 'assistant', content: 'world' });
    });

    it('should handle config getConfig throwing', async () => {
      getConfig.mockImplementation(() => {
        throw new Error('config not loaded');
      });

      // Should use default (20)
      for (let i = 0; i < 25; i++) {
        addToHistory('ch1', 'user', `msg ${i}`);
      }
      const history = await getHistoryAsync('ch1');
      expect(history.length).toBe(20);
    });
  });
});
