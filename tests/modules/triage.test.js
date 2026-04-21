import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must be before imports) ──────────────────────────────────────────

const { mockGenerate, mockStream } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  mockStream: vi.fn(),
}));

vi.mock('../../src/utils/aiClient.js', () => ({
  generate: (...args) => mockGenerate(...args),
  stream: (...args) => mockStream(...args),
  warmConnection: vi.fn().mockResolvedValue(undefined),
}));

// Mock discordCache to pass through to the underlying client.channels.fetch
vi.mock('../../src/utils/discordCache.js', () => ({
  fetchChannelCached: vi.fn().mockImplementation(async (client, channelId) => {
    if (!channelId) return null;
    const cached = client.channels?.cache?.get?.(channelId);
    if (cached) return cached;
    if (client.channels?.fetch) {
      return client.channels.fetch(channelId).catch(() => null);
    }
    return null;
  }),
  fetchGuildChannelsCached: vi.fn().mockResolvedValue([]),
  fetchGuildRolesCached: vi.fn().mockResolvedValue([]),
  fetchMemberCached: vi.fn().mockResolvedValue(null),
  invalidateGuildCache: vi.fn().mockResolvedValue(undefined),
}));
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
vi.mock('../../src/modules/ai.js', () => ({
  addToHistory: vi.fn(),
  isChannelBlocked: vi.fn().mockReturnValue(false),
  _setPoolGetter: vi.fn(),
  setPool: vi.fn(),
  getConversationHistory: vi.fn().mockReturnValue(new Map()),
  setConversationHistory: vi.fn(),
  getHistoryAsync: vi.fn().mockResolvedValue([]),
  initConversationHistory: vi.fn().mockResolvedValue(undefined),
  startConversationCleanup: vi.fn(),
  stopConversationCleanup: vi.fn(),
}));

let mockGlobalConfig = {};

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn((_guildId) => mockGlobalConfig),
  loadConfigFromFile: vi.fn(),
  loadConfig: vi.fn().mockResolvedValue(undefined),
  onConfigChange: vi.fn(),
  offConfigChange: vi.fn(),
  clearConfigListeners: vi.fn(),
  setConfigValue: vi.fn().mockResolvedValue(undefined),
  resetConfig: vi.fn().mockResolvedValue(undefined),
}));

import { info, warn } from '../../src/logger.js';
import { addToHistory } from '../../src/modules/ai.js';
import { isSpam } from '../../src/modules/spam.js';
import {
  accumulateMessage,
  evaluateNow,
  startTriage,
  stopTriage,
} from '../../src/modules/triage.js';
import { channelBuffers } from '../../src/modules/triage-buffer.js';
import { safeSend } from '../../src/utils/safeSend.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a mock SDK result for the classifier (generate()).
 * @param {Object} classifyObj - { classification, reasoning, targetMessageIds }
 */
function mockClassifyResult(classifyObj) {
  return {
    text: JSON.stringify(classifyObj),
    costUsd: 0.0005,
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 50,
    finishReason: 'stop',
    sources: [],
    providerMetadata: { anthropic: {} },
  };
}

/**
 * Create a mock SDK result for the responder (stream()).
 * @param {Object} respondObj - { responses: [...] }
 */
function mockRespondResult(respondObj) {
  return {
    text: JSON.stringify(respondObj),
    costUsd: 0.005,
    usage: { inputTokens: 500, outputTokens: 200 },
    durationMs: 200,
    finishReason: 'stop',
    sources: [],
    providerMetadata: { anthropic: {} },
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
      classifyModel: 'minimax:MiniMax-M2.7',
      classifyBudget: 0.05,
      respondModel: 'minimax:MiniMax-M2.7',
      respondBudget: 0.2,
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
    channel: {
      id: channelId,
      name: extras.channelName || 'test-channel',
      topic: extras.channelTopic || null,
    },
    author: { username: extras.username || 'testuser', id: extras.userId || 'u1' },
    ...extras,
  };
}

/** Shared mocks for message.react and reaction removal — reset in beforeEach */
let mockReact;
let mockRemove;

