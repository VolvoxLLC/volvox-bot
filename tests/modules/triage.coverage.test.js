/**
 * Coverage tests for src/modules/triage.js
 * Tests: buffer overflow, concurrent eval guard, abort handling, recursion depth limit, timeout handling
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must precede imports) ─────────────────────────────────────────────

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

vi.mock('../../src/modules/spam.js', () => ({ isSpam: vi.fn().mockReturnValue(false) }));
vi.mock('../../src/utils/safeSend.js', () => ({ safeSend: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('../../src/modules/memory.js', () => ({
  buildMemoryContext: vi.fn().mockResolvedValue(''),
  extractAndStoreMemories: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/prompts/index.js', () => ({
  loadPrompt: vi.fn().mockReturnValue('mock-prompt'),
  promptPath: vi.fn().mockReturnValue('/mock/path'),
}));
vi.mock('../../src/modules/triage-respond.js', () => ({
  buildStatsAndLog: vi.fn().mockResolvedValue({
    stats: { classifyCostUsd: 0.001, respondCostUsd: 0.005, totalCostUsd: 0.006 },
    channel: { id: 'ch1', send: vi.fn() },
  }),
  fetchChannelContext: vi.fn().mockResolvedValue([]),
  sendModerationLog: vi.fn().mockResolvedValue(undefined),
  sendResponses: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/modules/triage-parse.js', () => ({
  parseClassifyResult: vi.fn(),
  parseRespondResult: vi.fn(),
}));
vi.mock('../../src/modules/triage-prompt.js', () => ({
  buildClassifyPrompt: vi.fn().mockReturnValue('classify-prompt'),
  buildRespondPrompt: vi.fn().mockReturnValue('respond-prompt'),
}));
vi.mock('../../src/modules/triage-filter.js', () => ({
  checkTriggerWords: vi.fn().mockReturnValue(false),
  sanitizeText: vi.fn((t) => t),
}));
vi.mock('../../src/modules/triage-config.js', () => ({
  getDynamicInterval: vi.fn().mockReturnValue(100),
  isChannelEligible: vi.fn().mockReturnValue(true),
  resolveTriageConfig: vi.fn().mockReturnValue({
    classifyModel: 'haiku',
    respondModel: 'sonnet',
    classifyBudget: 0.05,
    respondBudget: 0.2,
    tokenRecycleLimit: 20000,
    streaming: false,
    timeout: 30000,
    thinkingTokens: 0,
    statusReactions: true,
  }),
}));
vi.mock('../../src/modules/triage-buffer.js', async (importOriginal) => {
  const actual = await importOriginal();
  return actual; // use real buffer implementation
});

import { warn } from '../../src/logger.js';
import { CLIProcessError } from '../../src/modules/cli-process.js';
import {
  accumulateMessage,
  evaluateNow,
  startTriage,
  stopTriage,
} from '../../src/modules/triage.js';
import { channelBuffers } from '../../src/modules/triage-buffer.js';
import { checkTriggerWords } from '../../src/modules/triage-filter.js';
import { parseClassifyResult, parseRespondResult } from '../../src/modules/triage-parse.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTriageConfig(overrides = {}) {
  return {
    ai: { systemPrompt: 'You are a bot.' },
    triage: {
      enabled: true,
      channels: [],
      excludeChannels: [],
      maxBufferSize: 30,
      triggerWords: [],
      classifyModel: 'haiku',
      respondModel: 'sonnet',
      classifyBudget: 0.05,
      respondBudget: 0.2,
      tokenRecycleLimit: 20000,
      timeout: 30000,
      defaultInterval: 100,
      statusReactions: true,
      ...overrides,
    },
  };
}

function makeMockClient() {
  return {
    user: { id: 'bot-id', tag: 'Bot#0001' },
    channels: {
      fetch: vi.fn().mockResolvedValue({
        id: 'ch1',
        send: vi.fn().mockResolvedValue(undefined),
        sendTyping: vi.fn().mockResolvedValue(undefined),
        messages: {
          fetch: vi.fn().mockResolvedValue({
            id: 'msg1',
            react: vi.fn().mockResolvedValue(undefined),
            reactions: { cache: { get: vi.fn().mockReturnValue({ users: { remove: vi.fn() } }) } },
          }),
        },
      }),
    },
  };
}

function makeDiscordMessage(channelId, content = 'hello', extras = {}) {
  return {
    id: extras.id || 'msg1',
    content,
    channel: {
      id: channelId,
      messages: { fetch: vi.fn().mockRejectedValue(new Error('not found')) },
    },
    author: { username: 'user', id: 'u1', bot: false },
    createdTimestamp: Date.now(),
    reference: null,
    ...extras,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('triage module coverage', () => {
  let mockClient;

  beforeEach(async () => {
    stopTriage();
    vi.clearAllMocks();
    channelBuffers.clear();
    mockClient = makeMockClient();

    mockClassifierStart.mockResolvedValue(undefined);
    mockResponderStart.mockResolvedValue(undefined);
    parseClassifyResult.mockReturnValue(null); // default: classifier says nothing
    parseRespondResult.mockReturnValue(null);
    checkTriggerWords.mockReturnValue(false);

    await startTriage(mockClient, makeTriageConfig());
  });

  afterEach(() => {
    stopTriage();
    channelBuffers.clear();
  });

  describe('evaluateNow - buffer guard', () => {
    it('returns early when buffer is empty', async () => {
      await evaluateNow('empty-channel', makeTriageConfig(), mockClient);
      expect(mockClassifierSend).not.toHaveBeenCalled();
    });

    it('returns early when channel has no buffer entry', async () => {
      await evaluateNow('nonexistent', makeTriageConfig(), mockClient);
      expect(mockClassifierSend).not.toHaveBeenCalled();
    });
  });

  describe('evaluateNow - concurrent eval guard', () => {
    it('marks pendingReeval when evaluation is in progress', async () => {
      let resolveClassify;
      const classifyPromise = new Promise((resolve) => {
        resolveClassify = resolve;
      });
      mockClassifierSend.mockReturnValueOnce(classifyPromise);

      // Accumulate a message to create buffer entry
      const msg = makeDiscordMessage('ch-concurrent', 'message 1');
      await accumulateMessage(msg, makeTriageConfig());

      const buf = channelBuffers.get('ch-concurrent');
      if (buf) {
        buf.evaluating = true; // simulate in-flight eval
        buf.pendingReeval = false;

        // Second evaluateNow should set pendingReeval instead of starting new eval
        await evaluateNow('ch-concurrent', makeTriageConfig(), mockClient);
        expect(buf.pendingReeval).toBe(true);

        buf.evaluating = false;
        buf.pendingReeval = false;
      }

      resolveClassify({ type: 'result', is_error: false });
    });
  });

  describe('evaluateNow - recursion depth limit', () => {
    it('stops at MAX_REEVAL_DEPTH', async () => {
      // Accumulate message to create buffer
      const msg = makeDiscordMessage('ch-depth', 'hello');
      await accumulateMessage(msg, makeTriageConfig());

      // Call evaluateNow at max depth (3)
      await evaluateNow('ch-depth', makeTriageConfig(), mockClient, null, 3);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('recursion depth limit'),
        expect.any(Object),
      );
    });
  });

  describe('evaluateNow - classifier returns ignore', () => {
    it('stops processing when classifier returns null (ignore)', async () => {
      mockClassifierSend.mockResolvedValue({
        type: 'result',
        is_error: false,
        result: '{}',
        total_cost_usd: 0,
      });
      parseClassifyResult.mockReturnValue(null); // null = ignore

      const msg = makeDiscordMessage('ch-ignore', 'some text');
      await accumulateMessage(msg, makeTriageConfig());
      await evaluateNow('ch-ignore', makeTriageConfig(), mockClient);

      expect(mockResponderSend).not.toHaveBeenCalled();
    });
  });

  describe('evaluateNow - classifier timeout', () => {
    it('handles CLIProcessError timeout from classifier', async () => {
      mockClassifierSend.mockRejectedValue(new CLIProcessError('Timeout', 'timeout'));

      const msg = makeDiscordMessage('ch-timeout', 'hello');
      await accumulateMessage(msg, makeTriageConfig());
      // Should not throw — timeout is swallowed inside evaluateNow
      await expect(
        evaluateNow('ch-timeout', makeTriageConfig(), mockClient),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Triage evaluation aborted (timeout)'),
        expect.any(Object),
      );
    });
  });

  describe('evaluateNow - non-timeout CLIProcessError', () => {
    it('logs parse errors without sending user message', async () => {
      const { error: logError } = await import('../../src/logger.js');
      mockClassifierSend.mockRejectedValue(new CLIProcessError('Parse failed', 'parse'));

      const msg = makeDiscordMessage('ch-parse-err', 'hello');
      await accumulateMessage(msg, makeTriageConfig());
      await evaluateNow('ch-parse-err', makeTriageConfig(), mockClient);

      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('Triage evaluation failed'),
        expect.any(Object),
      );
    });

    it('sends error message to channel for non-parse failures', async () => {
      mockClassifierSend.mockRejectedValue(new Error('Unexpected failure'));

      const msg = makeDiscordMessage('ch-gen-err', 'hello');
      await accumulateMessage(msg, makeTriageConfig());
      await evaluateNow('ch-gen-err', makeTriageConfig(), mockClient);

      const { safeSend } = await import('../../src/utils/safeSend.js');
      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('trouble thinking'),
      );
    });
  });

  describe('accumulateMessage', () => {
    it('skips when triage is disabled', async () => {
      const config = makeTriageConfig();
      config.triage.enabled = false;
      const msg = makeDiscordMessage('ch1', 'hello');
      await accumulateMessage(msg, config);
      expect(channelBuffers.has('ch1')).toBe(false);
    });

    it('skips empty content messages', async () => {
      const msg = makeDiscordMessage('ch1', '   '); // whitespace only
      await accumulateMessage(msg, makeTriageConfig());
      // Buffer should not be created or message pushed
      expect(channelBuffers.has('ch1')).toBe(false);
      expect(checkTriggerWords).not.toHaveBeenCalled();
    });

    it('skips empty string messages', async () => {
      const msg = makeDiscordMessage('ch1', '');
      await accumulateMessage(msg, makeTriageConfig());
      expect(channelBuffers.has('ch1')).toBe(false);
      expect(checkTriggerWords).not.toHaveBeenCalled();
    });

    it('skips null content messages', async () => {
      const msg = makeDiscordMessage('ch1', null);
      await accumulateMessage(msg, makeTriageConfig());
      expect(channelBuffers.has('ch1')).toBe(false);
      expect(checkTriggerWords).not.toHaveBeenCalled();
    });

    it('handles trigger word detected - calls evaluateNow', async () => {
      checkTriggerWords.mockReturnValueOnce(true);
      mockClassifierSend.mockResolvedValue({
        type: 'result',
        is_error: false,
        result: '{}',
        total_cost_usd: 0,
      });
      parseClassifyResult.mockReturnValueOnce(null); // ignore

      const msg = makeDiscordMessage('ch-trigger', 'urgent message');
      await accumulateMessage(msg, makeTriageConfig());

      // Should have tried to classify (trigger word path)
      // Give it a tick for the fire-and-forget
      await new Promise((r) => setTimeout(r, 10));
      expect(checkTriggerWords).toHaveBeenCalledWith('urgent message', expect.any(Object));
      expect(mockClassifierSend).toHaveBeenCalled();
    });

    it('fetches referenced message content for replies', async () => {
      const refMsg = { id: 'ref1', author: { username: 'other', id: 'u2' }, content: 'original' };
      const msg = makeDiscordMessage('ch-reply', 'in reply to something');
      msg.reference = { messageId: 'ref1' };
      msg.channel.messages = { fetch: vi.fn().mockResolvedValue(refMsg) };

      await accumulateMessage(msg, makeTriageConfig());
      const buf = channelBuffers.get('ch-reply');
      expect(buf?.messages[0]?.replyTo?.messageId).toBe('ref1');
    });

    it('handles reply fetch failure gracefully', async () => {
      const msg = makeDiscordMessage('ch-reply-fail', 'reply to something');
      msg.reference = { messageId: 'ref-missing' };
      msg.channel.messages = { fetch: vi.fn().mockRejectedValue(new Error('Not found')) };

      await accumulateMessage(msg, makeTriageConfig());
      const buf = channelBuffers.get('ch-reply-fail');
      expect(buf?.messages[0]?.replyTo).toBeNull();
    });
  });

  describe('startTriage - system prompt handling', () => {
    it('uses systemPromptFile when no ai.systemPrompt configured', async () => {
      stopTriage();
      const config = makeTriageConfig();
      delete config.ai.systemPrompt;

      await startTriage(mockClient, config);
      // Should not throw — uses promptPath fallback
      expect(mockClassifierStart).toHaveBeenCalled();
    });
  });
});
