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
  checkEscalation: vi.fn().mockResolvedValue(null),
  createCase: vi.fn().mockResolvedValue({ id: 1, caseNumber: 42 }),
  sendDmNotification: vi.fn().mockResolvedValue(undefined),
  sendModLogEmbed: vi.fn().mockResolvedValue(null),
  shouldSendDm: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/modules/warningEngine.js', () => ({
  createWarning: vi.fn().mockResolvedValue({ id: 10, severity: 'low', points: 1 }),
}));

const { mockGenerate, mockGetPool, mockPool } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  mockGetPool: vi.fn(),
  mockPool: { query: vi.fn() },
}));

vi.mock('../../src/db.js', () => ({
  getPool: (...args) => mockGetPool(...args),
}));

vi.mock('../../src/utils/aiClient.js', () => ({
  generate: (...args) => mockGenerate(...args),
  stream: vi.fn(),
}));

vi.mock('../../src/modules/auditLogger.js', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
import { analyzeMessage, checkAiAutoMod, getAiAutoModConfig } from '../../src/modules/aiAutoMod.js';
import { logAuditEvent } from '../../src/modules/auditLogger.js';
import {
  checkEscalation,
  createCase,
  sendDmNotification,
  sendModLogEmbed,
  shouldSendDm,
} from '../../src/modules/moderation.js';
import { createWarning } from '../../src/modules/warningEngine.js';
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
    expect(cfg.actions.toxicity).toEqual(['flag']);
    expect(cfg.actions.spam).toEqual(['delete']);
    expect(cfg.actions.harassment).toEqual(['warn']);
  });

  it('merges guild overrides onto defaults and normalizes legacy single actions', () => {
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
    expect(cfg.actions.spam).toEqual(['ban']);
    expect(cfg.actions.toxicity).toEqual(['flag']); // default preserved
  });

  it('falls back to the default model when guild config references an unsupported detection model', () => {
    const cfg = getAiAutoModConfig({
      aiAutoMod: {
        model: 'anthropic:claude-3-5-haiku',
      },
    });

    expect(cfg.model).toBe('minimax:MiniMax-M2.7');
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

  it('collects every configured action from triggered categories and keeps a primary summary action', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.95, harassment: 0.8 }),
    );
    const cfg = getAiAutoModConfig({
      aiAutoMod: {
        actions: { toxicity: ['warn', 'delete'], spam: ['timeout'], harassment: ['kick'] },
      },
    });
    const result = await analyzeMessage('very bad message', cfg);
    expect(result.flagged).toBe(true);
    // kick (priority 4) > timeout (priority 3) > warn (priority 2)
    expect(result.action).toBe('kick');
    expect(result.actions).toEqual(['warn', 'delete', 'timeout', 'kick']);
    expect(result.actionsByCategory).toMatchObject({
      toxicity: ['warn', 'delete'],
      spam: ['timeout'],
      harassment: ['kick'],
    });
  });

  it('uses the configured model for moderation scoring', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.2, harassment: 0.1 }),
    );
    const cfg = getAiAutoModConfig({
      aiAutoMod: {
        model: 'moonshot:kimi-k2.6',
      },
    });

    await analyzeMessage('normal message with enough content', cfg);

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'moonshot:kimi-k2.6',
      }),
    );
  });

  it('flags expanded policy categories when scores meet configured thresholds', async () => {
    mockGenerate.mockResolvedValue({
      text: JSON.stringify({
        toxicity: 0.1,
        spam: 0.1,
        harassment: 0.1,
        hateSpeech: 0.92,
        sexualContent: 0.2,
        violence: 0.1,
        selfHarm: 0.1,
        reason: 'hate speech',
      }),
      costUsd: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
      finishReason: 'stop',
      sources: [],
      providerMetadata: {},
    });
    const cfg = getAiAutoModConfig({
      aiAutoMod: {
        thresholds: { hateSpeech: 0.9 },
        actions: { hateSpeech: 'ban' },
      },
    });

    const result = await analyzeMessage('targeted hateful message content here', cfg);

    expect(result.flagged).toBe(true);
    expect(result.categories).toEqual(['hateSpeech']);
    expect(result.scores.hateSpeech).toBe(0.92);
    expect(result.action).toBe('ban');
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
    mockGetPool.mockReturnValue(mockPool);
    mockPool.query.mockReset();
    vi.mocked(isExempt).mockReturnValue(false);
    vi.mocked(createCase).mockResolvedValue({
      id: 1,
      case_number: 42,
      guild_id: 'guild-1',
      action: 'warn',
      target_id: 'user-1',
      target_tag: 'user#0001',
      moderator_id: 'bot-1',
      moderator_tag: 'Bot#0001',
      reason: 'AI Auto-Mod: harassment — harassment',
    });
    vi.mocked(createWarning).mockResolvedValue({ id: 10, severity: 'low', points: 1 });
    vi.mocked(checkEscalation).mockResolvedValue(null);
    vi.mocked(sendDmNotification).mockResolvedValue(undefined);
    vi.mocked(sendModLogEmbed).mockResolvedValue(null);
    vi.mocked(shouldSendDm).mockReturnValue(true);
    vi.mocked(logAuditEvent).mockResolvedValue(undefined);
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

  it('records warning details, DMs the user, logs the case, and checks escalation for warn actions', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.1, harassment: 0.9, reason: 'harassment' }),
    );
    const guildConfig = {
      moderation: {
        dmNotifications: { warn: true },
        warnings: { expiryDays: 90, severityPoints: { low: 1, medium: 2, high: 3 } },
        escalation: { enabled: true, thresholds: [] },
      },
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

    expect(result).toMatchObject({ flagged: true, action: 'warn' });
    expect(shouldSendDm).toHaveBeenCalledWith(guildConfig, 'warn');
    expect(sendDmNotification).toHaveBeenCalledWith(
      message.member,
      'warn',
      'AI Auto-Mod: harassment — harassment',
      'guild-1',
    );
    expect(createWarning).toHaveBeenCalledWith(
      'guild-1',
      expect.objectContaining({
        userId: 'user-1',
        moderatorId: 'bot-1',
        moderatorTag: 'Bot#0001',
        severity: 'low',
        caseId: 1,
      }),
      guildConfig,
    );
    expect(sendModLogEmbed).toHaveBeenCalledWith(
      client,
      guildConfig,
      expect.objectContaining({ id: 1 }),
    );
    expect(checkEscalation).toHaveBeenCalledWith(
      client,
      'guild-1',
      'user-1',
      'bot-1',
      'Bot#0001',
      guildConfig,
    );
  });

  it('executes every configured action for the triggered violation', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = {
      moderation: {
        dmNotifications: { warn: true },
        warnings: { expiryDays: 90, severityPoints: { low: 1, medium: 2, high: 3 } },
        escalation: { enabled: true, thresholds: [] },
      },
      aiAutoMod: {
        enabled: true,
        model: 'minimax:MiniMax-M2.7',
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: ['delete', 'warn', 'timeout'], spam: [], harassment: [] },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
        timeoutDurationMs: 300000,
      },
    };

    const result = await checkAiAutoMod(message, client, guildConfig);

    expect(result).toMatchObject({
      flagged: true,
      action: 'timeout',
      actions: ['delete', 'warn', 'timeout'],
    });
    expect(message.delete).toHaveBeenCalledTimes(1);
    expect(sendDmNotification).toHaveBeenCalledWith(
      message.member,
      'warn',
      'AI Auto-Mod: toxicity — toxic',
      'guild-1',
    );
    expect(createWarning).toHaveBeenCalledWith(
      'guild-1',
      expect.objectContaining({ userId: 'user-1', caseId: 1 }),
      guildConfig,
    );
    expect(message.member.timeout).toHaveBeenCalledWith(300000, 'AI Auto-Mod: toxicity — toxic');
    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ action: 'ai_automod.delete' }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ action: 'ai_automod.warn' }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ action: 'ai_automod.timeout' }),
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

  it.each([
    ['none', 'ai_automod.none'],
    ['flag', 'ai_automod.flag'],
    ['delete', 'ai_automod.delete'],
    ['warn', 'ai_automod.warn'],
    ['timeout', 'ai_automod.timeout'],
    ['kick', 'ai_automod.kick'],
    ['ban', 'ai_automod.ban'],
  ])('writes an audit log entry for %s AI auto-mod actions', async (configuredAction, auditAction) => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = {
      moderation: {
        dmNotifications: { warn: true },
        warnings: { expiryDays: 90, severityPoints: { low: 1, medium: 2, high: 3 } },
        escalation: { enabled: true, thresholds: [] },
      },
      aiAutoMod: {
        enabled: true,
        model: 'minimax:MiniMax-M2.7',
        thresholds: { toxicity: 0.7, spam: 0.8, harassment: 0.7 },
        actions: { toxicity: configuredAction, spam: 'delete', harassment: 'warn' },
        autoDelete: false,
        flagChannelId: null,
        exemptRoleIds: [],
        timeoutDurationMs: 300000,
      },
    };

    await checkAiAutoMod(message, client, guildConfig);

    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        guildId: 'guild-1',
        userId: 'bot-1',
        userTag: 'Bot#0001',
        action: auditAction,
        targetType: 'member',
        targetId: 'user-1',
        targetTag: 'user#0001',
        details: expect.objectContaining({
          source: 'ai_auto_mod',
          action: configuredAction,
          model: 'minimax:MiniMax-M2.7',
          messageId: 'msg-123',
          channelId: 'chan-1',
          messageUrl: 'https://discord.com/channels/1/2/3',
          categories: ['toxicity'],
          reason: 'AI Auto-Mod: toxicity — toxic',
          scores: expect.objectContaining({ toxicity: 0.9 }),
          thresholds: expect.objectContaining({ toxicity: 0.7 }),
        }),
      }),
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
