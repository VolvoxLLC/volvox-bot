import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (must be set up before imports) ---

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/utils/discordCache.js', () => ({
  fetchChannelCached: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/modExempt.js', () => ({
  isExempt: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/modules/moderation.js', () => ({
  createCase: vi.fn().mockResolvedValue({ id: 1, caseNumber: 42 }),
}));

const { mockGenerate } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
}));
vi.mock('../../src/utils/aiClient.js', () => ({
  generate: (...args) => mockGenerate(...args),
  stream: vi.fn(),
}));

// Import after mocks
import { analyzeMessage, checkAiAutoMod, getAiAutoModConfig } from '../../src/modules/aiAutoMod.js';
import { createCase } from '../../src/modules/moderation.js';
import { isExempt } from '../../src/utils/modExempt.js';

// --- Helpers ---

function makeMessage(overrides = {}) {
  return {
    id: 'msg-123',
    content: 'Hello world',
    url: 'https://discord.com/channels/1/2/3',
    author: { id: 'user-1', tag: 'user#0001', bot: false },
    member: {
      user: { id: 'user-1', tag: 'user#0001' },
      roles: {
        cache: {
          has: vi.fn().mockReturnValue(false),
          some: vi.fn().mockReturnValue(false),
          set: vi.fn(),
        },
      },
      timeout: vi.fn().mockResolvedValue(undefined),
      kick: vi.fn().mockResolvedValue(undefined),
    },
    guild: {
      id: 'guild-1',
      members: { ban: vi.fn().mockResolvedValue(undefined) },
    },
    channel: { id: 'chan-1' },
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeClient() {
  return {
    user: { id: 'bot-1', tag: 'Bot#0001' },
    channels: { cache: new Map() },
  };
}

function makeClaudeResponse(scores) {
  return {
    text: JSON.stringify({
      toxicity: scores.toxicity ?? 0,
      spam: scores.spam ?? 0,
      harassment: scores.harassment ?? 0,
      reason: scores.reason ?? 'test reason',
    }),
    costUsd: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    durationMs: 0,
    finishReason: 'stop',
    sources: [],
    providerMetadata: {},
  };
}

// --- Tests ---

describe('getAiAutoModConfig', () => {
  it('returns defaults when config has no aiAutoMod', () => {
    const cfg = getAiAutoModConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.thresholds.toxicity).toBe(0.7);
    expect(cfg.thresholds.spam).toBe(0.8);
    expect(cfg.thresholds.harassment).toBe(0.7);
    expect(cfg.actions.toxicity).toBe('flag');
    expect(cfg.actions.spam).toBe('delete');
    expect(cfg.actions.harassment).toBe('warn');
  });

  it('merges guild overrides onto defaults', () => {
    const cfg = getAiAutoModConfig({
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.9 },
        actions: { spam: 'ban' },
      },
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.thresholds.toxicity).toBe(0.9);
    expect(cfg.thresholds.spam).toBe(0.8); // default preserved
    expect(cfg.actions.spam).toBe('ban');
    expect(cfg.actions.toxicity).toBe('flag'); // default preserved
  });
});

describe('analyzeMessage', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
  });

  it('returns clean result for short messages', async () => {
    const result = await analyzeMessage('hi', {});
    expect(result.flagged).toBe(false);
    expect(result.categories).toHaveLength(0);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('returns clean result when scores are below thresholds', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.2, harassment: 0.1 }),
    );
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('this is a normal message', cfg);
    expect(result.flagged).toBe(false);
    expect(result.categories).toHaveLength(0);
    expect(result.action).toBe('none');
  });

  it('flags toxicity when score exceeds threshold', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'hate speech' }),
    );
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('offensive content here', cfg);
    expect(result.flagged).toBe(true);
    expect(result.categories).toContain('toxicity');
    expect(result.scores.toxicity).toBe(0.9);
    expect(result.reason).toBe('hate speech');
  });

  it('flags spam when score exceeds threshold', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.95, harassment: 0.1, reason: 'ad spam' }),
    );
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('buy crypto now get rich!!!', cfg);
    expect(result.flagged).toBe(true);
    expect(result.categories).toContain('spam');
  });

  it('picks most severe action from multiple triggered categories', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.95, harassment: 0.8 }),
    );
    const cfg = getAiAutoModConfig({
      aiAutoMod: {
        actions: { toxicity: 'warn', spam: 'timeout', harassment: 'kick' },
      },
    });
    const result = await analyzeMessage('very bad message', cfg);
    expect(result.flagged).toBe(true);
    // kick (priority 4) > timeout (priority 3) > warn (priority 2)
    expect(result.action).toBe('kick');
  });

  it('handles malformed JSON from Claude gracefully', async () => {
    mockGenerate.mockResolvedValue({
      text: 'oops not json at all',
      costUsd: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
      finishReason: 'stop',
      sources: [],
      providerMetadata: {},
    });
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('some content here', cfg);
    expect(result.flagged).toBe(false);
    expect(result.action).toBe('none');
  });

  it('handles Claude API errors by throwing', async () => {
    mockGenerate.mockRejectedValue(new Error('Rate limited'));
    const cfg = getAiAutoModConfig({});
    await expect(analyzeMessage('test content here', cfg)).rejects.toThrow('Rate limited');
  });

  it('clamps scores to [0, 1]', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 1.5, spam: -0.3, harassment: 0.8 }),
    );
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('some message text here', cfg);
    expect(result.scores.toxicity).toBe(1);
    expect(result.scores.spam).toBe(0);
  });

  it('extracts JSON from markdown code blocks', async () => {
    mockGenerate.mockResolvedValue({
      text: '```json\n{"toxicity": 0.8, "spam": 0.1, "harassment": 0.1, "reason": "hateful"}\n```',
      costUsd: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
      finishReason: 'stop',
      sources: [],
      providerMetadata: {},
    });
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('bad message content here', cfg);
    expect(result.scores.toxicity).toBe(0.8);
    expect(result.flagged).toBe(true);
  });
});

