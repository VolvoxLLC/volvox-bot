import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock config module
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(() => ({
    ai: {
      historyLength: 20,
      historyTTLDays: 30,
    },
  })),
}));

import { info, error as logError, warn as logWarn } from '../../src/logger.js';
import {
  addToHistory,
  generateResponse,
  getConversationHistory,
  getHistoryAsync,
  initConversationHistory,
  setConversationHistory,
  setPool,
  startConversationCleanup,
  stopConversationCleanup,
  _setPoolGetter,
} from '../../src/modules/ai.js';
import { getConfig } from '../../src/modules/config.js';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

describe('ai module', () => {
  beforeEach(() => {
    setConversationHistory(new Map());
    setPool(null);
    _setPoolGetter(null);
    vi.clearAllMocks();
    // Reset config mock to defaults
    getConfig.mockReturnValue({ ai: { historyLength: 20, historyTTLDays: 30 } });
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
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT role, content FROM conversations'), [
        'ch-new',
        20,
      ]);
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
  });

  describe('initConversationHistory', () => {
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
      expect(ch1[0].content).toBe('msg1');
      expect(ch1[1].content).toBe('reply1');

      const ch2 = await getHistoryAsync('ch2');
      expect(ch2.length).toBe(1);
    });
  });

  describe('generateResponse', () => {
    it('should return AI response on success', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hello there!' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const config = { ai: { model: 'test-model' } };
      const reply = await generateResponse('ch1', 'Hi', 'user1', config);

      expect(reply).toBe('Hello there!');
      expect(globalThis.fetch).toHaveBeenCalled();
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
  });

  describe('cleanup scheduler', () => {
    it('should run cleanup query on start', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rowCount: 5 });
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      startConversationCleanup();

      await vi.waitFor(() => {
        expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM conversations'), [30]);
      });

      stopConversationCleanup();
    });
  });
});
