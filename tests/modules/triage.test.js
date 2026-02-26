import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must be before imports) ──────────────────────────────────────────

// Mock CLIProcess — triage.js creates instances and calls .send()
const mockClassifierSend = vi.fn();
const mockResponderSend = vi.fn();
const mockClassifierStart = vi.fn().mockResolvedValue(undefined);
const mockResponderStart = vi.fn().mockResolvedValue(undefined);
const mockClassifierClose = vi.fn();
const mockResponderClose = vi.fn();

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
    CLIProcess: vi.fn().mockImplementation(function MockCLIProcess(name) {
      if (name === 'classifier') {
        this.name = 'classifier';
        this.send = mockClassifierSend;
        this.start = mockClassifierStart;
        this.close = mockClassifierClose;
        this.alive = true;
      } else {
        this.name = 'responder';
        this.send = mockResponderSend;
        this.start = mockResponderStart;
        this.close = mockResponderClose;
        this.alive = true;
      }
    }),
    CLIProcessError,
  };
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
 * Create a mock SDK message for the classifier.
 * @param {Object} classifyObj - { classification, reasoning, targetMessageIds }
 */
function mockClassifyResult(classifyObj) {
  return {
    type: 'result',
    subtype: 'success',
    result: JSON.stringify(classifyObj),
    is_error: false,
    errors: [],
    structured_output: classifyObj,
    total_cost_usd: 0.0005,
    duration_ms: 50,
  };
}

/**
 * Create a mock SDK message for the responder.
 * @param {Object} respondObj - { responses: [...] }
 */