describe('checkAiAutoMod', () => {
  let message;
  let client;

  beforeEach(() => {
    mockGenerate.mockReset();
    vi.mocked(isExempt).mockReturnValue(false);
    vi.mocked(createCase).mockResolvedValue({ id: 1, caseNumber: 42 });
    message = makeMessage();
    client = makeClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns not flagged when aiAutoMod is disabled', async () => {
    const result = await checkAiAutoMod(message, client, { aiAutoMod: { enabled: false } });
    expect(result.flagged).toBe(false);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('returns not flagged when aiAutoMod config is missing', async () => {
    const result = await checkAiAutoMod(message, client, {});
    expect(result.flagged).toBe(false);
  });

  it('returns not flagged for bot messages', async () => {
    message.author.bot = true;
    const result = await checkAiAutoMod(message, client, { aiAutoMod: { enabled: true } });
    expect(result.flagged).toBe(false);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('returns not flagged for exempt users', async () => {
    vi.mocked(isExempt).mockReturnValue(true);
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.9, harassment: 0.9 }),
    );
    const result = await checkAiAutoMod(message, client, { aiAutoMod: { enabled: true } });
    expect(result.flagged).toBe(false);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('returns not flagged for empty messages', async () => {
    message.content = '';
    const result = await checkAiAutoMod(message, client, { aiAutoMod: { enabled: true } });
    expect(result.flagged).toBe(false);
  });

  it('returns not flagged for users with exempt roles', async () => {
    const exemptRoleId = 'exempt-role-1';
    // Mock roles.cache.some to return true (simulating the user having the exempt role)
    message.member.roles.cache.some = vi.fn().mockReturnValue(true);
    const result = await checkAiAutoMod(message, client, {
      aiAutoMod: { enabled: true, exemptRoleIds: [exemptRoleId] },
    });
    expect(result.flagged).toBe(false);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('flags and deletes message when action is delete', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.95, harassment: 0.1, reason: 'spam' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'flag', spam: 'delete', harassment: 'warn' },
        autoDelete: true,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('delete');
    expect(message.delete).toHaveBeenCalled();
  });

  it('creates a warn case when action is warn', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.1, harassment: 0.9, reason: 'harassment' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'flag', spam: 'delete', harassment: 'warn' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('warn');
    expect(createCase).toHaveBeenCalledWith(
      'guild-1',
      expect.objectContaining({ action: 'warn', targetId: 'user-1' }),
    );
  });

  it('times out member when action is timeout', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'timeout', spam: 'delete', harassment: 'warn' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
        timeoutDurationMs: 300000,
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('timeout');
    expect(message.member.timeout).toHaveBeenCalledWith(300000, expect.any(String));
  });

  it('kicks member when action is kick', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'kick', spam: 'delete', harassment: 'warn' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('kick');
    expect(message.member.kick).toHaveBeenCalledWith(expect.any(String));
  });

  it('bans member when action is ban', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.95, spam: 0.1, harassment: 0.1, reason: 'severe' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'ban', spam: 'delete', harassment: 'warn' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('ban');
    expect(message.guild.members.ban).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ reason: expect.any(String) }),
    );
  });

  it('fails open when Claude throws', async () => {
    mockGenerate.mockRejectedValue(new Error('API error'));
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'ban', spam: 'ban', harassment: 'ban' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(false);
    expect(message.member.kick).not.toHaveBeenCalled();
  });

  it('returns categories in flagged result', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.9, harassment: 0.9, reason: 'everything bad' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'flag', spam: 'flag', harassment: 'flag' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.categories).toContain('toxicity');
    expect(result.categories).toContain('spam');
    expect(result.categories).toContain('harassment');
  });

  it('deletes message when action is delete and autoDelete is false', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.95, harassment: 0.1, reason: 'spam' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'flag', spam: 'delete', harassment: 'warn' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('delete');
    // Message should be deleted even though autoDelete is false —
    // the explicit 'delete' action enforces deletion independently.
    expect(message.delete).toHaveBeenCalled();
  });

  it('should still run explicit delete action when autoDelete=true', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.95, harassment: 0.1, reason: 'spam' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'flag', spam: 'delete', harassment: 'warn' },
        autoDelete: true,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('delete');
    // autoDelete deletes once before the switch, and the explicit delete action
    // should still run its own delete attempt.
    expect(message.delete).toHaveBeenCalledTimes(2);
  });

  it('should send flag embed to flagChannelId when configured', async () => {
    const { fetchChannelCached } = await import('../../src/utils/discordCache.js');
    const { safeSend } = await import('../../src/utils/safeSend.js');

    const mockFlagChannel = { id: 'flag-channel-1', send: vi.fn().mockResolvedValue(undefined) };
    fetchChannelCached.mockResolvedValue(mockFlagChannel);

    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic content' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'flag', spam: 'delete', harassment: 'warn' },
        autoDelete: false,
        flagChannelId: 'flag-channel-1',
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);

    // fetchChannelCached should have been called with the flagChannelId
    expect(fetchChannelCached).toHaveBeenCalledWith(client, 'flag-channel-1', 'guild-1');

    // safeSend should have been called with the flag channel and an embed
    expect(safeSend).toHaveBeenCalledWith(
      mockFlagChannel,
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });
});

