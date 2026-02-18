import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must be before imports) ──────────────────────────────────────────

const mockSend = vi.fn();
const mockClose = vi.fn();

vi.mock('../../src/modules/cli-process.js', () => {
  class CLIProcessError extends Error {
    constructor(message, reason, meta = {}) {
      super(message);
      this.name = 'CLIProcessError';
      this.reason = reason;
      Object.assign(this, meta);
    }
  }
  return {
    CLIProcess: vi.fn().mockImplementation(function MockCLIProcess() {
      this.send = mockSend;
      this.close = mockClose;
      this.alive = true;
    }),
    CLIProcessError,
  };
});
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(() => ({ ai: { historyLength: 20, historyTTLDays: 30 } })),
}));
vi.mock('../../src/modules/memory.js', () => ({
  buildMemoryContext: vi.fn(() => Promise.resolve('')),
  extractAndStoreMemories: vi.fn(() => Promise.resolve(false)),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
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
import { CLIProcess, CLIProcessError } from '../../src/modules/cli-process.js';
import { getConfig } from '../../src/modules/config.js';
import { buildMemoryContext, extractAndStoreMemories } from '../../src/modules/memory.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockSendResult(text, extra = {}) {
  mockSend.mockResolvedValue({
    result: text,
    is_error: false,
    total_cost_usd: 0.002,
    duration_ms: 150,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...extra,
  });
}

function makeConfig(overrides = {}) {
  return {
    ai: { systemPrompt: 'You are a bot.', enabled: true, ...(overrides.ai || {}) },
    triage: {
      classifyModel: 'claude-haiku-4-5',
      classifyBudget: 0.05,
      respondModel: 'claude-sonnet-4-5',
      respondBudget: 0.2,
      timeout: 30000,
      ...(overrides.triage || {}),
    },
  };
}

function makeHealthMonitor() {
  return {
    recordAIRequest: vi.fn(),
    setAPIStatus: vi.fn(),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ai module', () => {
  beforeEach(() => {
    setConversationHistory(new Map());
    setPool(null);
    _setPoolGetter(null);
    vi.clearAllMocks();
    getConfig.mockReturnValue({ ai: { historyLength: 20, historyTTLDays: 30 } });
  });

  // ── getHistoryAsync ───────────────────────────────────────────────────

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

      const asyncHistoryPromise = getHistoryAsync('race-channel');

      const historyRef = getConversationHistory().get('race-channel');
      expect(historyRef).toEqual([]);

      addToHistory('race-channel', 'user', 'concurrent message');

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
      expect(history[0].content).toBe('from db');
      expect(history[1].content).toBe('response');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT role, content FROM conversations'),
        ['ch-new', 20],
      );
    });
  });

  // ── addToHistory ──────────────────────────────────────────────────────

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

  // ── initConversationHistory ───────────────────────────────────────────

  describe('initConversationHistory', () => {
    it('should load messages from DB for all channels', async () => {
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

  // ── generateResponse (CLI integration) ────────────────────────────────

  describe('generateResponse', () => {
    it('should create a CLIProcess and call send with the formatted prompt', async () => {
      mockSendResult('Hello there!');
      const config = makeConfig();

      await generateResponse('ch1', 'Hi', 'user1', config);

      expect(CLIProcess).toHaveBeenCalledWith(
        'ai-chat',
        expect.objectContaining({
          model: 'claude-sonnet-4-5',
          systemPrompt: 'You are a bot.',
          allowedTools: 'WebSearch',
          maxBudgetUsd: 0.2,
          thinkingTokens: 4096,
        }),
        expect.objectContaining({
          streaming: false,
          timeout: 30000,
        }),
      );

      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('user1: Hi'));
    });

    it('should use model override when provided', async () => {
      mockSendResult('Haiku response');
      const config = makeConfig();

      await generateResponse('ch1', 'Hi', 'user1', config, null, null, {
        model: 'claude-haiku-4-5',
      });

      expect(CLIProcess).toHaveBeenCalledWith(
        'ai-chat',
        expect.objectContaining({
          model: 'claude-haiku-4-5',
        }),
        expect.anything(),
      );
    });

    it('should use maxThinkingTokens override when provided', async () => {
      mockSendResult('Thinking response');
      const config = makeConfig();

      await generateResponse('ch1', 'Hi', 'user1', config, null, null, {
        maxThinkingTokens: 8192,
      });

      expect(CLIProcess).toHaveBeenCalledWith(
        'ai-chat',
        expect.objectContaining({
          thinkingTokens: 8192,
        }),
        expect.anything(),
      );
    });

    it('should extract response from CLIProcess result', async () => {
      mockSendResult('Hello there!');
      const config = makeConfig();

      const reply = await generateResponse('ch1', 'Hi', 'user1', config);
      expect(reply).toBe('Hello there!');
    });

    it('should log cost information on success', async () => {
      mockSendResult('OK', { total_cost_usd: 0.005, duration_ms: 200 });
      const config = makeConfig();

      await generateResponse('ch1', 'Hi', 'user1', config);

      expect(info).toHaveBeenCalledWith(
        'AI response',
        expect.objectContaining({
          total_cost_usd: 0.005,
          duration_ms: 200,
        }),
      );
    });

    it('should return fallback message on CLIProcessError with timeout reason', async () => {
      mockSend.mockRejectedValue(new CLIProcessError('timed out', 'timeout'));
      const config = makeConfig();

      const reply = await generateResponse('ch1', 'Hi', 'user1', config);
      expect(reply).toBe("Sorry, I'm having trouble thinking right now. Try again in a moment!");
    });

    it('should return fallback message when CLIProcess throws', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));
      const config = makeConfig();

      const reply = await generateResponse('ch1', 'Hi', 'user1', config);
      expect(reply).toBe("Sorry, I'm having trouble thinking right now. Try again in a moment!");
    });

    it('should call recordAIRequest on success', async () => {
      mockSendResult('OK');
      const config = makeConfig();
      const hm = makeHealthMonitor();

      await generateResponse('ch1', 'Hi', 'user1', config, hm);

      expect(hm.recordAIRequest).toHaveBeenCalled();
      expect(hm.setAPIStatus).toHaveBeenCalledWith('ok');
    });

    it('should call setAPIStatus error on CLIProcess error', async () => {
      mockSend.mockRejectedValue(new Error('Failed'));
      const config = makeConfig();
      const hm = makeHealthMonitor();

      await generateResponse('ch1', 'Hi', 'user1', config, hm);

      expect(hm.setAPIStatus).toHaveBeenCalledWith('error');
    });

    it('should call buildMemoryContext with 5s timeout when userId provided', async () => {
      buildMemoryContext.mockResolvedValue('\n\nMemory: likes Rust');
      mockSendResult('I know you like Rust!');
      const config = makeConfig();

      await generateResponse('ch1', 'What do you know?', 'testuser', config, null, 'user-123');

      expect(buildMemoryContext).toHaveBeenCalledWith('user-123', 'testuser', 'What do you know?');

      // System prompt should include memory context
      expect(CLIProcess).toHaveBeenCalledWith(
        'ai-chat',
        expect.objectContaining({
          systemPrompt: expect.stringContaining('Memory: likes Rust'),
        }),
        expect.anything(),
      );
    });

    it('should not call buildMemoryContext when userId is null', async () => {
      mockSendResult('OK');
      const config = makeConfig();

      await generateResponse('ch1', 'Hi', 'user', config, null, null);

      expect(buildMemoryContext).not.toHaveBeenCalled();
    });

    it('should fire extractAndStoreMemories after response when userId provided', async () => {
      extractAndStoreMemories.mockResolvedValue(true);
      mockSendResult('Nice!');
      const config = makeConfig();

      await generateResponse('ch1', "I'm learning Rust", 'testuser', config, null, 'user-123');

      await vi.waitFor(() => {
        expect(extractAndStoreMemories).toHaveBeenCalledWith(
          'user-123',
          'testuser',
          "I'm learning Rust",
          'Nice!',
        );
      });
    });

    it('should not call extractAndStoreMemories when userId is not provided', async () => {
      mockSendResult('OK');
      const config = makeConfig();

      await generateResponse('ch1', 'Hi', 'user', config);

      expect(extractAndStoreMemories).not.toHaveBeenCalled();
    });

    it('should continue when buildMemoryContext fails', async () => {
      buildMemoryContext.mockRejectedValue(new Error('mem0 down'));
      mockSendResult('Still working!');
      const config = makeConfig();

      const reply = await generateResponse('ch1', 'Hi', 'user', config, null, 'user-123');
      expect(reply).toBe('Still working!');
    });

    it('should timeout memory context lookup after 5 seconds', async () => {
      vi.useFakeTimers();
      buildMemoryContext.mockImplementation(() => new Promise(() => {}));
      mockSendResult('Working without memory!');
      const config = makeConfig();

      const replyPromise = generateResponse('ch1', 'Hi', 'user', config, null, 'user-123');
      await vi.advanceTimersByTimeAsync(5000);
      const reply = await replyPromise;

      expect(reply).toBe('Working without memory!');
      // System prompt should not contain memory context
      expect(CLIProcess).toHaveBeenCalledWith(
        'ai-chat',
        expect.objectContaining({
          systemPrompt: 'You are a bot.',
        }),
        expect.anything(),
      );

      vi.useRealTimers();
    });

    it('should update conversation history after successful response', async () => {
      mockSendResult('Hello!');
      const config = makeConfig();

      await generateResponse('ch1', 'Hi', 'testuser', config);

      const history = await getHistoryAsync('ch1');
      expect(history.length).toBe(2);
      expect(history[0]).toEqual({ role: 'user', content: 'testuser: Hi' });
      expect(history[1]).toEqual({ role: 'assistant', content: 'Hello!' });
    });

    it('should return fallback text when result.result is empty', async () => {
      mockSend.mockResolvedValue({
        result: '',
        is_error: false,
        total_cost_usd: 0.001,
        duration_ms: 50,
        usage: { input_tokens: 10, output_tokens: 0 },
      });
      const config = makeConfig();

      const reply = await generateResponse('ch1', 'Hi', 'user', config);
      expect(reply).toBe('I got nothing. Try again?');
    });

    it('should include conversation history in prompt', async () => {
      addToHistory('ch1', 'user', 'alice: previous question');
      addToHistory('ch1', 'assistant', 'previous answer');
      mockSendResult('Follow-up answer!');
      const config = makeConfig();

      await generateResponse('ch1', 'follow-up', 'alice', config);

      const sentPrompt = mockSend.mock.calls[0][0];
      expect(sentPrompt).toContain('alice: previous question');
      expect(sentPrompt).toContain('Assistant: previous answer');
      expect(sentPrompt).toContain('alice: follow-up');
    });
  });

  // ── cleanup scheduler ─────────────────────────────────────────────────

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
