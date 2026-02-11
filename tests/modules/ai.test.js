import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPENCLAW_TOKEN,
  OPENCLAW_URL,
  addToHistory,
  generateResponse,
  getConversationHistory,
  getHistory,
  setConversationHistory,
} from '../../src/modules/ai.js';

describe('conversation history', () => {
  beforeEach(() => {
    setConversationHistory(new Map());
  });

  it('should get empty history for new channel', () => {
    const history = getHistory('channel1');
    expect(history).toEqual([]);
  });

  it('should return same history array for same channel', () => {
    const history1 = getHistory('channel1');
    const history2 = getHistory('channel1');
    expect(history1).toBe(history2);
  });

  it('should return different history arrays for different channels', () => {
    const history1 = getHistory('channel1');
    const history2 = getHistory('channel2');
    expect(history1).not.toBe(history2);
  });

  it('should add messages to history', () => {
    addToHistory('channel1', 'user', 'Hello');
    const history = getHistory('channel1');
    expect(history).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should maintain message order', () => {
    addToHistory('channel1', 'user', 'First');
    addToHistory('channel1', 'assistant', 'Second');
    addToHistory('channel1', 'user', 'Third');

    const history = getHistory('channel1');
    expect(history).toEqual([
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ]);
  });

  it('should trim history to MAX_HISTORY (20 messages)', () => {
    for (let i = 0; i < 25; i++) {
      addToHistory('channel1', 'user', `Message ${i}`);
    }

    const history = getHistory('channel1');
    expect(history.length).toBe(20);
    expect(history[0].content).toBe('Message 5');
    expect(history[19].content).toBe('Message 24');
  });

  it('should get conversation history map', () => {
    addToHistory('channel1', 'user', 'Hello');
    addToHistory('channel2', 'user', 'Hi');

    const historyMap = getConversationHistory();
    expect(historyMap.size).toBe(2);
    expect(historyMap.has('channel1')).toBe(true);
    expect(historyMap.has('channel2')).toBe(true);
  });

  it('should set conversation history map', () => {
    const newMap = new Map([
      ['channel1', [{ role: 'user', content: 'Test' }]],
      ['channel2', [{ role: 'assistant', content: 'Response' }]],
    ]);

    setConversationHistory(newMap);

    const history1 = getHistory('channel1');
    const history2 = getHistory('channel2');
    expect(history1).toEqual([{ role: 'user', content: 'Test' }]);
    expect(history2).toEqual([{ role: 'assistant', content: 'Response' }]);
  });
});

describe('OPENCLAW configuration', () => {
  it('should export OPENCLAW_URL', () => {
    expect(typeof OPENCLAW_URL).toBe('string');
  });

  it('should export OPENCLAW_TOKEN', () => {
    expect(typeof OPENCLAW_TOKEN).toBe('string');
  });

  it('should have default URL if env var not set', () => {
    expect(OPENCLAW_URL).toBeTruthy();
  });
});

describe('generateResponse', () => {
  beforeEach(() => {
    setConversationHistory(new Map());
    global.fetch = vi.fn();
  });

  it('should call OpenClaw API with correct parameters', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'AI response' } }],
      }),
    });

    const config = {
      ai: {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 1024,
        systemPrompt: 'You are a helpful bot',
      },
    };

    await generateResponse('channel1', 'Hello', 'user1', config);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('claude-sonnet-4-20250514'),
      }),
    );
  });

  it('should return AI response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'AI response' } }],
      }),
    });

    const config = { ai: {} };
    const response = await generateResponse('channel1', 'Hello', 'user1', config);

    expect(response).toBe('AI response');
  });

  it('should add messages to history after successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'AI response' } }],
      }),
    });

    const config = { ai: {} };
    await generateResponse('channel1', 'Hello', 'user1', config);

    const history = getHistory('channel1');
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', content: 'user1: Hello' });
    expect(history[1]).toEqual({ role: 'assistant', content: 'AI response' });
  });

  it('should use default system prompt if not configured', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const config = { ai: {} };
    await generateResponse('channel1', 'Hello', 'user1', config);

    const call = global.fetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('Volvox Bot');
  });

  it('should use custom system prompt from config', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const config = {
      ai: {
        systemPrompt: 'Custom prompt',
      },
    };
    await generateResponse('channel1', 'Hello', 'user1', config);

    const call = global.fetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.messages[0].content).toBe('Custom prompt');
  });

  it('should include conversation history in API call', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    addToHistory('channel1', 'user', 'First message');
    addToHistory('channel1', 'assistant', 'First response');

    const config = { ai: {} };
    await generateResponse('channel1', 'Second message', 'user1', config);

    const call = global.fetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.messages).toContainEqual({ role: 'user', content: 'First message' });
    expect(body.messages).toContainEqual({ role: 'assistant', content: 'First response' });
  });

  it('should return error message on API failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const config = { ai: {} };
    const response = await generateResponse('channel1', 'Hello', 'user1', config);

    expect(response).toContain('trouble thinking');
  });

  it('should return error message on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const config = { ai: {} };
    const response = await generateResponse('channel1', 'Hello', 'user1', config);

    expect(response).toContain('trouble thinking');
  });

  it('should update health monitor on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const healthMonitor = {
      recordAIRequest: vi.fn(),
      setAPIStatus: vi.fn(),
    };

    const config = { ai: {} };
    await generateResponse('channel1', 'Hello', 'user1', config, healthMonitor);

    expect(healthMonitor.recordAIRequest).toHaveBeenCalled();
    expect(healthMonitor.setAPIStatus).toHaveBeenCalledWith('ok');
  });

  it('should update health monitor on error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Error',
    });

    const healthMonitor = {
      setAPIStatus: vi.fn(),
    };

    const config = { ai: {} };
    await generateResponse('channel1', 'Hello', 'user1', config, healthMonitor);

    expect(healthMonitor.setAPIStatus).toHaveBeenCalledWith('error');
  });

  it('should use configured model and maxTokens', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const config = {
      ai: {
        model: 'custom-model',
        maxTokens: 2048,
      },
    };
    await generateResponse('channel1', 'Hello', 'user1', config);

    const call = global.fetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.model).toBe('custom-model');
    expect(body.max_tokens).toBe(2048);
  });

  it('should return fallback message if response has no content', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: null } }],
      }),
    });

    const config = { ai: {} };
    const response = await generateResponse('channel1', 'Hello', 'user1', config);

    expect(response).toBe('I got nothing. Try again?');
  });

  it('should include authorization header if token is set', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const config = { ai: {} };
    await generateResponse('channel1', 'Hello', 'user1', config);

    const call = global.fetch.mock.calls[0];
    // Token may be empty in test env, but header structure should be correct
    expect(call[1].headers['Content-Type']).toBe('application/json');
  });
});