describe('getAiAutoModConfig — PR simplified defaults (3 categories, string actions)', () => {
  it('returns exactly 3 threshold categories', () => {
    const cfg = getAiAutoModConfig({});
    expect(Object.keys(cfg.thresholds)).toEqual(['toxicity', 'spam', 'harassment']);
  });

  it('returns string actions, not arrays', () => {
    const cfg = getAiAutoModConfig({});
    expect(typeof cfg.actions.toxicity).toBe('string');
    expect(typeof cfg.actions.spam).toBe('string');
    expect(typeof cfg.actions.harassment).toBe('string');
  });

  it('no longer includes hateSpeech, sexualContent, violence, selfHarm thresholds', () => {
    const cfg = getAiAutoModConfig({});
    expect(cfg.thresholds).not.toHaveProperty('hateSpeech');
    expect(cfg.thresholds).not.toHaveProperty('sexualContent');
    expect(cfg.thresholds).not.toHaveProperty('violence');
    expect(cfg.thresholds).not.toHaveProperty('selfHarm');
  });

  it('uses hardcoded minimax model as default', () => {
    const cfg = getAiAutoModConfig({});
    expect(cfg.model).toBe('minimax:MiniMax-M2.7');
  });

  it('does not normalize model string via normalizeSupportedAiModel', () => {
    // normalizeSupportedAiModel was removed from the module; model should be taken as-is
    const cfg = getAiAutoModConfig({ aiAutoMod: { enabled: true, model: 'custom:model-v1' } });
    expect(cfg.model).toBe('custom:model-v1');
  });
});

