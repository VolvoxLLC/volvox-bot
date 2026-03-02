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

// Anthropic mock: use a module-level variable accessed via closure
let _mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    constructor() {
      this.messages = { create: (...args) => _mockCreate(...args) };
    }
  }
  return { default: MockAnthropic };
});

// Import after mocks
import {
  analyzeMessage,
  checkAiAutoMod,
  getAiAutoModConfig,
  resetClient,
} from '../../src/modules/aiAutoMod.js';
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
    content: [
      {
        text: JSON.stringify({
          toxicity: scores.toxicity ?? 0,
          spam: scores.spam ?? 0,
          harassment: scores.harassment ?? 0,
          reason: scores.reason ?? 'test reason',
        }),
      },
    ],
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
    resetClient();
    _mockCreate = vi.fn();
  });

  it('returns clean result for short messages', async () => {
    const result = await analyzeMessage('hi', {});
    expect(result.flagged).toBe(false);
    expect(result.categories).toHaveLength(0);
    expect(_mockCreate).not.toHaveBeenCalled();
  });

  it('returns clean result when scores are below thresholds', async () => {
    _mockCreate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.2, harassment: 0.1 }),
    );
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('this is a normal message', cfg);
    expect(result.flagged).toBe(false);
    expect(result.categories).toHaveLength(0);
    expect(result.action).toBe('none');
  });

  it('flags toxicity when score exceeds threshold', async () => {
    _mockCreate.mockResolvedValue(
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
    _mockCreate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.95, harassment: 0.1, reason: 'ad spam' }),
    );
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('buy crypto now get rich!!!', cfg);
    expect(result.flagged).toBe(true);
    expect(result.categories).toContain('spam');
  });

  it('picks most severe action from multiple triggered categories', async () => {
    _mockCreate.mockResolvedValue(
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
    _mockCreate.mockResolvedValue({
      content: [{ text: 'oops not json at all' }],
    });
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('some content here', cfg);
    expect(result.flagged).toBe(false);
    expect(result.action).toBe('none');
  });

  it('handles Claude API errors by throwing', async () => {
    _mockCreate.mockRejectedValue(new Error('Rate limited'));
    const cfg = getAiAutoModConfig({});
    await expect(analyzeMessage('test content here', cfg)).rejects.toThrow('Rate limited');
  });

  it('clamps scores to [0, 1]', async () => {
    _mockCreate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 1.5, spam: -0.3, harassment: 0.8 }),
    );
    const cfg = getAiAutoModConfig({});
    const result = await analyzeMessage('some message text here', cfg);
    expect(result.scores.toxicity).toBe(1);
    expect(result.scores.spam).toBe(0);
  });

  it('extracts JSON from markdown code blocks', async () => {
    _mockCreate.mockResolvedValue({
      content: [
        {
          text: '```json\n{"toxicity": 0.8, "spam": 0.1, "harassment": 0.1, "reason": "hateful"}\n```',
        },
      ],
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
    resetClient();
    _mockCreate = vi.fn();
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
    expect(_mockCreate).not.toHaveBeenCalled();
  });

  it('returns not flagged when aiAutoMod config is missing', async () => {
    const result = await checkAiAutoMod(message, client, {});
    expect(result.flagged).toBe(false);
  });

  it('returns not flagged for bot messages', async () => {
    message.author.bot = true;
    const result = await checkAiAutoMod(message, client, { aiAutoMod: { enabled: true } });
    expect(result.flagged).toBe(false);
    expect(_mockCreate).not.toHaveBeenCalled();
  });

  it('returns not flagged for exempt users', async () => {
    vi.mocked(isExempt).mockReturnValue(true);
    _mockCreate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.9, harassment: 0.9 }),
    );
    const result = await checkAiAutoMod(message, client, { aiAutoMod: { enabled: true } });
    expect(result.flagged).toBe(false);
    expect(_mockCreate).not.toHaveBeenCalled();
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
    expect(_mockCreate).not.toHaveBeenCalled();
  });

  it('flags and deletes message when action is delete', async () => {
    _mockCreate.mockResolvedValue(
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
    _mockCreate.mockResolvedValue(
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
    _mockCreate.mockResolvedValue(
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
    _mockCreate.mockResolvedValue(
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
    _mockCreate.mockResolvedValue(
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
    _mockCreate.mockRejectedValue(new Error('API error'));
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
    _mockCreate.mockResolvedValue(
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
    _mockCreate.mockResolvedValue(
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
});
