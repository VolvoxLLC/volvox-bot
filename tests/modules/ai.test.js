import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import {
  addToHistory,
  generateResponse,
  getConversationHistory,
  getHistory,
  OPENCLAW_TOKEN,
  OPENCLAW_URL,
  setConversationHistory,
} from '../../src/modules/ai.js';

describe('ai module', () => {
  beforeEach(() => {
    // Reset conversation history before each test
    setConversationHistory(new Map());
  });

  afterEach(() => {
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

  describe('getHistory', () => {
    it('should create empty history for new channel', () => {
      const history = getHistory('new-channel');
      expect(history).toEqual([]);
    });

    it('should return existing history for known channel', () => {
      addToHistory('ch1', 'user', 'hello');
      const history = getHistory('ch1');
      expect(history.length).toBe(1);
      expect(history[0]).toEqual({ role: 'user', content: 'hello' });
    });
  });

  describe('addToHistory', () => {
    it('should add messages to channel history', () => {
      addToHistory('ch1', 'user', 'hello');
      addToHistory('ch1', 'assistant', 'hi there');
      const history = getHistory('ch1');
      expect(history.length).toBe(2);
    });

    it('should trim history beyond MAX_HISTORY (20)', () => {
      for (let i = 0; i < 25; i++) {
        addToHistory('ch1', 'user', `message ${i}`);
      }
      const history = getHistory('ch1');
      expect(history.length).toBe(20);
      expect(history[0].content).toBe('message 5');
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

      const config = { ai: { model: 'test-model', maxTokens: 512, systemPrompt: 'You are a bot' } };
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
      // Verify fetch was called with default model
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

      const history = getHistory('ch1');
      expect(history.length).toBe(2);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toContain('user1: Hello');
      expect(history[1].role).toBe('assistant');
      expect(history[1].content).toBe('Reply');
    });

    it('should include Authorization header when token is set', async () => {
      vi.resetModules();
      process.env.OPENCLAW_API_KEY = 'test-key-123';

      try {
        vi.mock('../../src/logger.js', () => ({
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
        }));

        const { generateResponse: genResponse, setConversationHistory: setHistory } = await import(
          '../../src/modules/ai.js'
        );
        setHistory(new Map());

        const mockResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'OK' } }],
          }),
        };
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

        await genResponse('ch1', 'Hi', 'user', { ai: {} });

        const fetchCall = globalThis.fetch.mock.calls[0];
        expect(fetchCall[1].headers.Authorization).toBe('Bearer test-key-123');
      } finally {
        delete process.env.OPENCLAW_API_KEY;
      }
    });
  });
});