describe('analyzeMessage — simplified 3-category scoring', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
  });

  it('returns exactly 3 score keys', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.1, harassment: 0.1 }),
    );
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('test message content here', cfg);
    expect(Object.keys(result.scores)).toEqual(['toxicity', 'spam', 'harassment']);
  });

  it('result does not have actions array or actionsByCategory (removed in PR)', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.9, harassment: 0.9 }),
    );
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('flagged content here', cfg);
    expect(result).not.toHaveProperty('actions');
    expect(result).not.toHaveProperty('actionsByCategory');
  });

  it('uses default fallback reason when parsed.reason is missing', async () => {
    mockGenerate.mockResolvedValue({
      text: JSON.stringify({ toxicity: 0.9, spam: 0.1, harassment: 0.1 }),
      costUsd: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
      finishReason: 'stop',
      sources: [],
      providerMetadata: {},
    });
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('offensive content here', cfg);
    expect(result.reason).toBe('No reason provided');
  });

  it('handles empty JSON object response gracefully', async () => {
    mockGenerate.mockResolvedValue({
      text: '{}',
      costUsd: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
      finishReason: 'stop',
      sources: [],
      providerMetadata: {},
    });
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('some message text here', cfg);
    expect(result.flagged).toBe(false);
    expect(result.scores.toxicity).toBe(0);
    expect(result.scores.spam).toBe(0);
    expect(result.scores.harassment).toBe(0);
  });

  it('action priority: delete and warn have equal priority (2); first encountered wins', async () => {
    // toxicity -> warn (priority 2), spam -> delete (priority 2)
    // toxicity comes first in triggeredCategories, so if both equal, the LATER category
    // with higher or equal priority replaces.
    // Priority tie: (actionPriority[categoryAction] > actionPriority[action]) — strict >
    // So 'warn' is set first, then 'delete' ties (2 > 2 = false), so 'warn' remains?
    // Actually looking at code: if (priority > current), so tie does NOT replace.
    // toxicity fires first -> action='warn'. spam fires next -> delete priority 2 > warn priority 2 is false -> warn remains
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.95, harassment: 0.1 }),
    );
    const cfg = getAiAutoModConfig({
      aiAutoMod: {
        actions: { toxicity: 'warn', spam: 'delete', harassment: 'flag' },
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
      },
    });
    const result = await analyzeMessage('very bad message here', cfg);
    expect(result.flagged).toBe(true);
    // toxicity triggers first with 'warn' (priority 2); spam 'delete' is also priority 2
    // strict > comparison means tie does not overwrite, so 'warn' should remain
    expect(result.action).toBe('warn');
  });

  it('ban (priority 5) wins over all others', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.95, harassment: 0.9 }),
    );
    const cfg = getAiAutoModConfig({
      aiAutoMod: {
        actions: { toxicity: 'flag', spam: 'warn', harassment: 'ban' },
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
      },
    });
    const result = await analyzeMessage('terrible content', cfg);
    expect(result.action).toBe('ban');
  });

  it('treats null/NaN score values as 0', async () => {
    mockGenerate.mockResolvedValue({
      text: JSON.stringify({ toxicity: null, spam: 'not-a-number', harassment: 0.8 }),
      costUsd: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
      finishReason: 'stop',
      sources: [],
      providerMetadata: {},
    });
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('some content here test', cfg);
    expect(result.scores.toxicity).toBe(0);
    expect(result.scores.spam).toBe(0);
    expect(result.scores.harassment).toBe(0.8);
  });
});

describe('checkAiAutoMod — PR simplified executeAction', () => {
  let message;
  let client;

  beforeEach(() => {
    mockGenerate.mockReset();
    vi.mocked(isExempt).mockReturnValue(false);
    vi.mocked(createCase).mockResolvedValue({ id: 1, caseNumber: 42 });
    message = makeMessage();
    client = makeClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('result does not have actions array (removed in PR)', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.9, harassment: 0.9 }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'flag', spam: 'flag', harassment: 'flag' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result).not.toHaveProperty('actions');
  });

  it('skips warn/timeout/kick/ban when member is null', async () => {
    const messageNoMember = makeMessage({ member: null });
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'warn', spam: 'delete', harassment: 'kick' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    // Should not throw; member checks prevent action execution
    const result = await checkAiAutoMod(messageNoMember, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('warn');
    expect(createCase).not.toHaveBeenCalled();
  });

  it('skips guild actions when guild is null', async () => {
    const messageNoGuild = makeMessage({ guild: null });
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.95, spam: 0.1, harassment: 0.1, reason: 'severe' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'ban', spam: 'delete', harassment: 'warn' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    // Should not throw or crash
    const result = await checkAiAutoMod(messageNoGuild, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(createCase).not.toHaveBeenCalled();
  });

  it('silently skips flag embed when flagChannelId is null', async () => {
    const { safeSend } = await import('../../src/utils/safeSend.js');
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'flag', spam: 'delete', harassment: 'warn' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(safeSend).not.toHaveBeenCalled();
  });

  it('autoDelete deletes message before executing the action', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'warn', spam: 'delete', harassment: 'warn' },
        autoDelete: true,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('warn');
    // autoDelete: true causes delete before the warn action
    expect(message.delete).toHaveBeenCalled();
    expect(createCase).toHaveBeenCalledWith(
      'guild-1',
      expect.objectContaining({ action: 'warn' }),
    );
  });

  it('does not delete message when autoDelete is false and action is not delete', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'warn', spam: 'flag', harassment: 'flag' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
      },
    };
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('warn');
    expect(message.delete).not.toHaveBeenCalled();
  });

  it('timeout action uses timeoutDurationMs from config', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = {
      aiAutoMod: {
        enabled: true,
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: 'timeout', spam: 'delete', harassment: 'warn' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
        timeoutDurationMs: 60000,
      },
    };
    await checkAiAutoMod(message, client, guildConfig);
    expect(message.member.timeout).toHaveBeenCalledWith(60000, expect.any(String));
  });
});