function makeClient() {
  mockReact = vi.fn().mockResolvedValue(undefined);
  mockRemove = vi.fn().mockResolvedValue(undefined);
  return {
    channels: {
      fetch: vi.fn().mockResolvedValue({
        id: 'ch1',
        guildId: 'guild-1',
        sendTyping: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
        messages: {
          fetch: vi.fn().mockResolvedValue({
            id: 'msg-default',
            react: mockReact,
            reactions: {
              cache: {
                get: vi.fn().mockReturnValue({ users: { remove: mockRemove } }),
              },
            },
          }),
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
    mockGlobalConfig = config;
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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hello'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockGenerate).toHaveBeenCalled();
      expect(mockStream).toHaveBeenCalled();
    });

    it('should call addToHistory with correct args for guild message', () => {
      const msg = makeMessage('ch1', 'hello world', {
        id: 'msg-99',
        username: 'alice',
        userId: 'u99',
        guild: { id: 'g1' },
      });
      accumulateMessage(msg, config);
      expect(addToHistory).toHaveBeenCalledWith(
        'ch1',
        'user',
        'hello world',
        'alice',
        'msg-99',
        'g1',
      );
    });

    it('should call addToHistory with null guildId for DM (no guild)', () => {
      const msg = makeMessage('ch1', 'dm message', { id: 'msg-dm', username: 'bob', userId: 'u2' });
      // No guild property — guild?.id resolves to undefined, coerced to null
      accumulateMessage(msg, config);
      expect(addToHistory).toHaveBeenCalledWith('ch1', 'user', 'dm message', 'bob', 'msg-dm', null);
    });

    it('should skip when triage is disabled', async () => {
      const disabledConfig = makeConfig({ triage: { enabled: false } });
      mockGlobalConfig = disabledConfig;
      accumulateMessage(makeMessage('ch1', 'hello'), disabledConfig);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should skip excluded channels', async () => {
      const excConfig = makeConfig({ triage: { excludeChannels: ['ch1'] } });
      mockGlobalConfig = excConfig;
      accumulateMessage(makeMessage('ch1', 'hello'), excConfig);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should skip channels not in allow list when allow list is non-empty', async () => {
      const restrictedConfig = makeConfig({ triage: { channels: ['allowed-ch'] } });
      mockGlobalConfig = restrictedConfig;
      accumulateMessage(makeMessage('not-allowed-ch', 'hello'), restrictedConfig);
      await evaluateNow('not-allowed-ch', config, client, healthMonitor);

      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should allow any channel when allow list is empty', async () => {
      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('any-channel', 'hello'), config);
      await evaluateNow('any-channel', config, client, healthMonitor);

      expect(mockGenerate).toHaveBeenCalled();
    });

    it('should skip blocked channels (early return, no addToHistory)', async () => {
      const { isChannelBlocked } = await import('../../src/modules/ai.js');
      isChannelBlocked.mockReturnValueOnce(true);

      const msg = makeMessage('blocked-ch', 'hello world', {
        id: 'msg-blocked',
        username: 'alice',
        userId: 'u99',
        guild: { id: 'g1' },
      });
      accumulateMessage(msg, config);

      // Should NOT call addToHistory when channel is blocked
      expect(addToHistory).not.toHaveBeenCalled();
      // Should NOT trigger any classifier activity
      await evaluateNow('blocked-ch', config, client, healthMonitor);
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should only check parentId for threads, not category channels', async () => {
      const { isChannelBlocked } = await import('../../src/modules/ai.js');

      // Regular text channel in a category - parentId is category ID
      const categoryChannelMsg = makeMessage('ch1', 'hello', {
        id: 'msg-cat',
        guild: { id: 'g1' },
      });
      // Simulate a regular channel with a category parent
      categoryChannelMsg.channel.parentId = 'category-123';
      categoryChannelMsg.channel.isThread = () => false;

      accumulateMessage(categoryChannelMsg, config);

      // isChannelBlocked should be called with null parentId for non-thread channels
      expect(isChannelBlocked).toHaveBeenCalledWith('ch1', null, 'g1');
    });

    it('should pass parentId for threads to isChannelBlocked', async () => {
      const { isChannelBlocked } = await import('../../src/modules/ai.js');

      // Thread - parentId is the parent channel ID
      const threadMsg = makeMessage('thread-1', 'hello', {
        id: 'msg-thread',
        guild: { id: 'g1' },
      });
      threadMsg.channel.parentId = 'parent-channel-456';
      threadMsg.channel.isThread = () => true;

      accumulateMessage(threadMsg, config);

      // isChannelBlocked should be called with the parent channel ID for threads
      expect(isChannelBlocked).toHaveBeenCalledWith('thread-1', 'parent-channel-456', 'g1');
    });

    it('should skip empty messages', async () => {
      accumulateMessage(makeMessage('ch1', ''), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should skip whitespace-only messages', async () => {
      accumulateMessage(makeMessage('ch1', '   '), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should include channelName and channelTopic in buffer entry', () => {
      const msg = makeMessage('ch1', 'hello', {
        id: 'msg-meta',
        channelName: 'dev-chat',
        channelTopic: 'Development discussion',
      });
      accumulateMessage(msg, config);

      const buf = channelBuffers.get('ch1');
      expect(buf.messages[0]).toHaveProperty('channelName', 'dev-chat');
      expect(buf.messages[0]).toHaveProperty('channelTopic', 'Development discussion');
    });

    it('should respect maxBufferSize cap', async () => {
      const smallConfig = makeConfig({ triage: { maxBufferSize: 3 } });
      mockGlobalConfig = smallConfig;
      for (let i = 0; i < 5; i++) {
        accumulateMessage(makeMessage('ch1', `msg ${i}`), smallConfig);
      }

      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      await evaluateNow('ch1', smallConfig, client, healthMonitor);

      // The classifier prompt should contain only messages 2, 3, 4 (oldest dropped)
      const prompt = mockGenerate.mock.calls[0][0].prompt;
      expect(prompt).toContain('msg 2');
      expect(prompt).toContain('msg 4');
      expect(prompt).not.toContain('msg 0');
    });
  });

  // ── checkTriggerWords (tested via accumulateMessage) ────────────────────

  describe('checkTriggerWords', () => {
    it('should force evaluation when trigger words match', async () => {
      const twConfig = makeConfig({ triage: { triggerWords: ['help'] } });
      mockGlobalConfig = twConfig;
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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'I need help please'), twConfig);

      await vi.waitFor(() => {
        expect(mockGenerate).toHaveBeenCalled();
      });
    });

    it('should trigger on moderation keywords', async () => {
      const modConfig = makeConfig({ triage: { moderationKeywords: ['badword'] } });
      mockGlobalConfig = modConfig;
      const classResult = {
        classification: 'moderate',
        reasoning: 'bad content',
        targetMessageIds: ['msg-default'],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('ch1', 'this is badword content'), modConfig);

      await vi.waitFor(() => {
        expect(mockGenerate).toHaveBeenCalled();
      });
    });

    it('should trigger when spam pattern matches', async () => {
      isSpam.mockReturnValueOnce(true);
      const classResult = {
        classification: 'moderate',
        reasoning: 'spam',
        targetMessageIds: [],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('ch1', 'free crypto claim'), config);

      await vi.waitFor(() => {
        expect(mockGenerate).toHaveBeenCalled();
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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hi there'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(mockStream).toHaveBeenCalledTimes(1);
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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('ch1', 'irrelevant chat'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(mockStream).not.toHaveBeenCalled();
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should not evaluate when buffer is empty', async () => {
      await evaluateNow('empty-ch', config, client, healthMonitor);
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should skip evaluation when channel becomes blocked after buffering', async () => {
      const { isChannelBlocked } = await import('../../src/modules/ai.js');

      // First, buffer a message while channel is NOT blocked
      accumulateMessage(
        makeMessage('ch-becomes-blocked', 'hello world', {
          id: 'msg-buffered',
          username: 'alice',
          userId: 'u99',
          guild: { id: 'g1' },
        }),
        config,
      );

      // Verify message was added to history (channel wasn't blocked at accumulate time)
      expect(addToHistory).toHaveBeenCalled();

      // Now block the channel
      isChannelBlocked.mockReturnValue(true);

      // Call evaluateNow - it should check blocked status and skip
      await evaluateNow('ch-becomes-blocked', config, client, healthMonitor);

      // Classifier should NOT have been called despite buffered messages
      expect(mockGenerate).not.toHaveBeenCalled();

      // Reset the mock to not affect subsequent tests
      isChannelBlocked.mockReturnValue(false);
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
      mockGenerate.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      );
      // Re-eval uses fresh classifier call
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult2));
      mockStream.mockResolvedValueOnce(mockRespondResult(respondResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult2));

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
        expect(mockGenerate).toHaveBeenCalledTimes(2);
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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGlobalConfig = modConfig;
      const classResult = {
        classification: 'moderate',
        reasoning: 'spam detected',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'spammer', response: 'Rule #4' }],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hello'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // Buffer should be cleared — second evaluateNow should find nothing
      mockGenerate.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should clear buffer on ignore classification', async () => {
      const classResult = {
        classification: 'ignore',
        reasoning: 'not relevant',
        targetMessageIds: [],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('ch1', 'random chat'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      mockGenerate.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should clear buffer on moderate classification', async () => {
      const classResult = {
        classification: 'moderate',
        reasoning: 'flagged',
        targetMessageIds: [],
      };
      const respondResult = { responses: [] };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'bad content'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      mockGenerate.mockClear();
      await evaluateNow('ch1', config, client, healthMonitor);
      expect(mockGenerate).not.toHaveBeenCalled();
    });
  });

  // ── getDynamicInterval (tested via timer scheduling) ──────────────────

  describe('getDynamicInterval', () => {
    it('should use 5000ms interval for 0-1 messages', () => {
      accumulateMessage(makeMessage('ch1', 'single'), config);
      vi.advanceTimersByTime(4999);
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should use 2500ms interval for 2-4 messages', async () => {
      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(makeMessage('ch1', 'msg1'), config);
      accumulateMessage(makeMessage('ch1', 'msg2'), config);

      // Should not fire before 2500ms
      vi.advanceTimersByTime(2499);
      expect(mockGenerate).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(mockGenerate).toHaveBeenCalled();
    });

    it('should use 1000ms interval for 5+ messages', async () => {
      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      for (let i = 0; i < 5; i++) {
        accumulateMessage(makeMessage('ch1', `msg${i}`), config);
      }

      // Should not fire before 1000ms
      vi.advanceTimersByTime(999);
      expect(mockGenerate).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(mockGenerate).toHaveBeenCalled();
    });

    it('should use config.triage.defaultInterval as base interval', () => {
      const customConfig = makeConfig({ triage: { defaultInterval: 20000 } });
      mockGlobalConfig = customConfig;
      accumulateMessage(makeMessage('ch1', 'single'), customConfig);
      vi.advanceTimersByTime(19999);
      expect(mockGenerate).not.toHaveBeenCalled();
    });
  });

  // ── startTriage / stopTriage ──────────────────────────────────────────

  describe('startTriage / stopTriage', () => {
    it('should configure AI SDK settings', () => {
      // startTriage already called in beforeEach — config was set up
      expect(info).toHaveBeenCalledWith(
        'Triage configured',
        expect.objectContaining({
          classifyModel: expect.any(String),
          respondModel: expect.any(String),
        }),
      );
    });

    it('should clear all state on stop', () => {
      accumulateMessage(makeMessage('ch1', 'msg1'), config);
      accumulateMessage(makeMessage('ch2', 'msg2'), config);
      stopTriage();

      // Buffers should be cleared
      expect(channelBuffers.size).toBe(0);
    });

    it('should log with split config fields', () => {
      expect(info).toHaveBeenCalledWith(
        'Triage configured',
        expect.objectContaining({
          classifyModel: 'minimax:MiniMax-M2.7',
          respondModel: 'minimax:MiniMax-M2.7',
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

      mockGenerate.mockClear();
      await evaluateNow('ch-old', config, client, healthMonitor);
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should evict oldest channels when over 100-channel cap', async () => {
      const longConfig = makeConfig({ triage: { defaultInterval: 999999 } });
      mockGlobalConfig = longConfig;

      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      for (let i = 0; i < 102; i++) {
        accumulateMessage(makeMessage(`ch-cap-${i}`, 'msg'), longConfig);
      }

      mockGenerate.mockClear();
      await evaluateNow('ch-cap-0', longConfig, client, healthMonitor);
      expect(mockGenerate).not.toHaveBeenCalled();

      const classResult2 = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'hi' }],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult2));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));
      await evaluateNow('ch-cap-101', longConfig, client, healthMonitor);
      expect(mockGenerate).toHaveBeenCalled();
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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      accumulateMessage(
        makeMessage('ch1', 'hello world', { username: 'alice', userId: 'u42', id: 'msg-42' }),
        config,
      );

      await evaluateNow('ch1', config, client, healthMonitor);

      const prompt = mockGenerate.mock.calls[0][0].prompt;
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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hello'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockReact).toHaveBeenCalledWith('\uD83D\uDC40');
    });

    it('should NOT add 👀 reaction when statusReactions is false', async () => {
      const noReactConfig = makeConfig({ triage: { statusReactions: false } });
      mockGlobalConfig = noReactConfig;
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hi!' }],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      // Simulate onChunk being called with a web_search tool, then return the result
      mockStream.mockImplementation(async (opts) => {
        if (opts.onChunk) {
          opts.onChunk('web_search', { query: 'test' });
        }
        return mockRespondResult(respondResult);
      });

      accumulateMessage(makeMessage('ch1', 'search for something'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(mockReact).toHaveBeenCalledWith('\uD83D\uDD0D');
    });

    it('should NOT add 🔍 reaction when statusReactions is false', async () => {
      const noReactConfig = makeConfig({ triage: { statusReactions: false } });
      mockGlobalConfig = noReactConfig;
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Done!' }],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));

      mockStream.mockImplementation(async (opts) => {
        if (opts.onChunk) {
          opts.onChunk('web_search', { query: 'test' });
        }
        return mockRespondResult(respondResult);
      });

      accumulateMessage(makeMessage('ch1', 'search'), noReactConfig);
      await evaluateNow('ch1', noReactConfig, client, healthMonitor);

      expect(mockReact).not.toHaveBeenCalledWith('\uD83D\uDD0D');
    });

    it('should transition 👀 → 💬 → removed (no thinking tokens)', async () => {
      const noThinkConfig = makeConfig({ triage: { thinkingTokens: 0 } });
      mockGlobalConfig = noThinkConfig;
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hi!' }],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hello'), noThinkConfig);
      await evaluateNow('ch1', noThinkConfig, client, healthMonitor);

      // 👀 added then removed, 💬 added then removed
      const reactCalls = mockReact.mock.calls.map((c) => c[0]);
      expect(reactCalls).toContain('\uD83D\uDC40');
      expect(reactCalls).toContain('\uD83D\uDCAC');
      // 👀 and 💬 should both be removed after completion
      expect(mockRemove).toHaveBeenCalledWith('bot-id');
    });

    it('should transition 👀 → 🧠 → removed (classifier requests thinking)', async () => {
      const thinkConfig = makeConfig({ triage: { thinkingTokens: 1000 } });
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
        needsThinking: true,
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hi!' }],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hello'), thinkConfig);
      await evaluateNow('ch1', thinkConfig, client, healthMonitor);

      const reactCalls = mockReact.mock.calls.map((c) => c[0]);
      expect(reactCalls).toContain('\uD83E\uDDE0');
      expect(reactCalls).not.toContain('\uD83D\uDCAC');
      expect(mockRemove).toHaveBeenCalledWith('bot-id');
    });

    it('should NOT add or remove reactions when statusReactions is false', async () => {
      const noReactConfig = makeConfig({ triage: { statusReactions: false } });
      mockGlobalConfig = noReactConfig;
      const classResult = {
        classification: 'respond',
        reasoning: 'test',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'Hi!' }],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'hello'), noReactConfig);
      await evaluateNow('ch1', noReactConfig, client, healthMonitor);

      expect(mockReact).not.toHaveBeenCalled();
      expect(mockRemove).not.toHaveBeenCalled();
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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

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
      mockGlobalConfig = twConfig;
      const classResult = {
        classification: 'respond',
        reasoning: 'trigger',
        targetMessageIds: ['msg-default'],
      };
      const respondResult = {
        responses: [{ targetMessageId: 'msg-default', targetUser: 'testuser', response: 'On it!' }],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockResolvedValue(mockRespondResult(respondResult));

      accumulateMessage(makeMessage('ch1', 'this is urgent'), twConfig);

      await vi.waitFor(() => {
        expect(mockGenerate).toHaveBeenCalled();
      });
    });

    it('should schedule a timer for non-trigger messages', () => {
      accumulateMessage(makeMessage('ch1', 'normal message'), config);
      expect(mockGenerate).not.toHaveBeenCalled();

      const classResult = {
        classification: 'ignore',
        reasoning: 'test',
        targetMessageIds: [],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      vi.advanceTimersByTime(5000);
    });
  });

  // ── CLI edge cases ──────────────────────────────────────────────────

  describe('CLI edge cases', () => {
    it('should handle classifier error gracefully and send fallback', async () => {
      mockGenerate.mockRejectedValue(new Error('CLI process failed'));

      accumulateMessage(makeMessage('ch1', 'test'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        "Sorry, I'm having trouble thinking right now. Try again in a moment!",
      );
    });

    it('should handle classifier returning unparseable result', async () => {
      mockGenerate.mockResolvedValue({
        text: '',
        costUsd: 0.001,
        usage: { inputTokens: 100, outputTokens: 10 },
        durationMs: 100,
        finishReason: 'stop',
        sources: [],
        providerMetadata: { anthropic: {} },
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
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockRejectedValue(new Error('Responder failed'));

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
          // Legacy nested format — `models.triage` maps into classifyModel and
          // `models.default` maps into respondModel, preserving guild customisation
          // through the unified-catalog migration. Legacy values MUST already be in
          // `provider:model` form because the strict D1 parser rejects bare strings.
          // Clear the makeConfig helper defaults so the legacy fallback path runs.
          classifyModel: undefined,
          respondModel: undefined,
          models: {
            triage: 'moonshot:kimi-k2.6',
            default: 'openrouter:minimax/minimax-m2.5',
          },
          budget: { triage: 0.01, response: 0.25 },
          timeouts: { triage: 15000, response: 20000 },
        },
      });

      // Re-init with legacy config
      stopTriage();
      await startTriage(client, legacyConfig, healthMonitor);

      // The process should have been created with resolved values
      expect(info).toHaveBeenCalledWith(
        'Triage configured',
        expect.objectContaining({
          classifyModel: 'moonshot:kimi-k2.6',
          respondModel: 'openrouter:minimax/minimax-m2.5',
        }),
      );
    });

    it('should prefer new split config keys', async () => {
      const splitConfig = makeConfig({
        triage: {
          classifyModel: 'minimax:MiniMax-M2.7',
          respondModel: 'moonshot:kimi-k2.6',
          classifyBudget: 0.1,
          respondBudget: 0.75,
          model: 'legacy-model',
          budget: 0.5,
        },
      });

      stopTriage();
      await startTriage(client, splitConfig, healthMonitor);

      expect(info).toHaveBeenCalledWith(
        'Triage configured',
        expect.objectContaining({
          classifyModel: 'minimax:MiniMax-M2.7',
          respondModel: 'moonshot:kimi-k2.6',
        }),
      );
    });
  });

  // ── Remediation: responder error and truncated confidence ────────────────

  describe('responder error handling', () => {
    it('should show user-friendly "having trouble thinking" message on stream error', async () => {
      const { AIClientError } = await import('../../src/utils/errors.js');
      const classResult = {
        classification: 'respond',
        reasoning: 'question',
        targetMessageIds: ['msg-default'],
      };
      mockGenerate.mockResolvedValue(mockClassifyResult(classResult));
      mockStream.mockRejectedValue(
        new AIClientError('API error: server down', 'api', { statusCode: 500 }),
      );

      accumulateMessage(makeMessage('ch1', 'hello'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      expect(safeSend).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('having trouble thinking'),
      );
    });
  });

  describe('truncated classification confidence', () => {
    it('should get confidence 0.5 from truncated JSON recovery and be dropped by threshold', async () => {
      // Simulate a truncated JSON response that parseSDKResult recovers via regex.
      // The recovered object gets confidence: 0.5, which is below the default threshold of 0.6.
      const truncatedJson = '{"classification":"respond","reasoning":"partial respon';
      mockGenerate.mockResolvedValue({
        text: truncatedJson,
        costUsd: 0.0005,
        usage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 50,
        finishReason: 'length',
        sources: [],
        providerMetadata: { anthropic: {} },
      });

      accumulateMessage(makeMessage('ch1', 'test message'), config);
      await evaluateNow('ch1', config, client, healthMonitor);

      // With confidence 0.5 (< default threshold 0.6), the respond classification
      // should be skipped, so the responder (stream) should NOT be called.
      expect(mockStream).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith(
        'Triage: confidence below threshold, skipping',
        expect.objectContaining({ confidence: 0.5 }),
      );
    });
  });
});