function mockRespondResult(respondObj) {
  return {
    type: 'result',
    subtype: 'success',
    result: JSON.stringify(respondObj),
    is_error: false,
    errors: [],
    structured_output: respondObj,
    total_cost_usd: 0.005,
    duration_ms: 200,
  };
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
      classifyModel: 'claude-haiku-4-5',
      classifyBudget: 0.05,
      respondModel: 'claude-sonnet-4-5',
      respondBudget: 0.2,
      tokenRecycleLimit: 20000,
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

/** Shared mock for message.react — reset in beforeEach */
let mockReact;

function makeClient() {
  mockReact = vi.fn().mockResolvedValue(undefined);
  return {
    channels: {
      fetch: vi.fn().mockResolvedValue({
        id: 'ch1',
        guildId: 'guild-1',
        sendTyping: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
        messages: {
          fetch: vi.fn().mockResolvedValue({ id: 'msg-default', react: mockReact }),
        },
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

/**
 * Build a matcher for safeSend calls that use plain content (no embed wrapping).
 * @param {string} text - Expected message content text
 * @param {string} [replyRef] - Expected reply messageReference
 */
function contentWith(text, replyRef) {
  const base = { content: text };
  if (replyRef) base.reply = { messageReference: replyRef };
  return expect.objectContaining(base);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('triage module', () => {
  let client;
  let config;
  let healthMonitor;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    client = makeClient();
    config = makeConfig();
    healthMonitor = makeHealthMonitor();
    await startTriage(client, config, healthMonitor);
  });

  afterEach(() => {
    stopTriage();
    vi.useRealTimers();
  });

  // ── accumulateMessage ───────────────────────────────────────────────────

  describe('accumulateMessage', () => {
    it('should add message to the channel buffer and classify on evaluate', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hi!' }],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hello'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockClassifierSend).toHaveBeenCalled();
      expect(mockResponderSend).toHaveBeenCalled();
    });

    it('should skip when triage is disabled', async () => {
      const disabledConfig = makeConfig({ triage: { enabled: false } });
      accumulateMessage(makeMessage('ch1', 'hello'), disabledConfig);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockClassifierSend).not.toHaveBeenCalled();
    });

    it('should skip excluded channels', async () => {
      const excConfig = makeConfig({ triage: { excludeChannels: ['ch1'] } });
      accumulateMessage(makeMessage('ch1', 'hello'), excConfig);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockClassifierSend).not.toHaveBeenCalled();
    });

    it('should skip channels not in allow list when allow list is non-empty', async () => {
      const restrictedConfig = makeConfig({ triage: { channels: ['allowed-ch'] } });
      accumulateMessage(makeMessage('not-allowed-ch', 'hello'), restrictedConfig);
      await evaluateNow('not-allowed-ch', config, client, healthMonitor);

      expect(mockClassifierSend).not.toHaveBeenCalled();
    });

    it('should allow any channel when allow list is empty', async () => {
      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('any-channel', 'hello'), config);
      await evaluateNow('any-channel', config, client, healthMonitor);

      expect(mockClassifierSend).toHaveBeenCalled();
    });

    it('should skip empty messages', async () => {
      accumulateMessage(makeMessage('ch1', ''), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockClassifierSend).not.toHaveBeenCalled();
    });

    it('should skip whitespace-only messages', async () => {
      accumulateMessage(makeMessage('ch1', '   '), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockClassifierSend).not.toHaveBeenCalled();
    });

    it('should respect maxBufferSize cap', async () => {
      const smallConfig = makeConfig({ triage: { maxBufferSize: 3 } });
      for (let i = 0; i < 5; i++) {
        accumulateMessage(makeMessage('ch1', `msg ${i}`), smallConfig);
      }

      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      await evaluateNow('ch1', smallConfig, client, healthMonitor);

      // The classifier prompt should contain only messages 2, 3, 4 (oldest dropped)
      const prompt = mockClassifierSend.mock.calls[0][0];
      expect(prompt).toContain('msg 2');
      expect(prompt).toContain('msg 4');
      expect(prompt).not.toContain('msg 0');
    });
  });

  // ── checkTriggerWords (tested via accumulateMessage) ────────────────────

  describe('checkTriggerWords', () => {
    it('should force evaluation when trigger words match', async () => {
      const twConfig = makeConfig({ triage: { triggerWords: ['help'] } });
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [
          { targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Helped!' },
        ],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'I need help please'), twConfig);

      await vi.waitFor(() => {
        expect(mockClassifierSend).toHaveBeenCalled();
      });
    });

    it('should trigger on moderation keywords', async () => {
      const modConfig = makeConfig({ triage: { moderationKeywords: ['badword'] } });
      const classResult = {
        classification: 'moderate',
        reasoning: 'bad content',
        targetMessageIds: ['msg-default'],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('ch1', 'this is badword content'), modConfig);

      await vi.waitFor(() => {
        expect(mockClassifierSend).toHaveBeenCalled();
      });
    });

    it('should trigger when spam pattern matches', async () => {
      isSpam.mockReturnValueOnce(true);
      const classResult = {
        classification: 'moderate',
        reasoning: 'spam',
        targetMessageIds: [],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('ch1', 'free crypto claim'), config);

      await vi.waitFor(() => {
        expect(mockClassifierSend).toHaveBeenCalled();
      });
    });
  });

  // ── evaluateNow ─────────────────────────────────────────────────────────

  describe('evaluateNow', () => {
    it('should classify then respond via two-step CLI flow', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'simple question',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hello!' }],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hi there'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockClassifierSend).toHaveBeenCalledTimes(1);
      expect(mockResponderSend).toHaveBeenCalledTimes(1);
      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        contentWith('Hello!', 'msg-default'),
      );
    });

    it('should skip responder on "ignore" classification', async () => {
      const classResult = {
        classification: 'ignore',
        reasoning: 'nothing relevant',
        targetMessageIds: [],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('ch1', 'irrelevant chat'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockClassifierSend).toHaveBeenCalledTimes(1);
      expect(mockResponderSend).not.toHaveBeenCalled();
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should not evaluate when buffer is empty', async () => {
      await evaluateNow('empty-ch', config, client, healthMonitor);
      expect(mockClassifierSend).not.toHaveBeenCalled();
    });

    it('should set pendingReeval when concurrent evaluation requested', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [
          { targetMessageId: 'msg-default', targetUser: 'testuser', response: 'response' },
        ],
      };
      const classResult2 = {
        classification: 'respond',
        reasoning: 'second eval',
        targetMessageIds: ['msg-2'],
      };
      const respondResult2 = {
        responses: [
          { targetMessageId: 'msg-2', targetUser: 'testuser', response: 'second response' },
        ],
      };

      let resolveFirst;
      mockClassifierSend.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      );
      // Re-eval uses fresh classifier call
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult2));
      mockResponderSend.mockResolvedValueOnce(mockRespondResult(respondResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult2));

      accumulateMessage(makeMessage('ch1', 'first'), config);

      const first = evaluateNow('ch1', config, client, healthMonitor);

      // Flush microtasks so fetchChannelContext completes and classifierProcess.send()
      // is called (which assigns the resolveFirst callback from mockImplementationOnce)
      await vi.advanceTimersByTimeAsync(0);

      accumulateMessage(makeMessage('ch1', 'second message', { id: 'msg-2' }), config);
      const second = evaluateNow('ch1', config, client, healthMonitor);

      resolveFirst(mockClassifyResult(classResult));
      await first;
      await second;

      await vi.waitFor(() => {
        expect(mockClassifierSend).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ── Classification handling ──────────────────────────────────────────────

  describe('classification handling', () => {
    it('should do nothing for "ignore" classification', async () => {
      const classResult = {
        classification: 'ignore',
        reasoning: 'nothing relevant',
        targetMessageIds: [],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('ch1', 'irrelevant chat'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should log warning and send nudge for "moderate" classification', async () => {
      const classResult = {
        classification: 'moderate',
        reasoning: 'spam detected',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [
          { targetMessageId: 'msg-default', targetUser: 'spammer', response: 'Rule #4: no spam' },
        ],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'spammy content'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(warn).toHaveBeenCalledWith(
        'Moderation flagged',
        expect.objectContaining({ channelId: 'ch1' }),
      );
      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        contentWith('Rule #4: no spam', 'msg-default'),
      );
    });

    it('should suppress moderation response when moderationResponse is false', async () => {
      const modConfig = makeConfig({ triage: { moderationResponse: false } });
      const classResult = {
        classification: 'moderate',
        reasoning: 'spam detected',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'spammer', response: 'Rule #4' }],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'spammy content'), modConfig);
      await evaluateNow('ch1', modConfig, client, healthMonitor);

      expect(warn).toHaveBeenCalledWith(
        'Moderation flagged',
        expect.objectContaining({ channelId: 'ch1' }),
      );
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should send response for "respond" classification', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'simple question',
        targetMessageIds: ['msg-123'],
      };
      const respondResult = {
        responses: [
          { targetMessageId: 'msg-123', targetUser: 'testuser', response: 'Quick answer' },
        ],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'what time is it', { id: 'msg-123' }), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        contentWith('Quick answer', 'msg-123'),
      );
    });

    it('should send response for "chime-in" classification', async () => {
      const classResult = {
        classification: 'chime-in',
        reasoning: 'could add value',
        targetMessageIds: ['msg-a1'],
      };
      const respondResult = {
        responses: [
          { targetMessageId: 'msg-a1', targetUser: 'alice', response: 'Interesting point!' },
        ],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(
        makeMessage('ch1', 'anyone know about Rust?', {
          username: 'alice',
          userId: 'u-alice',
          id: 'msg-a1',
        }),
        config,
      );
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        contentWith('Interesting point!', 'msg-a1'),
      );
    });

    it('should warn and clear buffer for unknown classification type', async () => {
      const classResult = {
        classification: 'unknown-type',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'hi' }],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Unknown classification with responses should still send them
      expect(safeSend).toHaveBeenCalled();
    });
  });

  // ── Multi-user responses ──────────────────────────────────────────────

  describe('multi-user responses', () => {
    it('should send separate responses per user from responder result', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'multiple questions',
        targetMessageIds: ['msg-a1', 'msg-b1'],
      };
      const respondResult = {
        responses: [
          { targetMessageId: 'msg-a1', targetUser: 'alice', response: 'Reply to Alice' },
          { targetMessageId: 'msg-b1', targetUser: 'bob', response: 'Reply to Bob' },
        ],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

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

      expect(safeSend).toHaveBeenCalledTimes(2);
      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        contentWith('Reply to Alice', 'msg-a1'),
      );
      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        contentWith('Reply to Bob', 'msg-b1'),
      );
    });

    it('should skip empty responses in the array', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-a1', 'msg-b1'],
      };
      const respondResult = {
        responses: [
          { targetMessageId: 'msg-a1', targetUser: 'alice', response: '' },
          { targetMessageId: 'msg-b1', targetUser: 'bob', response: 'Reply to Bob' },
        ],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(
        makeMessage('ch1', 'hi', { username: 'alice', userId: 'u-alice', id: 'msg-a1' }),
        config,
      );
      accumulateMessage(
        makeMessage('ch1', 'hey', { username: 'bob', userId: 'u-bob', id: 'msg-b1' }),
        config,
      );

      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledTimes(1);
      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        contentWith('Reply to Bob', 'msg-b1'),
      );
    });

    it('should warn when respond has no responses', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = { responses: [] };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(warn).toHaveBeenCalledWith(
        'Responder returned no responses',
        expect.objectContaining({ channelId: 'ch1' }),
      );
      expect(safeSend).not.toHaveBeenCalled();
    });
  });

  // ── Message ID validation ──────────────────────────────────────────────

  describe('message ID validation', () => {
    it('should fall back to user last message when targetMessageId is hallucinated', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['hallucinated-id'],
      };
      const respondResult = {
        responses: [
          {
            targetMessageId: 'hallucinated-id',
            targetUser: 'alice',
            response: 'Reply to Alice',
          },
        ],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(
        makeMessage('ch1', 'hello', { username: 'alice', userId: 'u-alice', id: 'msg-real' }),
        config,
      );
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        contentWith('Reply to Alice', 'msg-real'),
      );
    });

    it('should fall back to last buffer message when targetUser not found', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['hallucinated-id'],
      };
      const respondResult = {
        responses: [
          {
            targetMessageId: 'hallucinated-id',
            targetUser: 'ghost-user',
            response: 'Reply',
          },
        ],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(
        makeMessage('ch1', 'hello', { username: 'alice', userId: 'u-alice', id: 'msg-alice' }),
        config,
      );
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledWith(expect.anything(), contentWith('Reply', 'msg-alice'));
    });
  });

  // ── Buffer lifecycle ──────────────────────────────────────────────────

  describe('buffer lifecycle', () => {
    it('should clear buffer after successful response', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [
          { targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Response!' },
        ],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hello'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Buffer should be cleared — second evaluateNow should find nothing
      mockClassifierSend.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(mockClassifierSend).not.toHaveBeenCalled();
    });

    it('should clear buffer on ignore classification', async () => {
      const classResult = {
        classification: 'ignore',
        reasoning: 'not relevant',
        targetMessageIds: [],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('ch1', 'random chat'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      mockClassifierSend.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(mockClassifierSend).not.toHaveBeenCalled();
    });

    it('should clear buffer on moderate classification', async () => {
      const classResult = {
        classification: 'moderate',
        reasoning: 'flagged',
        targetMessageIds: [],
      };
      const respondResult = { responses: [] };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'bad content'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      mockClassifierSend.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(mockClassifierSend).not.toHaveBeenCalled();
    });
  });

  // ── getDynamicInterval (tested via timer scheduling) ──────────────────

  describe('getDynamicInterval', () => {
    it('should use 5000ms interval for 0-1 messages', () => {
      accumulateMessage(makeMessage('ch1', 'single'), config);
      vi.advanceTimersByTime(4999);
      expect(mockClassifierSend).not.toHaveBeenCalled();
    });

    it('should use 2500ms interval for 2-4 messages', async () => {
      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('ch1', 'msg1'), config);
      accumulateMessage(makeMessage('ch1', 'msg2'), config);

      // Should not fire before 2500ms
      vi.advanceTimersByTime(2499);
      expect(mockClassifierSend).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(mockClassifierSend).toHaveBeenCalled();
    });

    it('should use 1000ms interval for 5+ messages', async () => {
      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      for (let i = 0; i < 5; i++) {
        accumulateMessage(makeMessage('ch1', `msg${i}`), config);
      }

      // Should not fire before 1000ms
      vi.advanceTimersByTime(999);
      expect(mockClassifierSend).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(mockClassifierSend).toHaveBeenCalled();
    });

    it('should use config.triage.defaultInterval as base interval', () => {
      const customConfig = makeConfig({ triage: { defaultInterval: 20000 } });
      accumulateMessage(makeMessage('ch1', 'single'), customConfig);
      vi.advanceTimersByTime(19999);
      expect(mockClassifierSend).not.toHaveBeenCalled();
    });
  });

  // ── startTriage / stopTriage ──────────────────────────────────────────

  describe('startTriage / stopTriage', () => {
    it('should initialize CLI processes', () => {
      // startTriage already called in beforeEach — processes were created
      expect(mockClassifierStart).toHaveBeenCalled();
      expect(mockResponderStart).toHaveBeenCalled();
    });

    it('should clear all state and close processes on stop', () => {
      accumulateMessage(makeMessage('ch1', 'msg1'), config);
      accumulateMessage(makeMessage('ch2', 'msg2'), config);
      stopTriage();

      expect(mockClassifierClose).toHaveBeenCalled();
      expect(mockResponderClose).toHaveBeenCalled();
    });

    it('should log with split config fields', () => {
      expect(info).toHaveBeenCalledWith(
        'Triage processes started',
        expect.objectContaining({
          classifyModel: 'claude-haiku-4-5',
          respondModel: 'claude-sonnet-4-5',
          tokenRecycleLimit: 20000,
          streaming: false,
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

      mockClassifierSend.mockClear();
      await evaluateNow('ch-old', config, client, healthMonitor);
      expect(mockClassifierSend).not.toHaveBeenCalled();
    });

    it('should evict oldest channels when over 100-channel cap', async () => {
      const longConfig = makeConfig({ triage: { defaultInterval: 999999 } });

      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      for (let i = 0; i < 102; i++) {
        accumulateMessage(makeMessage(`ch-cap-${i}`, 'msg'), longConfig);
      }

      mockClassifierSend.mockClear();
      await evaluateNow('ch-cap-0', longConfig, client, healthMonitor);
      expect(mockClassifierSend).not.toHaveBeenCalled();

      const classResult2 = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'hi' }],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult2));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));
      await evaluateNow('ch-cap-101', longConfig, client, healthMonitor);
      expect(mockClassifierSend).toHaveBeenCalled();
    });
  });

  // ── Conversation text format ──────────────────────────────────────────

  describe('conversation text format', () => {
    it('should include message IDs in the classifier prompt', async () => {
      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(
        makeMessage('ch1', 'hello world', { username: 'alice', userId: 'u42', id: 'msg-42' }),
        config,
      );

      await evaluateNow('ch1', config, client, healthMonitor);

      const prompt = mockClassifierSend.mock.calls[0][0];
      expect(prompt).toContain('[msg-42] alice (<@u42>): hello world');
    });
  });

  // ── Emoji status reactions ──────────────────────────────────────────

  describe('emoji status reactions', () => {
    it('should add 👀 reaction when classification is non-ignore', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'user asked a question',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hi!' }],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hello'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockReact).toHaveBeenCalledWith('\uD83D\uDC40');
    });

    it('should NOT add 👀 reaction when statusReactions is false', async () => {
      const noReactConfig = makeConfig({ triage: { statusReactions: false } });
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hi!' }],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hello'), noReactConfig);
      await evaluateNow('ch1', noReactConfig, client, healthMonitor);

      expect(mockReact).not.toHaveBeenCalledWith('\uD83D\uDC40');
    });

    it('should add 🔍 reaction when WebSearch tool is detected mid-stream', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'needs search',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [
          { targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Found it!' },
        ],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      // Simulate onEvent being called with a WebSearch tool_use, then return the result
      mockResponderSend.mockImplementation(async (_prompt, _opts, { onEvent } = {}) => {
        if (onEvent) {
          await onEvent({
            message: {
              content: [{ type: 'tool_use', name: 'WebSearch', input: { query: 'test' } }],
            },
          });
        }
        return mockRespondResult(respondResult);
      });

      accumulateMessage(makeMessage('ch1', 'search for something'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockReact).toHaveBeenCalledWith('\uD83D\uDD0D');
    });

    it('should NOT add 🔍 reaction when statusReactions is false', async () => {
      const noReactConfig = makeConfig({ triage: { statusReactions: false } });
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Done!' }],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

      mockResponderSend.mockImplementation(async (_prompt, _opts, { onEvent } = {}) => {
        if (onEvent) {
          await onEvent({
            message: {
              content: [{ type: 'tool_use', name: 'WebSearch', input: { query: 'test' } }],
            },
          });
        }
        return mockRespondResult(respondResult);
      });

      accumulateMessage(makeMessage('ch1', 'search'), noReactConfig);
      await evaluateNow('ch1', noReactConfig, client, healthMonitor);

      expect(mockReact).not.toHaveBeenCalledWith('\uD83D\uDD0D');
    });

    it('should not block response flow when reaction fails', async () => {
      // Make react throw to simulate permission failure
      mockReact.mockRejectedValue(new Error('Missing Permissions'));

      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hi!' }],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hello'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Response should still be sent despite reaction failure
      expect(safeSend).toHaveBeenCalledWith(expect.anything(), contentWith('Hi!', 'msg-default'));
    });
  });

  // ── Trigger word detection ──────────────────────────────────────────

  describe('trigger word evaluation', () => {
    it('should call evaluateNow on trigger word detection', async () => {
      const twConfig = makeConfig({ triage: { triggerWords: ['urgent'] } });
      const classResult = {
        classification: 'respond',
        reasoning: 'trigger',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'On it!' }],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'this is urgent'), twConfig);

      await vi.waitFor(() => {
        expect(mockClassifierSend).toHaveBeenCalled();
      });
    });

    it('should schedule a timer for non-trigger messages', () => {
      accumulateMessage(makeMessage('ch1', 'normal message'), config);
      expect(mockClassifierSend).not.toHaveBeenCalled();

      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      vi.advanceTimersByTime(5000);
    });
  });

  // ── CLI edge cases ──────────────────────────────────────────────────

  describe('CLI edge cases', () => {
    it('should handle classifier error gracefully and send fallback', async () => {
      mockClassifierSend.mockRejectedValue(new Error('CLI process failed'));

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        "Sorry, I'm having trouble thinking right now. Try again in a moment!",
      );
    });

    it('should handle classifier returning unparseable result', async () => {
      mockClassifierSend.mockResolvedValue({
        type: 'result',
        subtype: 'success',
        result: '',
        is_error: false,
        errors: [],
        total_cost_usd: 0.001,
        duration_ms: 100,
      });

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(warn).toHaveBeenCalledWith(
        'Classifier result unparseable',
        expect.objectContaining({ channelId: 'ch1' }),
      );
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should handle responder error gracefully', async () => {
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));
      mockResponderSend.mockRejectedValue(new Error('Responder failed'));

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Should send fallback error message
      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        "Sorry, I'm having trouble thinking right now. Try again in a moment!",
      );
    });
  });

  // ── Legacy config compat ──────────────────────────────────────────────

  describe('legacy config compatibility', () => {
    it('should resolve from old nested format', async () => {
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
          models: { triage: 'claude-haiku-3', default: 'claude-sonnet-4-5' },
          budget: { triage: 0.01, response: 0.25 },
          timeouts: { triage: 15000, response: 20000 },
        },
      });

      // Re-init with legacy config
      stopTriage();
      await startTriage(client, legacyConfig, healthMonitor);

      // The process should have been created with resolved values
      expect(info).toHaveBeenCalledWith(
        'Triage processes started',
        expect.objectContaining({
          classifyModel: 'claude-haiku-4-5',
          respondModel: 'claude-sonnet-4-5',
        }),
      );
    });

    it('should prefer new split config keys', async () => {
      const splitConfig = makeConfig({
        triage: {
          classifyModel: 'claude-haiku-4-5',
          respondModel: 'claude-sonnet-4-5',
          classifyBudget: 0.1,
          respondBudget: 0.75,
          model: 'claude-haiku-3-5',
          budget: 0.5,
        },
      });

      stopTriage();
      await startTriage(client, splitConfig, healthMonitor);

      expect(info).toHaveBeenCalledWith(
        'Triage processes started',
        expect.objectContaining({
          classifyModel: 'claude-haiku-4-5',
          respondModel: 'claude-sonnet-4-5',
        }),
      );
    });
  });
});
