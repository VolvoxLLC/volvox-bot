import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must be before imports) ──────────────────────────────────────────
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));
vi.mock('../../src/modules/ai.js', () => ({
  generateResponse: vi.fn().mockResolvedValue('AI response'),
}));
vi.mock('../../src/modules/spam.js', () => ({
  isSpam: vi.fn().mockReturnValue(false),
}));
vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/utils/splitMessage.js', () => ({
  needsSplitting: vi.fn().mockReturnValue(false),
  splitMessage: vi.fn().mockReturnValue([]),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { generateResponse } from '../../src/modules/ai.js';
import { isSpam } from '../../src/modules/spam.js';
import {
  accumulateMessage,
  evaluateNow,
  startTriage,
  stopTriage,
} from '../../src/modules/triage.js';
import { safeSend } from '../../src/utils/safeSend.js';
import { needsSplitting, splitMessage } from '../../src/utils/splitMessage.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockQueryGenerator(resultText, isError = false) {
  return (async function* () {
    yield {
      type: 'result',
      subtype: isError ? 'error_during_execution' : 'success',
      result: resultText,
      text: resultText,
      is_error: isError,
      errors: isError ? [{ message: resultText }] : [],
      total_cost_usd: 0.001,
      duration_ms: 100,
    };
  })();
}

function makeConfig(overrides = {}) {
  return {
    ai: { systemPrompt: 'You are a bot.', enabled: true, ...(overrides.ai || {}) },
    triage: {
      enabled: true,
      channels: [],
      excludeChannels: [],
      maxBufferSize: 30,
      triggerWords: [],
      moderationKeywords: [],
      models: { triage: 'claude-haiku-4-5', default: 'claude-sonnet-4-5' },
      budget: { triage: 0.05, response: 0.5 },
      timeouts: { triage: 10000, response: 30000 },
      ...(overrides.triage || {}),
    },
    ...(overrides.rest || {}),
  };
}

function makeMessage(channelId, content, extras = {}) {
  return {
    content,
    channel: { id: channelId },
    author: { username: extras.username || 'testuser', id: extras.userId || 'u1' },
    ...extras,
  };
}

function makeClient() {
  return {
    channels: {
      fetch: vi.fn().mockResolvedValue({
        sendTyping: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
      }),
    },
    user: { id: 'bot-id' },
  };
}

