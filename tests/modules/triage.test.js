import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must be before imports) ──────────────────────────────────────────
vi.mock('@anthropic-ai/claude-agent-sdk', () => {
  class AbortError extends Error {}
  return { query: vi.fn(), AbortError };
});
vi.mock('../../src/modules/spam.js', () => ({
  isSpam: vi.fn().mockReturnValue(false),
}));
vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import { AbortError, query } from '@anthropic-ai/claude-agent-sdk';
import { info, warn } from '../../src/logger.js';
import { isSpam } from '../../src/modules/spam.js';
import {
  accumulateMessage,
  evaluateNow,
  startTriage,
  stopTriage,
} from '../../src/modules/triage.js';
import { safeSend } from '../../src/utils/safeSend.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a mock SDK generator that yields a unified result.
 * @param {Object} resultObj - The unified result object (classification + responses)
 * @param {boolean} isError - Whether to simulate an SDK error
 */
function createUnifiedGenerator(resultObj, isError = false) {
  const resultText = JSON.stringify(resultObj);
  return (async function* () {
    yield {
      type: 'result',
      subtype: isError ? 'error_during_execution' : 'success',
      result: resultText,
      is_error: isError,
      errors: isError ? [{ message: resultText }] : [],
      structured_output: isError ? undefined : resultObj,
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
      model: 'claude-sonnet-4-5',
      budget: 0.5,
      timeout: 30000,
      moderationResponse: true,
      defaultInterval: 5000,
      ...(overrides.triage || {}),
    },
    ...(overrides.rest || {}),
  };
}

function makeMessage(channelId, content, extras = {}) {
  return {
    id: extras.id || 'msg-default',
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
    it('should add message to the channel buffer', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'test',
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hi!' }],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'hello'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(query).toHaveBeenCalled();
    });

    it('should skip when triage is disabled', async () => {
      const disabledConfig = makeConfig({ triage: { enabled: false } });
      accumulateMessage(makeMessage('ch1', 'hello'), disabledConfig);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(query).not.toHaveBeenCalled();
    });

    it('should skip excluded channels', async () => {
      const excConfig = makeConfig({ triage: { excludeChannels: ['ch1'] } });
      accumulateMessage(makeMessage('ch1', 'hello'), excConfig);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(query).not.toHaveBeenCalled();
    });

    it('should skip channels not in allow list when allow list is non-empty', async () => {
      const restrictedConfig = makeConfig({ triage: { channels: ['allowed-ch'] } });
      accumulateMessage(makeMessage('not-allowed-ch', 'hello'), restrictedConfig);
      await evaluateNow('not-allowed-ch', config, client, healthMonitor);

      expect(query).not.toHaveBeenCalled();
    });

    it('should allow any channel when allow list is empty', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'test',
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hi!' }],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('any-channel', 'hello'), config);
      await evaluateNow('any-channel', config, client, healthMonitor);

      expect(query).toHaveBeenCalled();
    });

    it('should skip empty messages', async () => {
      accumulateMessage(makeMessage('ch1', ''), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(query).not.toHaveBeenCalled();
    });

    it('should skip whitespace-only messages', async () => {
      accumulateMessage(makeMessage('ch1', '   '), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(query).not.toHaveBeenCalled();
    });

    it('should respect maxBufferSize cap', async () => {
      const smallConfig = makeConfig({ triage: { maxBufferSize: 3 } });
      for (let i = 0; i < 5; i++) {
        accumulateMessage(makeMessage('ch1', `msg ${i}`), smallConfig);
      }

      const result = {
        classification: 'respond',
        reasoning: 'test',
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hi!' }],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      await evaluateNow('ch1', smallConfig, client, healthMonitor);

      // The prompt passed to query should contain only messages 2, 3, 4 (oldest dropped)
      expect(query).toHaveBeenCalled();
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.prompt).toContain('msg 2');
      expect(callArgs.prompt).toContain('msg 4');
      expect(callArgs.prompt).not.toContain('msg 0');
    });
  });

  // ── checkTriggerWords (tested via accumulateMessage) ────────────────────

  describe('checkTriggerWords', () => {
    it('should force evaluation when trigger words match', () => {
      const twConfig = makeConfig({ triage: { triggerWords: ['help'] } });
      const result = {
        classification: 'respond',
        reasoning: 'test',
        responses: [
          { targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Helped!' },
        ],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'I need help please'), twConfig);
      // evaluateNow is called synchronously (fire-and-forget) on trigger
    });

    it('should trigger on moderation keywords', () => {
      const modConfig = makeConfig({ triage: { moderationKeywords: ['badword'] } });
      const result = {
        classification: 'moderate',
        reasoning: 'bad content',
        responses: [
          { targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Rule #1' },
        ],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'this is badword content'), modConfig);
    });

    it('should trigger when spam pattern matches', () => {
      isSpam.mockReturnValueOnce(true);
      const result = {
        classification: 'moderate',
        reasoning: 'spam',
        responses: [],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'free crypto claim'), config);
    });
  });

  // ── evaluateNow ─────────────────────────────────────────────────────────

  describe('evaluateNow', () => {
    it('should evaluate and send responses via unified SDK call', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'simple question',
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hello!' }],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'hi there'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(query).toHaveBeenCalledTimes(1);
      expect(safeSend).toHaveBeenCalledWith(expect.anything(), {
        content: 'Hello!',
        reply: { messageReference: 'msg-default' },
      });
    });

    it('should not evaluate when buffer is empty', async () => {
      await evaluateNow('empty-ch', config, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();
    });

    it('should set pendingReeval when concurrent evaluation requested', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'test',
        responses: [
          { targetMessageId: 'msg-default', targetUser: 'testuser', response: 'response' },
        ],
      };
      const result2 = {
        classification: 'respond',
        reasoning: 'second eval',
        responses: [
          { targetMessageId: 'msg-2', targetUser: 'testuser', response: 'second response' },
        ],
      };

      let resolveQuery;
      const slowGenerator = (async function* () {
        await new Promise((resolve) => {
          resolveQuery = resolve;
        });
        yield {
          type: 'result',
          subtype: 'success',
          result: JSON.stringify(result),
          is_error: false,
          errors: [],
          structured_output: result,
          total_cost_usd: 0.001,
          duration_ms: 100,
        };
      })();
      query.mockReturnValueOnce(slowGenerator);
      // The re-evaluation triggered by pendingReeval needs a generator too
      query.mockReturnValue(createUnifiedGenerator(result2));

      accumulateMessage(makeMessage('ch1', 'first'), config);

      // Start first evaluation
      const first = evaluateNow('ch1', config, client, healthMonitor);

      // Accumulate a new message during the slow evaluation — simulates
      // @mention arriving while already processing the buffer
      accumulateMessage(makeMessage('ch1', 'second message', { id: 'msg-2' }), config);

      // Second call should abort first and set pendingReeval
      const second = evaluateNow('ch1', config, client, healthMonitor);

      resolveQuery();
      await first;
      await second;

      // Allow the pendingReeval re-trigger to complete
      await vi.waitFor(() => {
        expect(query).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle AbortError gracefully', async () => {
      // Use real timers for this test — async generators don't play well with fake timers
      vi.useRealTimers();

      accumulateMessage(makeMessage('ch1', 'test'), config);

      // Simulate SDK throwing AbortError during evaluation
      const abortError = new AbortError('Aborted');
      // biome-ignore lint/correctness/useYield: test generator that throws before yielding
      const abortGen = (async function* () {
        throw abortError;
      })();
      query.mockReturnValue(abortGen);

      // Should not throw — AbortError is caught and logged
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(safeSend).not.toHaveBeenCalled();

      // Restore fake timers for afterEach
      vi.useFakeTimers();
    });
  });

  // ── Unified evaluation (tested via evaluateNow) ──────────────────────────

  describe('unified evaluation', () => {
    it('should use structured_output object directly when present', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'thoughtful question',
        responses: [
          { targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Deep answer' },
        ],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'explain quantum computing'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledWith(expect.anything(), {
        content: 'Deep answer',
        reply: { messageReference: 'msg-default' },
      });
    });

    it('should clear buffer silently on parse error', async () => {
      query.mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            result: 'not json at all',
            is_error: false,
            errors: [],
            total_cost_usd: 0.001,
            duration_ms: 100,
          };
        })(),
      );

      accumulateMessage(makeMessage('ch1', 'hi'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // On parse error, no response sent, buffer cleared
      expect(safeSend).not.toHaveBeenCalled();

      // Buffer cleared — second evaluateNow should find nothing
      query.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();
    });

    it('should clear buffer silently on SDK failure', async () => {
      query.mockReturnValue(createUnifiedGenerator({ error: 'SDK error' }, true));

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should send fallback when SDK throws an error', async () => {
      query.mockImplementation(() => {
        throw new Error('SDK connection failed');
      });

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Should try to send fallback error message
      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        "Sorry, I'm having trouble thinking right now. Try again in a moment!",
      );
    });
  });

  // ── Classification handling ──────────────────────────────────────────────

  describe('classification handling', () => {
    it('should do nothing for "ignore" classification', async () => {
      const result = {
        classification: 'ignore',
        reasoning: 'nothing relevant',
        responses: [],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'irrelevant chat'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should log warning and send nudge for "moderate" classification', async () => {
      const result = {
        classification: 'moderate',
        reasoning: 'spam detected',
        responses: [
          { targetMessageId: 'msg-default', targetUser: 'spammer', response: 'Rule #4: no spam' },
        ],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'spammy content'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(warn).toHaveBeenCalledWith(
        'Moderation flagged',
        expect.objectContaining({ channelId: 'ch1' }),
      );
      expect(safeSend).toHaveBeenCalledWith(expect.anything(), {
        content: 'Rule #4: no spam',
        reply: { messageReference: 'msg-default' },
      });
    });

    it('should suppress moderation response when moderationResponse is false', async () => {
      const modConfig = makeConfig({ triage: { moderationResponse: false } });
      const result = {
        classification: 'moderate',
        reasoning: 'spam detected',
        responses: [{ targetMessageId: 'msg-default', targetUser: 'spammer', response: 'Rule #4' }],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'spammy content'), modConfig);
      await evaluateNow('ch1', modConfig, client, healthMonitor);

      // Warning still logged
      expect(warn).toHaveBeenCalledWith(
        'Moderation flagged',
        expect.objectContaining({ channelId: 'ch1' }),
      );
      // But no message sent
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should send response for "respond" classification', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'simple question',
        responses: [
          { targetMessageId: 'msg-123', targetUser: 'testuser', response: 'Quick answer' },
        ],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'what time is it', { id: 'msg-123' }), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledWith(expect.anything(), {
        content: 'Quick answer',
        reply: { messageReference: 'msg-123' },
      });
    });

    it('should send response for "chime-in" classification', async () => {
      const result = {
        classification: 'chime-in',
        reasoning: 'could add value',
        responses: [
          { targetMessageId: 'msg-a1', targetUser: 'alice', response: 'Interesting point!' },
        ],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(
        makeMessage('ch1', 'anyone know about Rust?', {
          username: 'alice',
          userId: 'u-alice',
          id: 'msg-a1',
        }),
        config,
      );
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledWith(expect.anything(), {
        content: 'Interesting point!',
        reply: { messageReference: 'msg-a1' },
      });
    });

    it('should warn and clear buffer for unknown classification type', async () => {
      const result = {
        classification: 'unknown-type',
        reasoning: 'test',
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'hi' }],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Unknown classification with responses should still send them
      // (code treats non-ignore/non-moderate as respond/chime-in)
      expect(safeSend).toHaveBeenCalled();
    });
  });

  // ── Multi-user responses ──────────────────────────────────────────────

  describe('multi-user responses', () => {
    it('should send separate responses per user from unified result', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'multiple questions',
        responses: [
          { targetMessageId: 'msg-a1', targetUser: 'alice', response: 'Reply to Alice' },
          { targetMessageId: 'msg-b1', targetUser: 'bob', response: 'Reply to Bob' },
        ],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(
        makeMessage('ch1', 'hello from alice', {
          username: 'alice',
          userId: 'u-alice',
          id: 'msg-a1',
        }),
        config,
      );
      accumulateMessage(
        makeMessage('ch1', 'hello from bob', {
          username: 'bob',
          userId: 'u-bob',
          id: 'msg-b1',
        }),
        config,
      );

      await evaluateNow('ch1', config, client, healthMonitor);

      // Two safeSend calls — each with reply to that user's message
      expect(safeSend).toHaveBeenCalledTimes(2);
      expect(safeSend).toHaveBeenCalledWith(expect.anything(), {
        content: 'Reply to Alice',
        reply: { messageReference: 'msg-a1' },
      });
      expect(safeSend).toHaveBeenCalledWith(expect.anything(), {
        content: 'Reply to Bob',
        reply: { messageReference: 'msg-b1' },
      });
    });

    it('should skip empty responses in the array', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'test',
        responses: [
          { targetMessageId: 'msg-a1', targetUser: 'alice', response: '' },
          { targetMessageId: 'msg-b1', targetUser: 'bob', response: 'Reply to Bob' },
        ],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(
        makeMessage('ch1', 'hi', { username: 'alice', userId: 'u-alice', id: 'msg-a1' }),
        config,
      );
      accumulateMessage(
        makeMessage('ch1', 'hey', { username: 'bob', userId: 'u-bob', id: 'msg-b1' }),
        config,
      );

      await evaluateNow('ch1', config, client, healthMonitor);

      // Only Bob's response sent (Alice's was empty)
      expect(safeSend).toHaveBeenCalledTimes(1);
      expect(safeSend).toHaveBeenCalledWith(expect.anything(), {
        content: 'Reply to Bob',
        reply: { messageReference: 'msg-b1' },
      });
    });

    it('should warn when respond/chime-in has no responses', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'test',
        responses: [],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(warn).toHaveBeenCalledWith(
        'Triage generated no responses for classification',
        expect.objectContaining({ channelId: 'ch1', classification: 'respond' }),
      );
      expect(safeSend).not.toHaveBeenCalled();
    });
  });

  // ── Message ID validation ──────────────────────────────────────────────

  describe('message ID validation', () => {
    it('should fall back to user last message when targetMessageId is hallucinated', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'test',
        responses: [
          {
            targetMessageId: 'hallucinated-id',
            targetUser: 'alice',
            response: 'Reply to Alice',
          },
        ],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(
        makeMessage('ch1', 'hello', { username: 'alice', userId: 'u-alice', id: 'msg-real' }),
        config,
      );
      await evaluateNow('ch1', config, client, healthMonitor);

      // Falls back to alice's last real message
      expect(safeSend).toHaveBeenCalledWith(expect.anything(), {
        content: 'Reply to Alice',
        reply: { messageReference: 'msg-real' },
      });
    });

    it('should fall back to last buffer message when targetUser not found', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'test',
        responses: [
          {
            targetMessageId: 'hallucinated-id',
            targetUser: 'ghost-user',
            response: 'Reply',
          },
        ],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(
        makeMessage('ch1', 'hello', { username: 'alice', userId: 'u-alice', id: 'msg-alice' }),
        config,
      );
      await evaluateNow('ch1', config, client, healthMonitor);

      // Falls back to last message in buffer
      expect(safeSend).toHaveBeenCalledWith(expect.anything(), {
        content: 'Reply',
        reply: { messageReference: 'msg-alice' },
      });
    });
  });

  // ── Buffer lifecycle ──────────────────────────────────────────────────

  describe('buffer lifecycle', () => {
    it('should clear buffer after successful response', async () => {
      const result = {
        classification: 'respond',
        reasoning: 'test',
        responses: [
          { targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Response!' },
        ],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'hello'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Buffer should be cleared — second evaluateNow should find nothing
      query.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();
    });

    it('should clear buffer on ignore classification', async () => {
      const result = {
        classification: 'ignore',
        reasoning: 'not relevant',
        responses: [],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'random chat'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      query.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();
    });

    it('should clear buffer on moderate classification', async () => {
      const result = {
        classification: 'moderate',
        reasoning: 'flagged',
        responses: [],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'bad content'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      query.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();
    });
  });

  // ── getDynamicInterval (tested via timer scheduling) ──────────────────

  describe('getDynamicInterval', () => {
    it('should use 5000ms interval for 0-1 messages', () => {
      accumulateMessage(makeMessage('ch1', 'single'), config);
      vi.advanceTimersByTime(4999);
      expect(query).not.toHaveBeenCalled();
    });

    it('should use 2500ms interval for 2-4 messages', () => {
      const result = {
        classification: 'ignore',
        reasoning: 'test',
        responses: [],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'msg1'), config);
      accumulateMessage(makeMessage('ch1', 'msg2'), config);
      // After 2 messages, interval should be 2500ms
      vi.advanceTimersByTime(2500);
    });

    it('should use 1000ms interval for 5+ messages', () => {
      const result = {
        classification: 'ignore',
        reasoning: 'test',
        responses: [],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      for (let i = 0; i < 5; i++) {
        accumulateMessage(makeMessage('ch1', `msg${i}`), config);
      }
      // After 5 messages, interval should be 1000ms
      vi.advanceTimersByTime(1000);
    });

    it('should use config.triage.defaultInterval as base interval', () => {
      const customConfig = makeConfig({ triage: { defaultInterval: 20000 } });
      accumulateMessage(makeMessage('ch1', 'single'), customConfig);
      vi.advanceTimersByTime(19999);
      expect(query).not.toHaveBeenCalled();
    });
  });

  // ── startTriage / stopTriage ──────────────────────────────────────────

  describe('startTriage / stopTriage', () => {
    it('should initialize module references', () => {
      stopTriage();
      startTriage(client, config, healthMonitor);
    });

    it('should clear all state on stop', () => {
      accumulateMessage(makeMessage('ch1', 'msg1'), config);
      accumulateMessage(makeMessage('ch2', 'msg2'), config);
      stopTriage();
    });

    it('should log with unified config fields', () => {
      stopTriage();
      startTriage(client, config, healthMonitor);

      expect(info).toHaveBeenCalledWith(
        'Triage module started',
        expect.objectContaining({
          timeoutMs: 30000,
          model: 'claude-sonnet-4-5',
          budgetUsd: 0.5,
        }),
      );
    });
  });

  // ── LRU eviction ────────────────────────────────────────────────────

  describe('evictInactiveChannels', () => {
    it('should evict channels inactive for 30 minutes', async () => {
      accumulateMessage(makeMessage('ch-old', 'hello'), config);

      vi.advanceTimersByTime(31 * 60 * 1000);

      accumulateMessage(makeMessage('ch-new', 'hi'), config);

      query.mockClear();
      await evaluateNow('ch-old', config, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();
    });

    it('should evict oldest channels when over 100-channel cap', async () => {
      const longConfig = makeConfig({ triage: { defaultInterval: 999999 } });

      const ignoreResult = {
        classification: 'ignore',
        reasoning: 'test',
        responses: [],
      };
      query.mockReturnValue(createUnifiedGenerator(ignoreResult));

      for (let i = 0; i < 102; i++) {
        accumulateMessage(makeMessage(`ch-cap-${i}`, 'msg'), longConfig);
      }

      query.mockClear();
      await evaluateNow('ch-cap-0', longConfig, client, healthMonitor);
      expect(query).not.toHaveBeenCalled();

      const respondResult = {
        classification: 'respond',
        reasoning: 'test',
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'hi' }],
      };
      query.mockReturnValue(createUnifiedGenerator(respondResult));
      await evaluateNow('ch-cap-101', longConfig, client, healthMonitor);
      expect(query).toHaveBeenCalled();
    });
  });

  // ── Conversation text format ──────────────────────────────────────────

  describe('conversation text format', () => {
    it('should include message IDs in the prompt', async () => {
      const result = {
        classification: 'ignore',
        reasoning: 'test',
        responses: [],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(
        makeMessage('ch1', 'hello world', { username: 'alice', userId: 'u42', id: 'msg-42' }),
        config,
      );

      await evaluateNow('ch1', config, client, healthMonitor);

      const callArgs = query.mock.calls[0][0];
      expect(callArgs.prompt).toContain('[msg-42] alice: hello world');
    });
  });

  // ── Trigger word detection ──────────────────────────────────────────

  describe('trigger word evaluation', () => {
    it('should call evaluateNow on trigger word detection', async () => {
      const twConfig = makeConfig({ triage: { triggerWords: ['urgent'] } });
      const result = {
        classification: 'respond',
        reasoning: 'trigger',
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'On it!' }],
      };
      query.mockReturnValue(createUnifiedGenerator(result));

      accumulateMessage(makeMessage('ch1', 'this is urgent'), twConfig);

      await vi.waitFor(() => {
        expect(query).toHaveBeenCalled();
      });
    });

    it('should schedule a timer for non-trigger messages', () => {
      accumulateMessage(makeMessage('ch1', 'normal message'), config);
      expect(query).not.toHaveBeenCalled();

      const result = {
        classification: 'ignore',
        reasoning: 'test',
        responses: [],
      };
      query.mockReturnValue(createUnifiedGenerator(result));
      vi.advanceTimersByTime(5000);
    });
  });

  // ── SDK edge cases ──────────────────────────────────────────────────

  describe('SDK edge cases', () => {
    it('should ignore non-result events from SDK generator', async () => {
      const resultObj = {
        classification: 'respond',
        reasoning: 'test',
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hello!' }],
      };
      query.mockReturnValue(
        (async function* () {
          yield { type: 'progress', data: 'working...' };
          yield { type: 'thinking', content: 'hmm' };
          yield {
            type: 'result',
            subtype: 'success',
            result: JSON.stringify(resultObj),
            is_error: false,
            errors: [],
            structured_output: resultObj,
            total_cost_usd: 0.001,
            duration_ms: 100,
          };
        })(),
      );

      accumulateMessage(makeMessage('ch1', 'hi'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalled();
    });

    it('should handle empty generator gracefully', async () => {
      query.mockReturnValue((async function* () {})());

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // No result → buffer cleared, no response sent
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should handle is_error budget result gracefully', async () => {
      query.mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            subtype: 'error_max_budget_usd',
            result: '',
            is_error: true,
            errors: ['Budget exceeded'],
            total_cost_usd: 0.05,
            duration_ms: 50,
          };
        })(),
      );

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should handle structured_output missing classification', async () => {
      query.mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            result: '',
            is_error: false,
            errors: [],
            structured_output: { reasoning: 'no classification here' },
            total_cost_usd: 0.001,
            duration_ms: 100,
          };
        })(),
      );

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(warn).toHaveBeenCalledWith(
        'Unified evaluation unparseable',
        expect.objectContaining({ channelId: 'ch1' }),
      );
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should handle empty result string with no structured_output', async () => {
      query.mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            result: '',
            is_error: false,
            errors: [],
            total_cost_usd: 0.001,
            duration_ms: 100,
          };
        })(),
      );

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).not.toHaveBeenCalled();
    });
  });

  describe('legacy nested config compatibility', () => {
    it('should resolve model/budget/timeout from old nested format', async () => {
      const legacyConfig = makeConfig({
        triage: {
          enabled: true,
          channels: [],
          excludeChannels: [],
          maxBufferSize: 30,
          triggerWords: [],
          moderationKeywords: [],
          moderationResponse: true,
          defaultInterval: 5000,
          // Old nested format — no flat model/budget/timeout keys
          models: { triage: 'claude-haiku-3', default: 'claude-sonnet-4-5' },
          budget: { triage: 0.01, response: 0.25 },
          timeouts: { triage: 15000, response: 20000 },
        },
      });

      const respondResult = {
        classification: 'respond',
        reasoning: 'test',
        responses: [{ targetMessageId: 'msg-1', targetUser: 'alice', response: 'Hi!' }],
      };

      query.mockReturnValue(createUnifiedGenerator(respondResult));
      startTriage(client, legacyConfig, healthMonitor);
      accumulateMessage(makeMessage('ch1', 'hello', { id: 'msg-1' }), legacyConfig);
      await evaluateNow('ch1', legacyConfig, client, healthMonitor);

      // Verify SDK was called with resolved numeric values, not objects
      const callArgs = query.mock.calls[0][0].options;
      expect(callArgs.model).toBe('claude-sonnet-4-5');
      expect(callArgs.maxBudgetUsd).toBe(0.25);
      expect(typeof callArgs.maxBudgetUsd).toBe('number');
    });

    it('should prefer flat config keys over legacy nested format', async () => {
      const mixedConfig = makeConfig({
        triage: {
          enabled: true,
          channels: [],
          excludeChannels: [],
          maxBufferSize: 30,
          triggerWords: [],
          moderationKeywords: [],
          moderationResponse: true,
          defaultInterval: 5000,
          // Flat keys (new format)
          model: 'claude-haiku-3-5',
          budget: 0.75,
          timeout: 15000,
          // Old nested format also present (should be ignored)
          models: { default: 'claude-sonnet-4-5' },
        },
      });

      const ignoreResult = {
        classification: 'ignore',
        reasoning: 'test',
        responses: [],
      };

      query.mockReturnValue(createUnifiedGenerator(ignoreResult));
      startTriage(client, mixedConfig, healthMonitor);
      accumulateMessage(makeMessage('ch1', 'hi', { id: 'msg-1' }), mixedConfig);
      await evaluateNow('ch1', mixedConfig, client, healthMonitor);

      const callArgs = query.mock.calls[0][0].options;
      expect(callArgs.model).toBe('claude-haiku-3-5');
      expect(callArgs.maxBudgetUsd).toBe(0.75);
    });
  });
});
