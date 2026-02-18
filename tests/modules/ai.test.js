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

// Mock memory module
vi.mock('../../src/modules/memory.js', () => ({
  buildMemoryContext: vi.fn(() => Promise.resolve('')),
  extractAndStoreMemories: vi.fn(() => Promise.resolve(false)),
}));

import { info } from '../../src/logger.js';
import {
  _setPoolGetter,
  addToHistory,
  generateResponse,
  getConversationHistory,
  getHistoryAsync,
  initConversationHistory,
  setConversationHistory,
  setPool,
  startConversationCleanup,
  stopConversationCleanup,
} from '../../src/modules/ai.js';
import { getConfig } from '../../src/modules/config.js';
import { buildMemoryContext, extractAndStoreMemories } from '../../src/modules/memory.js';

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
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT role, content FROM conversations'),
        ['ch-new', 20],
      );
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

    it('should pass guildId to getHistoryLength when provided', async () => {
      getConfig.mockReturnValue({ ai: { historyLength: 3, historyTTLDays: 30 } });

      for (let i = 0; i < 5; i++) {
        addToHistory('ch-guild', 'user', `msg ${i}`, undefined, 'guild-123');
      }

      // getConfig should have been called with guildId
      expect(getConfig).toHaveBeenCalledWith('guild-123');

      // Verify history was actually trimmed to the configured length of 3
      const history = await getHistoryAsync('ch-guild');
      expect(history.length).toBe(3);
      expect(history[0].content).toBe('msg 2');
    });

    it('should write to DB when pool is available', () => {
      const mockQuery = vi.fn().mockResolvedValue({});
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      addToHistory('ch1', 'user', 'hello', 'testuser', 'guild1');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO conversations'), [
        'ch1',
        'user',
        'hello',
        'testuser',
        'guild1',
      ]);
    });

    it('should write null guild_id when not provided', () => {
      const mockQuery = vi.fn().mockResolvedValue({});
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      addToHistory('ch1', 'user', 'hello', 'testuser');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO conversations'), [
        'ch1',
        'user',
        'hello',
        'testuser',
        null,
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

      const reply = await generateResponse('ch1', 'Hi', 'user1');

      expect(reply).toBe('Hello there!');
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it('should log structured AI usage metadata for analytics', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          model: 'claude-sonnet-4-20250514',
          usage: {
            prompt_tokens: 200,
            completion_tokens: 100,
            total_tokens: 300,
          },
          choices: [{ message: { content: 'Usage logged' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await generateResponse('ch1', 'Hi', 'user1', null, null, 'guild-analytics');

      expect(info).toHaveBeenCalledWith(
        'AI usage',
        expect.objectContaining({
          guildId: 'guild-analytics',
          channelId: 'ch1',
          model: 'claude-sonnet-4-20250514',
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
        }),
      );
    });

    it('should include correct headers in fetch request', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'OK' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await generateResponse('ch1', 'Hi', 'user');

      const fetchCall = globalThis.fetch.mock.calls[0];
      expect(fetchCall[1].headers['Content-Type']).toBe('application/json');
    });

    it('should inject memory context into system prompt when userId is provided', async () => {
      buildMemoryContext.mockResolvedValue('\n\nWhat you know about testuser:\n- Loves Rust');

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'I know you love Rust!' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await generateResponse('ch1', 'What do you know about me?', 'testuser', null, 'user-123');

      expect(buildMemoryContext).toHaveBeenCalledWith(
        'user-123',
        'testuser',
        'What do you know about me?',
        null,
      );

      // Verify the system prompt includes memory context
      const fetchCall = globalThis.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.messages[0].content).toContain('What you know about testuser');
      expect(body.messages[0].content).toContain('Loves Rust');
    });

    it('should not inject memory context when userId is null', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'OK' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await generateResponse('ch1', 'Hi', 'user', null, null);

      expect(buildMemoryContext).not.toHaveBeenCalled();
    });

    it('should fire memory extraction after response when userId is provided', async () => {
      extractAndStoreMemories.mockResolvedValue(true);
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Nice!' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await generateResponse('ch1', "I'm learning Rust", 'testuser', null, 'user-123');

      // extractAndStoreMemories is fire-and-forget, wait for it
      await vi.waitFor(() => {
        expect(extractAndStoreMemories).toHaveBeenCalledWith(
          'user-123',
          'testuser',
          "I'm learning Rust",
          'Nice!',
          null,
        );
      });
    });

    it('should timeout memory context lookup after 5 seconds', async () => {
      vi.useFakeTimers();

      // buildMemoryContext never resolves
      buildMemoryContext.mockImplementation(() => new Promise(() => {}));

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Still working without memory!' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      // generateResponse reads AI settings from getConfig(guildId)
      getConfig.mockReturnValue({ ai: { systemPrompt: 'You are a bot.' } });
      const replyPromise = generateResponse('ch1', 'Hi', 'user', null, 'user-123');

      // Advance past the 5s timeout
      await vi.advanceTimersByTimeAsync(5000);

      const reply = await replyPromise;
      expect(reply).toBe('Still working without memory!');

      // System prompt should NOT contain memory context
      const fetchCall = globalThis.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.messages[0].content).toBe('You are a bot.');

      vi.useRealTimers();
    });

    it('should continue working when memory context lookup fails', async () => {
      buildMemoryContext.mockRejectedValue(new Error('mem0 down'));

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Still working!' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const reply = await generateResponse('ch1', 'Hi', 'user', null, 'user-123');

      expect(reply).toBe('Still working!');
    });

    it('should pass guildId to buildMemoryContext and extractAndStoreMemories', async () => {
      buildMemoryContext.mockResolvedValue('');
      extractAndStoreMemories.mockResolvedValue(true);
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Reply!' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await generateResponse('ch1', 'Hi', 'testuser', null, 'user-123', 'guild-456');

      expect(buildMemoryContext).toHaveBeenCalledWith('user-123', 'testuser', 'Hi', 'guild-456');

      await vi.waitFor(() => {
        expect(extractAndStoreMemories).toHaveBeenCalledWith(
          'user-123',
          'testuser',
          'Hi',
          'Reply!',
          'guild-456',
        );
      });
    });

    it('should call getConfig(guildId) for history-length lookup in generateResponse', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'OK' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await generateResponse('ch1', 'Hi', 'user', null, null, 'guild-789');

      // getConfig should have been called with guildId for history length lookup
      expect(getConfig).toHaveBeenCalledWith('guild-789');
    });

    it('should not call memory extraction when userId is not provided', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'OK' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await generateResponse('ch1', 'Hi', 'user');

      expect(extractAndStoreMemories).not.toHaveBeenCalled();
    });
  });

  describe('cleanup scheduler', () => {
    it('should run cleanup query on start', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rowCount: 5 });
      const mockPool = { query: mockQuery };
      setPool(mockPool);

      startConversationCleanup();

      await vi.waitFor(() => {
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM conversations'),
          [30],
        );
      });

      stopConversationCleanup();
    });
  });
});