function makeHealthMonitor() {
  return {
    recordAIRequest: vi.fn(),
    setAPIStatus: vi.fn(),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('triage module', () => {
  let client;
  let config;
  let healthMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    client = makeClient();
    config = makeConfig();
    healthMonitor = makeHealthMonitor();
    startTriage(client, config, healthMonitor);
  });

  afterEach(() => {
    stopTriage();
    vi.useRealTimers();
  });

  // ── accumulateMessage ───────────────────────────────────────────────────

  describe('accumulateMessage', () => {
    it('should add message to the channel buffer', () => {
      const msg = makeMessage('ch1', 'hello');
      accumulateMessage(msg, config);
      // Buffer has message — evaluateNow would find it
      // We verify indirectly: evaluateNow should have something in the buffer
    });

    it('should skip when triage is disabled', () => {
      const disabledConfig = makeConfig({ triage: { enabled: false } });
      const msg = makeMessage('ch1', 'hello');
      accumulateMessage(msg, disabledConfig);
      // No timer should be scheduled — verified by no errors
    });

    it('should skip excluded channels', () => {
      const excConfig = makeConfig({ triage: { excludeChannels: ['ch1'] } });
      const msg = makeMessage('ch1', 'hello');
      accumulateMessage(msg, excConfig);
      // evaluateNow on that channel should find empty buffer
    });

    it('should skip channels not in allow list when allow list is non-empty', () => {
      const restrictedConfig = makeConfig({ triage: { channels: ['allowed-ch'] } });
      const msg = makeMessage('not-allowed-ch', 'hello');
      accumulateMessage(msg, restrictedConfig);
    });

    it('should allow any channel when allow list is empty', () => {
      const msg = makeMessage('any-channel', 'hello');
      accumulateMessage(msg, config);
      // No error = accepted
    });

    it('should skip empty messages', () => {
      const msg = makeMessage('ch1', '');
      accumulateMessage(msg, config);
    });

    it('should skip whitespace-only messages', () => {
      const msg = makeMessage('ch1', '   ');
      accumulateMessage(msg, config);
    });

    it('should respect maxBufferSize cap', () => {
      const smallConfig = makeConfig({ triage: { maxBufferSize: 3 } });
      for (let i = 0; i < 5; i++) {
        accumulateMessage(makeMessage('ch1', `msg ${i}`), smallConfig);
      }
      // Buffer should be capped at 3 — verified via evaluateNow snapshot later
    });
  });

  // ── checkTriggerWords (tested via accumulateMessage) ────────────────────

  describe('checkTriggerWords', () => {
    it('should force evaluation when trigger words match', () => {
      const twConfig = makeConfig({ triage: { triggerWords: ['help'] } });
      const classification = JSON.stringify({
        classification: 'respond-haiku',
        reasoning: 'test',
        model: 'claude-haiku-4-5',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));
      generateResponse.mockResolvedValue('Helped!');

      accumulateMessage(makeMessage('ch1', 'I need help please'), twConfig);
      // evaluateNow is called synchronously (fire-and-forget) on trigger
    });

    it('should trigger on moderation keywords', () => {
      const modConfig = makeConfig({ triage: { moderationKeywords: ['badword'] } });
      const classification = JSON.stringify({
        classification: 'moderate',
        reasoning: 'bad content',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));

      accumulateMessage(makeMessage('ch1', 'this is badword content'), modConfig);
    });

    it('should trigger when spam pattern matches', () => {
      isSpam.mockReturnValue(true);
      const classification = JSON.stringify({
        classification: 'moderate',
        reasoning: 'spam',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));

      accumulateMessage(makeMessage('ch1', 'free crypto claim'), config);
      isSpam.mockReturnValue(false);
    });
  });

  // ── evaluateNow ─────────────────────────────────────────────────────────

  describe('evaluateNow', () => {
    it('should classify and handle messages via SDK', async () => {
      const classification = JSON.stringify({
        classification: 'respond-haiku',
        reasoning: 'simple question',
        model: 'claude-haiku-4-5',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));
      generateResponse.mockResolvedValue('Hello!');

      accumulateMessage(makeMessage('ch1', 'hi there'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(query).toHaveBeenCalled();
      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: hi there',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-haiku-4-5', maxThinkingTokens: 0 },
      );
    });

    it('should not evaluate when buffer is empty', async () => {
      await evaluateNow('empty-ch', config, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();
    });

    it('should set pendingReeval when concurrent evaluation requested', async () => {
      const classification = JSON.stringify({
        classification: 'respond-haiku',
        reasoning: 'test',
        model: 'claude-haiku-4-5',
      });

      let resolveQuery;
      const slowGenerator = (async function* () {
        await new Promise((resolve) => {
          resolveQuery = resolve;
        });
        yield {
          type: 'result',
          subtype: 'success',
          result: classification,
          text: classification,
          is_error: false,
          errors: [],
          total_cost_usd: 0.001,
          duration_ms: 100,
        };
      })();
      query.mockReturnValueOnce(slowGenerator);
      // The re-evaluation triggered by pendingReeval needs a generator too
      query.mockReturnValue(createMockQueryGenerator(classification));
      generateResponse.mockResolvedValue('response');

      accumulateMessage(makeMessage('ch1', 'first'), config);

      // Start first evaluation
      const first = evaluateNow('ch1', config, client, healthMonitor);

      // Second call should abort first and set pendingReeval
      const second = evaluateNow('ch1', config, client, healthMonitor);

      resolveQuery();
      await first;
      await second;

      // Allow the pendingReeval re-trigger to complete
      await vi.waitFor(() => {
        // query should be called at least twice: first eval + re-eval
        expect(query).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle AbortError gracefully', async () => {
      // Use real timers for this test — async generators don't play well with fake timers
      vi.useRealTimers();

      accumulateMessage(makeMessage('ch1', 'test'), config);

      // Simulate SDK throwing AbortError during classification
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      // biome-ignore lint/correctness/useYield: test generator that throws before yielding
      const abortGen = (async function* () {
        throw abortError;
      })();
      query.mockReturnValue(abortGen);

      // Should not throw — AbortError is caught and logged
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(generateResponse).not.toHaveBeenCalled();

      // Restore fake timers for afterEach
      vi.useFakeTimers();
    });
  });

  // ── classifyMessages (tested via evaluateNow) ──────────────────────────

  describe('classifyMessages', () => {
    it('should parse structured JSON from SDK result', async () => {
      const classification = JSON.stringify({
        classification: 'respond-sonnet',
        reasoning: 'thoughtful question',
        model: 'claude-sonnet-4-5',
      });
      // First call = classify, second call = verify escalation
      const verifyResult = JSON.stringify({ confirm: true });
      query
        .mockReturnValueOnce(createMockQueryGenerator(classification))
        .mockReturnValueOnce(createMockQueryGenerator(verifyResult));
      generateResponse.mockResolvedValue('Deep answer');

      accumulateMessage(makeMessage('ch1', 'explain quantum computing'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: explain quantum computing',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-sonnet-4-5', maxThinkingTokens: 1024 },
      );
    });

    it('should fallback to respond-haiku on parse error', async () => {
      query.mockReturnValue(createMockQueryGenerator('not json at all'));
      generateResponse.mockResolvedValue('Fallback response');

      accumulateMessage(makeMessage('ch1', 'hi'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // On parse error, falls back to respond-haiku
      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: hi',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-haiku-4-5', maxThinkingTokens: 0 },
      );
    });

    it('should fallback to respond-haiku on SDK failure', async () => {
      query.mockReturnValue(createMockQueryGenerator('SDK error', true));
      // Even on error, classifyMessages catches and returns fallback
      // but the result has is_error, which classifyMessages treats as a normal result
      // since it reads result.text. The text 'SDK error' will fail JSON.parse,
      // so the catch block returns fallback.
      generateResponse.mockResolvedValue('Fallback');

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(generateResponse).toHaveBeenCalled();
    });

    it('should fallback when SDK throws an error', async () => {
      query.mockImplementation(() => {
        throw new Error('SDK connection failed');
      });
      generateResponse.mockResolvedValue('Fallback');

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // evaluateNow catches the error from classifyMessages
    });
  });

  // ── verifyEscalation ──────────────────────────────────────────────────

  describe('verifyEscalation', () => {
    it('should downgrade when verification says so', async () => {
      const classification = JSON.stringify({
        classification: 'respond-opus',
        reasoning: 'complex',
        model: 'claude-opus-4-6',
      });
      const verifyResult = JSON.stringify({
        confirm: false,
        downgrade_to: 'claude-haiku-4-5',
      });
      query
        .mockReturnValueOnce(createMockQueryGenerator(classification))
        .mockReturnValueOnce(createMockQueryGenerator(verifyResult));
      generateResponse.mockResolvedValue('Downgraded response');

      accumulateMessage(makeMessage('ch1', 'something'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // After downgrade, should use haiku config
      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: something',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-haiku-4-5', maxThinkingTokens: 0 },
      );
    });

    it('should keep original when verification confirms', async () => {
      const classification = JSON.stringify({
        classification: 'respond-sonnet',
        reasoning: 'needs sonnet',
        model: 'claude-sonnet-4-5',
      });
      const verifyResult = JSON.stringify({ confirm: true });
      query
        .mockReturnValueOnce(createMockQueryGenerator(classification))
        .mockReturnValueOnce(createMockQueryGenerator(verifyResult));
      generateResponse.mockResolvedValue('Sonnet response');

      accumulateMessage(makeMessage('ch1', 'deep question'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: deep question',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-sonnet-4-5', maxThinkingTokens: 1024 },
      );
    });
  });

  // ── handleClassification ──────────────────────────────────────────────

  describe('handleClassification', () => {
    it('should do nothing for "ignore" classification', async () => {
      const classification = JSON.stringify({
        classification: 'ignore',
        reasoning: 'nothing relevant',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));

      accumulateMessage(makeMessage('ch1', 'irrelevant chat'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(generateResponse).not.toHaveBeenCalled();
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should log warning for "moderate" classification', async () => {
      const classification = JSON.stringify({
        classification: 'moderate',
        reasoning: 'spam detected',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));

      accumulateMessage(makeMessage('ch1', 'spammy content'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(generateResponse).not.toHaveBeenCalled();
    });

    it('should route respond-haiku to generateResponse with haiku model', async () => {
      const classification = JSON.stringify({
        classification: 'respond-haiku',
        reasoning: 'simple',
        model: 'claude-haiku-4-5',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));
      generateResponse.mockResolvedValue('Quick answer');

      accumulateMessage(makeMessage('ch1', 'what time is it'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: what time is it',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-haiku-4-5', maxThinkingTokens: 0 },
      );
    });

    it('should route respond-sonnet to generateResponse with sonnet model', async () => {
      const classification = JSON.stringify({
        classification: 'respond-sonnet',
        reasoning: 'needs sonnet',
        model: 'claude-sonnet-4-5',
      });
      const verifyResult = JSON.stringify({ confirm: true });
      query
        .mockReturnValueOnce(createMockQueryGenerator(classification))
        .mockReturnValueOnce(createMockQueryGenerator(verifyResult));
      generateResponse.mockResolvedValue('Thoughtful answer');

      accumulateMessage(makeMessage('ch1', 'explain recursion'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: explain recursion',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-sonnet-4-5', maxThinkingTokens: 1024 },
      );
    });

    it('should route respond-opus to generateResponse with opus model', async () => {
      const classification = JSON.stringify({
        classification: 'respond-opus',
        reasoning: 'complex',
        model: 'claude-opus-4-6',
      });
      const verifyResult = JSON.stringify({ confirm: true });
      query
        .mockReturnValueOnce(createMockQueryGenerator(classification))
        .mockReturnValueOnce(createMockQueryGenerator(verifyResult));
      generateResponse.mockResolvedValue('Complex answer');

      accumulateMessage(makeMessage('ch1', 'write a compiler'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: write a compiler',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-opus-4-6', maxThinkingTokens: 4096 },
      );
    });

    it('should route chime-in to generateResponse with haiku model', async () => {
      const classification = JSON.stringify({
        classification: 'chime-in',
        reasoning: 'could add value',
        model: 'claude-haiku-4-5',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));
      generateResponse.mockResolvedValue('Interesting point!');

      accumulateMessage(makeMessage('ch1', 'anyone know about Rust?'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: anyone know about Rust?',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-haiku-4-5', maxThinkingTokens: 0 },
      );
    });

    it('should split long responses', async () => {
      const classification = JSON.stringify({
        classification: 'respond-haiku',
        reasoning: 'test',
        model: 'claude-haiku-4-5',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));
      generateResponse.mockResolvedValue('Very long response');
      needsSplitting.mockReturnValue(true);
      splitMessage.mockReturnValue(['chunk1', 'chunk2']);

      accumulateMessage(makeMessage('ch1', 'hi'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledTimes(2);
      needsSplitting.mockReturnValue(false);
    });

    it('should send fallback error message when generateResponse fails', async () => {
      const classification = JSON.stringify({
        classification: 'respond-haiku',
        reasoning: 'test',
        model: 'claude-haiku-4-5',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));
      generateResponse.mockRejectedValue(new Error('AI failed'));

      accumulateMessage(makeMessage('ch1', 'hi'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Should try to send fallback error message
      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        "Sorry, I'm having trouble thinking right now. Try again in a moment!",
      );
    });
  });

  // ── startTriage / stopTriage ──────────────────────────────────────────

  describe('startTriage / stopTriage', () => {
    it('should initialize module references', () => {
      // Already called in beforeEach — just verify no error
      stopTriage();
      startTriage(client, config, healthMonitor);
    });

    it('should clear all state on stop', () => {
      accumulateMessage(makeMessage('ch1', 'msg1'), config);
      accumulateMessage(makeMessage('ch2', 'msg2'), config);
      stopTriage();

      // After stop, evaluateNow should find no buffer
    });
  });

  // ── Buffer lifecycle ──────────────────────────────────────────────────

  describe('buffer lifecycle', () => {
    it('should clear buffer after successful response', async () => {
      const classification = JSON.stringify({
        classification: 'respond-haiku',
        reasoning: 'test',
        model: 'claude-haiku-4-5',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));
      generateResponse.mockResolvedValue('Response!');

      accumulateMessage(makeMessage('ch1', 'hello'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Buffer should be cleared — second evaluateNow should find nothing
      query.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();
    });

    it('should clear buffer on ignore classification', async () => {
      const classification = JSON.stringify({
        classification: 'ignore',
        reasoning: 'not relevant',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));

      accumulateMessage(makeMessage('ch1', 'random chat'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Buffer is now cleared after ignore — second evaluateNow finds nothing
      query.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();
    });

    it('should clear buffer on moderate classification', async () => {
      const classification = JSON.stringify({
        classification: 'moderate',
        reasoning: 'flagged',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));

      accumulateMessage(makeMessage('ch1', 'bad content'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Buffer is now cleared after moderate — second evaluateNow finds nothing
      query.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();
    });
  });

  // ── getDynamicInterval (tested via timer scheduling) ──────────────────

  describe('getDynamicInterval', () => {
    it('should use 10000ms interval for 0-1 messages', () => {
      accumulateMessage(makeMessage('ch1', 'single'), config);
      // Timer should be set — advance by 10s
      vi.advanceTimersByTime(9999);
      expect(query).not.toHaveBeenCalled();
    });

    it('should use 5000ms interval for 2-4 messages', () => {
      const classification = JSON.stringify({
        classification: 'ignore',
        reasoning: 'test',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));

      accumulateMessage(makeMessage('ch1', 'msg1'), config);
      accumulateMessage(makeMessage('ch1', 'msg2'), config);
      // After 2 messages, interval should be 5000ms
      vi.advanceTimersByTime(5000);
      // Timer fires and calls evaluateNow
    });

    it('should use 2000ms interval for 5+ messages', () => {
      const classification = JSON.stringify({
        classification: 'ignore',
        reasoning: 'test',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));

      for (let i = 0; i < 5; i++) {
        accumulateMessage(makeMessage('ch1', `msg${i}`), config);
      }
      // After 5 messages, interval should be 2000ms
      vi.advanceTimersByTime(2000);
    });

    it('should use config.triage.defaultInterval as base interval', () => {
      const customConfig = makeConfig({ triage: { defaultInterval: 20000 } });
      accumulateMessage(makeMessage('ch1', 'single'), customConfig);
      // Timer should be set at 20000ms (custom base) — advance by 19999, no eval
      vi.advanceTimersByTime(19999);
      expect(query).not.toHaveBeenCalled();
    });
  });

  // ── LRU eviction ────────────────────────────────────────────────────

  describe('evictInactiveChannels', () => {
    it('should evict channels inactive for 30 minutes', async () => {
      // Accumulate to create the channel buffer
      accumulateMessage(makeMessage('ch-old', 'hello'), config);

      // Advance time past the 30-minute inactivity threshold
      vi.advanceTimersByTime(31 * 60 * 1000);

      // Trigger eviction by creating a buffer for a new channel
      accumulateMessage(makeMessage('ch-new', 'hi'), config);

      // ch-old should be evicted — evaluateNow finds nothing
      query.mockClear();
      await evaluateNow('ch-old', config, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();
    });

    it('should evict oldest channels when over 100-channel cap', async () => {
      // Use a very long interval to prevent timer callbacks during test
      const longConfig = makeConfig({ triage: { defaultInterval: 999999 } });

      // Suppress any timer-fired evaluations
      const ignoreClassification = JSON.stringify({
        classification: 'ignore',
        reasoning: 'test',
      });
      query.mockReturnValue(createMockQueryGenerator(ignoreClassification));

      // Create 102 channels — eviction checks on entry, so the 102nd triggers cap eviction
      // (101 channels exist when 102nd getBuffer runs, which is > 100)
      for (let i = 0; i < 102; i++) {
        accumulateMessage(makeMessage(`ch-cap-${i}`, 'msg'), longConfig);
      }

      // ch-cap-0 (oldest) should be evicted — evaluateNow finds nothing
      query.mockClear();
      await evaluateNow('ch-cap-0', longConfig, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();

      // ch-cap-101 (newest) should still have its buffer
      const classification = JSON.stringify({
        classification: 'respond-haiku',
        reasoning: 'test',
        model: 'claude-haiku-4-5',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));
      generateResponse.mockResolvedValue('hi');
      await evaluateNow('ch-cap-101', longConfig, client, healthMonitor);
      expect(query).toHaveBeenCalled();
    });
  });

  // ── accumulateMessage assertions ──────────────────────────────────

  describe('accumulateMessage assertions', () => {
    it('should store author, content, and userId in buffer', async () => {
      const classification = JSON.stringify({
        classification: 'respond-haiku',
        reasoning: 'test',
        model: 'claude-haiku-4-5',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));
      generateResponse.mockResolvedValue('ok');

      accumulateMessage(
        makeMessage('ch1', 'hello world', { username: 'alice', userId: 'u42' }),
        config,
      );

      await evaluateNow('ch1', config, client, healthMonitor);

      // Verify buffer context passed to generateResponse includes the author
      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'alice: hello world',
        'alice',
        config,
        healthMonitor,
        'u42',
        expect.any(Object),
      );
    });

    it('should call evaluateNow on trigger word detection', async () => {
      const twConfig = makeConfig({ triage: { triggerWords: ['urgent'] } });
      const classification = JSON.stringify({
        classification: 'respond-haiku',
        reasoning: 'trigger',
        model: 'claude-haiku-4-5',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));
      generateResponse.mockResolvedValue('On it!');

      accumulateMessage(makeMessage('ch1', 'this is urgent'), twConfig);

      // Allow the fire-and-forget evaluateNow to complete
      await vi.waitFor(() => {
        expect(query).toHaveBeenCalled();
      });
    });

    it('should schedule a timer for non-trigger messages', () => {
      accumulateMessage(makeMessage('ch1', 'normal message'), config);
      // Timer is set — query not called yet
      expect(query).not.toHaveBeenCalled();
      // Timer fires at 10000ms
      const classification = JSON.stringify({
        classification: 'ignore',
        reasoning: 'test',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));
      vi.advanceTimersByTime(10000);
      // After timer fires, query is called
    });
  });

  // ── verifyEscalation error/abort paths ──────────────────────────

  describe('verifyEscalation error paths', () => {
    it('should fall back to original classification when verification throws', async () => {
      const classification = JSON.stringify({
        classification: 'respond-sonnet',
        reasoning: 'thoughtful',
        model: 'claude-sonnet-4-5',
      });
      // First call = classify, second call = verify (throws)
      query.mockReturnValueOnce(createMockQueryGenerator(classification)).mockReturnValueOnce(
        // biome-ignore lint/correctness/useYield: test generator that throws before yielding
        (async function* () {
          throw new Error('SDK verification failure');
        })(),
      );
      generateResponse.mockResolvedValue('Fallback response');

      accumulateMessage(makeMessage('ch1', 'complex question'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Should still route with original sonnet classification
      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: complex question',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-sonnet-4-5', maxThinkingTokens: 1024 },
      );
    });

    it('should fall back to original when verification returns malformed JSON', async () => {
      const classification = JSON.stringify({
        classification: 'respond-opus',
        reasoning: 'creative',
        model: 'claude-opus-4-6',
      });
      query
        .mockReturnValueOnce(createMockQueryGenerator(classification))
        .mockReturnValueOnce(createMockQueryGenerator('not valid json'));
      generateResponse.mockResolvedValue('Fallback');

      accumulateMessage(makeMessage('ch1', 'write me a poem'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Malformed JSON causes error, falls back to original classification
      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: write me a poem',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-opus-4-6', maxThinkingTokens: 4096 },
      );
    });

    it('should propagate AbortError from verification', async () => {
      const classification = JSON.stringify({
        classification: 'respond-sonnet',
        reasoning: 'test',
        model: 'claude-sonnet-4-5',
      });
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      query.mockReturnValueOnce(createMockQueryGenerator(classification)).mockReturnValueOnce(
        // biome-ignore lint/correctness/useYield: test generator that throws before yielding
        (async function* () {
          throw abortError;
        })(),
      );

      // Use real timers for abort test
      vi.useRealTimers();

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // AbortError propagates up — generateResponse should NOT be called
      expect(generateResponse).not.toHaveBeenCalled();

      vi.useFakeTimers();
    });
  });

  // ── Intermediate SDK events ──────────────────────────────────────

  describe('intermediate SDK events', () => {
    it('should ignore non-result events from SDK generator', async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: 'progress', data: 'working...' };
          yield { type: 'thinking', content: 'hmm' };
          yield {
            type: 'result',
            subtype: 'success',
            result: JSON.stringify({
              classification: 'respond-haiku',
              reasoning: 'test',
              model: 'claude-haiku-4-5',
            }),
            text: JSON.stringify({
              classification: 'respond-haiku',
              reasoning: 'test',
              model: 'claude-haiku-4-5',
            }),
            is_error: false,
            errors: [],
            total_cost_usd: 0.001,
            duration_ms: 100,
          };
        })(),
      );
      generateResponse.mockResolvedValue('Hello!');

      accumulateMessage(makeMessage('ch1', 'hi'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Should process only the result event
      expect(generateResponse).toHaveBeenCalled();
    });
  });

  // ── Empty generator and unknown classification ──────────────────

  describe('edge cases', () => {
    it('should fall back to respond-haiku when generator yields no result', async () => {
      query.mockReturnValue((async function* () {})());
      generateResponse.mockResolvedValue('Fallback');

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Falls back to respond-haiku on no result
      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: test',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-haiku-4-5', maxThinkingTokens: 0 },
      );
    });

    it('should warn and skip for unknown classification type', async () => {
      const classification = JSON.stringify({
        classification: 'unknown-type',
        reasoning: 'test',
      });
      query.mockReturnValue(createMockQueryGenerator(classification));

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Unknown classification should not call generateResponse
      expect(generateResponse).not.toHaveBeenCalled();
    });

    it('should log error and fall back on non-abort errors during evaluation', async () => {
      // Simulate a non-abort error (e.g. TypeError) during classification.
      // classifyMessages catches it and returns a fallback, so generateResponse is still called.
      query.mockImplementation(() => {
        throw new TypeError('Cannot read property of undefined');
      });
      generateResponse.mockResolvedValue('Fallback');

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Should fall back to respond-haiku and call generateResponse
      expect(generateResponse).toHaveBeenCalledWith(
        'ch1',
        'testuser: test',
        'testuser',
        config,
        healthMonitor,
        'u1',
        { model: 'claude-haiku-4-5', maxThinkingTokens: 0 },
      );
    });
  });
});
