/**
 * Tests for the per-guild AI spend gate in evaluateAndRespond.
 * Exercises the budget check that occurs before classification.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (before imports) ───────────────────────────────────────────────────

const mockClassifierSend = vi.fn();
const mockResponderSend = vi.fn();
const mockClassifierStart = vi.fn().mockResolvedValue(undefined);
const mockResponderStart = vi.fn().mockResolvedValue(undefined);
const mockClassifierClose = vi.fn();
const mockResponderClose = vi.fn();

const mockCheckGuildBudget = vi.fn();

vi.mock('../../src/utils/guildSpend.js', () => ({
  checkGuildBudget: (...args) => mockCheckGuildBudget(...args),
  getGuildSpend: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../src/utils/discordCache.js', () => ({
  fetchChannelCached: vi.fn().mockImplementation(async (_client, channelId) => {
    if (!channelId) return null;
    return { id: channelId, guildId: 'guild-test', sendTyping: vi.fn(), send: vi.fn() };
  }),
  fetchGuildChannelsCached: vi.fn().mockResolvedValue([]),
  fetchGuildRolesCached: vi.fn().mockResolvedValue([]),
  fetchMemberCached: vi.fn().mockResolvedValue(null),
  invalidateGuildCache: vi.fn().mockResolvedValue(undefined),
}));

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

vi.mock('../../src/modules/memory.js', () => ({
  buildMemoryContext: vi.fn().mockResolvedValue(''),
  extractAndStoreMemories: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/prompts/index.js', () => ({
  loadPrompt: vi.fn().mockReturnValue(''),
  promptPath: vi.fn().mockReturnValue('/fake/path'),
}));

vi.mock('../../src/modules/triage-respond.js', () => ({
  buildStatsAndLog: vi.fn().mockResolvedValue({ stats: {}, channel: null }),
  fetchChannelContext: vi.fn().mockResolvedValue([]),
  sendModerationLog: vi.fn().mockResolvedValue(undefined),
  sendResponses: vi.fn().mockResolvedValue(undefined),
}));

import { warn } from '../../src/logger.js';
import { accumulateMessage, startTriage, stopTriage } from '../../src/modules/triage.js';
import { channelBuffers } from '../../src/modules/triage-buffer.js';
import { safeSend } from '../../src/utils/safeSend.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides = {}) {
  return {
    triage: {
      enabled: true,
      channels: [],
      excludeChannels: [],
      triggerWords: [],
      moderationKeywords: [],
      classifyModel: 'claude-haiku-4-5',
      classifyBudget: 0.05,
      respondModel: 'claude-sonnet-4-5',
      respondBudget: 0.2,
      tokenRecycleLimit: 20000,
      timeout: 30000,
      moderationResponse: true,
      defaultInterval: 0,
      dailyBudgetUsd: 10,
      ...(overrides.triage || {}),
    },
    ...(overrides.rest || {}),
  };
}

function makeClient() {
  return {
    channels: {
      fetch: vi.fn().mockResolvedValue({
        id: 'ch-budget',
        guildId: 'guild-test',
        sendTyping: vi.fn(),
        send: vi.fn(),
        messages: { fetch: vi.fn().mockResolvedValue(null) },
      }),
    },
    user: { id: 'bot-id' },
  };
}

function makeMessage(channelId = 'ch-budget', content = 'hello') {
  return {
    id: `msg-${Date.now()}`,
    content,
    channel: { id: channelId },
    guild: { id: 'guild-test' },
    author: { username: 'testuser', id: 'u1' },
    reference: null,
    react: vi.fn().mockResolvedValue(undefined),
  };
}

function mockClassifyResult(classification) {
  return {
    content: [{ type: 'text', text: JSON.stringify(classification) }],
    total_cost_usd: 0.001,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    model: 'claude-haiku-4-5',
    _durationMs: 100,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('triage budget gate', () => {
  let client;
  let config;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    client = makeClient();
    config = makeConfig();
    await startTriage(client, config);
    mockGlobalConfig = config;
    // Default: budget is fine (ok status)
    mockCheckGuildBudget.mockResolvedValue({ status: 'ok', spend: 2.0, budget: 10, pct: 0.2 });
  });

  afterEach(() => {
    stopTriage();
    vi.useRealTimers();
    channelBuffers.clear();
  });

  it('allows evaluation when spend is under 80% of budget', async () => {
    mockCheckGuildBudget.mockResolvedValue({ status: 'ok', spend: 2.0, budget: 10, pct: 0.2 });

    const classResult = {
      classification: 'ignore',
      reasoning: 'not relevant',
      targetMessageIds: [],
    };
    mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

    const msg = makeMessage();
    await accumulateMessage(msg, config);
    await vi.runAllTimersAsync();

    // Classifier was called — evaluation was NOT blocked
    expect(mockClassifierSend).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('budget exceeded'),
      expect.anything(),
    );
  });

  it('logs warning and continues when spend is at 80%+ of budget', async () => {
    mockCheckGuildBudget.mockResolvedValue({
      status: 'warning',
      spend: 8.5,
      budget: 10,
      pct: 0.85,
    });

    const classResult = {
      classification: 'ignore',
      reasoning: 'ok',
      targetMessageIds: [],
    };
    mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

    const msg = makeMessage();
    await accumulateMessage(msg, config);
    await vi.runAllTimersAsync();

    // Warning logged
    expect(warn).toHaveBeenCalledWith(
      'Guild approaching daily AI budget limit',
      expect.objectContaining({ guildId: 'guild-test', pct: 85 }),
    );
    // Evaluation still runs
    expect(mockClassifierSend).toHaveBeenCalled();
  });

  it('blocks evaluation and logs warning when budget is exceeded', async () => {
    mockCheckGuildBudget.mockResolvedValue({
      status: 'exceeded',
      spend: 12.5,
      budget: 10,
      pct: 1.25,
    });

    const msg = makeMessage();
    await accumulateMessage(msg, config);
    await vi.runAllTimersAsync();

    // Classifier should NOT be called
    expect(mockClassifierSend).not.toHaveBeenCalled();
    // Warning logged
    expect(warn).toHaveBeenCalledWith(
      'Guild daily AI budget exceeded — skipping triage evaluation',
      expect.objectContaining({ guildId: 'guild-test', spend: 12.5 }),
    );
  });

  it('sends alert to moderation log channel when budget exceeded', async () => {
    mockCheckGuildBudget.mockResolvedValue({
      status: 'exceeded',
      spend: 10.5,
      budget: 10,
      pct: 1.05,
    });

    const configWithLog = makeConfig({
      triage: { moderationLogChannel: 'log-ch-999' },
    });
    stopTriage();
    await startTriage(client, configWithLog);
    mockGlobalConfig = configWithLog;

    const msg = makeMessage();
    await accumulateMessage(msg, configWithLog);
    await vi.runAllTimersAsync();
    // Allow fire-and-forget promises to settle
    await vi.runAllTimersAsync();

    // safeSend should have been called with the alert message
    expect(safeSend).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('AI spend cap reached'),
    );
  });

  it('skips budget check when dailyBudgetUsd is not configured', async () => {
    const noBudgetConfig = makeConfig({ triage: { dailyBudgetUsd: undefined } });
    stopTriage();
    await startTriage(client, noBudgetConfig);
    mockGlobalConfig = noBudgetConfig;

    const classResult = {
      classification: 'ignore',
      reasoning: 'ok',
      targetMessageIds: [],
    };
    mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

    const msg = makeMessage();
    await accumulateMessage(msg, noBudgetConfig);
    await vi.runAllTimersAsync();

    // checkGuildBudget should not be called when not configured
    expect(mockCheckGuildBudget).not.toHaveBeenCalled();
    // Evaluation still runs
    expect(mockClassifierSend).toHaveBeenCalled();
  });

  it('skips budget check when dailyBudgetUsd is 0', async () => {
    const zeroBudgetConfig = makeConfig({ triage: { dailyBudgetUsd: 0 } });
    stopTriage();
    await startTriage(client, zeroBudgetConfig);
    mockGlobalConfig = zeroBudgetConfig;

    const classResult = {
      classification: 'ignore',
      reasoning: 'ok',
      targetMessageIds: [],
    };
    mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

    const msg = makeMessage();
    await accumulateMessage(msg, zeroBudgetConfig);
    await vi.runAllTimersAsync();

    expect(mockCheckGuildBudget).not.toHaveBeenCalled();
    expect(mockClassifierSend).toHaveBeenCalled();
  });

  it('allows evaluation when budget check throws (non-fatal)', async () => {
    mockCheckGuildBudget.mockRejectedValue(new Error('DB connection refused'));

    const classResult = {
      classification: 'ignore',
      reasoning: 'ok',
      targetMessageIds: [],
    };
    mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

    const msg = makeMessage();
    await accumulateMessage(msg, config);
    await vi.runAllTimersAsync();

    // Should log debug (non-fatal) and proceed with evaluation
    expect(mockClassifierSend).toHaveBeenCalled();
  });

  it('calls checkGuildBudget with correct guildId and budget', async () => {
    mockCheckGuildBudget.mockResolvedValue({ status: 'ok', spend: 1.0, budget: 10, pct: 0.1 });

    const classResult = {
      classification: 'ignore',
      reasoning: 'ok',
      targetMessageIds: [],
    };
    mockClassifierSend.mockResolvedValue(mockClassifyResult(classResult));

    const msg = makeMessage();
    await accumulateMessage(msg, config);
    await vi.runAllTimersAsync();

    expect(mockCheckGuildBudget).toHaveBeenCalledWith('guild-test', 10);
  });
});
