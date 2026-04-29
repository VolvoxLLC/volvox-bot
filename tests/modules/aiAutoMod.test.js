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
import { fetchChannelCached } from '../../src/utils/discordCache.js';
import { isExempt } from '../../src/utils/modExempt.js';
import { safeSend } from '../../src/utils/safeSend.js';
import { DEFAULT_AI_MODEL } from '../../src/utils/supportedAiModels.js';

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

const INVALID_AI_MODEL_SENTINEL = 'invalid-provider:not-a-real-model';
const defaultAiAutoModThresholds = { toxicity: 0.7, spam: 0.8, harassment: 0.7 };
const defaultAiAutoModActions = { toxicity: 'flag', spam: 'delete', harassment: 'warn' };
const moderationWarnConfig = {
  dmNotifications: { warn: true },
  warnings: { expiryDays: 90, severityPoints: { low: 1, medium: 2, high: 3 } },
  escalation: { enabled: true, thresholds: [] },
};

function makeAiAutoModGuildConfig(aiAutoModOverrides = {}, guildOverrides = {}) {
  const { thresholds = {}, actions = {}, ...restOverrides } = aiAutoModOverrides;

  return {
    ...guildOverrides,
    aiAutoMod: {
      enabled: true,
      thresholds: { ...defaultAiAutoModThresholds, ...thresholds },
      actions: { ...defaultAiAutoModActions, ...actions },
      autoDelete: false,
      flagChannelId: null,
      exemptRoleIds: [],
      ...restOverrides,
    },
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
        model: INVALID_AI_MODEL_SENTINEL,
      },
    });

    expect(cfg.model).toBe(DEFAULT_AI_MODEL);
  });

  it('normalizes duplicate, none, and unsupported action entries', () => {
    const cfg = getAiAutoModConfig({
      aiAutoMod: {
        actions: { toxicity: ['warn', 'none', 'warn', 'bogus', 'delete'], spam: [] },
      },
    });

    expect(cfg.actions.toxicity).toEqual(['warn', 'delete']);
    expect(cfg.actions.spam).toEqual([]);
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

  it('returns clean result when content is missing', async () => {
    const result = await analyzeMessage(null, {});
    expect(result.flagged).toBe(false);
    expect(result.reason).toBe('Message too short');
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

  it('supports snake_case score aliases for expanded policy categories', async () => {
    mockGenerate.mockResolvedValue({
      text: JSON.stringify({
        toxicity: 0.1,
        spam: 0.1,
        harassment: 0.1,
        hate_speech: 0.91,
        sexual_content: 0.89,
        self_harm: 0.8,
        reason: 'aliased categories',
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
        thresholds: { hateSpeech: 0.9, sexualContent: 0.8, selfHarm: 0.7 },
        actions: { hateSpeech: 'ban', sexualContent: 'delete', selfHarm: 'flag' },
      },
    });

    const result = await analyzeMessage('aliased moderation category content', cfg);

    expect(result.flagged).toBe(true);
    expect(result.categories).toEqual(['hateSpeech', 'sexualContent', 'selfHarm']);
    expect(result.scores).toMatchObject({ hateSpeech: 0.91, sexualContent: 0.89, selfHarm: 0.8 });
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

  it('handles invalid JSON objects from Claude gracefully', async () => {
    mockGenerate.mockResolvedValue({
      text: '{not valid json}',
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
    expect(result.reason).toBe('Parse error');
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
    vi.mocked(fetchChannelCached).mockResolvedValue(null);
    vi.mocked(safeSend).mockResolvedValue(undefined);
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

  it('continues moderation when configured exempt roles do not match member roles', async () => {
    message.member.roles.cache.some = vi.fn((predicate) => predicate({ id: 'member-role-1' }));
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const result = await checkAiAutoMod(
      message,
      client,
      makeAiAutoModGuildConfig({ exemptRoleIds: ['exempt-role-1'] }),
    );

    expect(result).toMatchObject({ flagged: true, action: 'flag' });
    expect(message.member.roles.cache.some).toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ action: 'ai_automod.flag' }),
    );
  });

  it('returns not flagged when enabled analysis scores stay below thresholds', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.2, harassment: 0.1, reason: 'clean' }),
    );
    const result = await checkAiAutoMod(message, client, makeAiAutoModGuildConfig());

    expect(result.flagged).toBe(false);
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(message.delete).not.toHaveBeenCalled();
  });

  it('handles configured exempt roles when the message has no member', async () => {
    message.member = null;
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const result = await checkAiAutoMod(
      message,
      client,
      makeAiAutoModGuildConfig({ exemptRoleIds: ['exempt-role-1'] }),
    );

    expect(result).toMatchObject({ flagged: true, action: 'flag' });
    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ action: 'ai_automod.flag' }),
    );
  });

  it('flags and deletes message when action is delete', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.95, harassment: 0.1, reason: 'spam' }),
    );
    const guildConfig = makeAiAutoModGuildConfig({ autoDelete: true });
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('delete');
    expect(message.delete).toHaveBeenCalled();
  });

  it('does not audit delete actions when Discord deletion fails', async () => {
    message.delete.mockRejectedValueOnce(new Error('Missing Permissions'));
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.95, harassment: 0.1, reason: 'spam' }),
    );
    const guildConfig = makeAiAutoModGuildConfig();

    const result = await checkAiAutoMod(message, client, guildConfig);

    expect(result).toMatchObject({ flagged: true, action: 'delete' });
    expect(message.delete).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('creates a warn case when action is warn', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.1, harassment: 0.9, reason: 'harassment' }),
    );
    const guildConfig = makeAiAutoModGuildConfig();
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
    const guildConfig = makeAiAutoModGuildConfig({}, { moderation: moderationWarnConfig });

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

  it('skips warn DM when DM notifications are disabled but continues warn pipeline', async () => {
    vi.mocked(shouldSendDm).mockReturnValueOnce(false);
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.1, harassment: 0.9, reason: 'harassment' }),
    );
    const guildConfig = makeAiAutoModGuildConfig(
      {},
      { moderation: { dmNotifications: { warn: false } } },
    );

    const result = await checkAiAutoMod(message, client, guildConfig);

    expect(result).toMatchObject({ flagged: true, action: 'warn' });
    expect(sendDmNotification).not.toHaveBeenCalled();
    expect(createWarning).toHaveBeenCalledWith(
      'guild-1',
      expect.objectContaining({ userId: 'user-1', caseId: 1 }),
      guildConfig,
    );
    expect(checkEscalation).toHaveBeenCalled();
  });

  it('does not create warn records when warn runs without a member or guild', async () => {
    message.member = null;
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.1, harassment: 0.9, reason: 'harassment' }),
    );
    const guildConfig = makeAiAutoModGuildConfig();

    const result = await checkAiAutoMod(message, client, guildConfig);

    expect(result).toMatchObject({ flagged: true, action: 'warn' });
    expect(createCase).not.toHaveBeenCalled();
    expect(sendDmNotification).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('does not DM or create warning records when warn case creation fails', async () => {
    vi.mocked(createCase).mockRejectedValueOnce(new Error('database unavailable'));
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.1, harassment: 0.9, reason: 'harassment' }),
    );
    const guildConfig = makeAiAutoModGuildConfig(
      {},
      { moderation: { dmNotifications: { warn: true } } },
    );

    const result = await checkAiAutoMod(message, client, guildConfig);

    expect(result).toMatchObject({ flagged: true, action: 'warn' });
    expect(sendDmNotification).not.toHaveBeenCalled();
    expect(createWarning).not.toHaveBeenCalled();
    expect(sendModLogEmbed).not.toHaveBeenCalled();
    expect(checkEscalation).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('continues warn persistence and escalation when warn DM notification fails', async () => {
    vi.mocked(sendDmNotification).mockRejectedValueOnce(new Error('Cannot send messages'));
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.1, harassment: 0.9, reason: 'harassment' }),
    );
    const guildConfig = makeAiAutoModGuildConfig({}, { moderation: moderationWarnConfig });

    const result = await checkAiAutoMod(message, client, guildConfig);

    expect(result).toMatchObject({ flagged: true, action: 'warn' });
    expect(sendDmNotification).toHaveBeenCalledTimes(1);
    expect(createWarning).toHaveBeenCalledWith(
      'guild-1',
      expect.objectContaining({ userId: 'user-1', caseId: 1 }),
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
    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ action: 'ai_automod.warn' }),
    );
  });

  it('skips warn DMs when disabled while preserving warning persistence and escalation', async () => {
    vi.mocked(shouldSendDm).mockReturnValue(false);
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.1, harassment: 0.9, reason: 'harassment' }),
    );
    const guildConfig = makeAiAutoModGuildConfig(
      {},
      { moderation: { ...moderationWarnConfig, dmNotifications: { warn: false } } },
    );

    const result = await checkAiAutoMod(message, client, guildConfig);

    expect(result).toMatchObject({ flagged: true, action: 'warn' });
    expect(sendDmNotification).not.toHaveBeenCalled();
    expect(createWarning).toHaveBeenCalledWith(
      'guild-1',
      expect.objectContaining({ userId: 'user-1', caseId: 1 }),
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
    const guildConfig = makeAiAutoModGuildConfig(
      {
        model: 'minimax:MiniMax-M2.7',
        actions: { toxicity: ['delete', 'warn', 'timeout'], spam: [], harassment: [] },
        timeoutDurationMs: 300000,
      },
      { moderation: moderationWarnConfig },
    );

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
    const guildConfig = makeAiAutoModGuildConfig({
      actions: { toxicity: 'timeout' },
      timeoutDurationMs: 300000,
    });
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('timeout');
    expect(message.member.timeout).toHaveBeenCalledWith(300000, expect.any(String));
  });

  it.each(['timeout', 'kick', 'ban'])(
    'audits %s actions when Discord moderation succeeds even if case creation fails',
    async (action) => {
      vi.mocked(createCase).mockRejectedValueOnce(new Error('database unavailable'));
      mockGenerate.mockResolvedValue(
        makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
      );
      const guildConfig = makeAiAutoModGuildConfig({
        actions: { toxicity: action },
        timeoutDurationMs: 300000,
      });

      const result = await checkAiAutoMod(message, client, guildConfig);

      expect(result).toMatchObject({ flagged: true, action });
      if (action === 'timeout') {
        expect(message.member.timeout).toHaveBeenCalledWith(300000, expect.any(String));
      } else if (action === 'kick') {
        expect(message.member.kick).toHaveBeenCalledWith(expect.any(String));
      } else {
        expect(message.guild.members.ban).toHaveBeenCalledWith(
          'user-1',
          expect.objectContaining({ reason: expect.any(String) }),
        );
      }
      expect(createCase).toHaveBeenCalledWith(
        'guild-1',
        expect.objectContaining({ action, targetId: 'user-1' }),
      );
      expect(logAuditEvent).toHaveBeenCalledWith(
        mockPool,
        expect.objectContaining({
          action: `ai_automod.${action}`,
          details: expect.objectContaining({
            action,
            caseId: null,
            caseNumber: null,
          }),
        }),
      );
    },
  );

  it.each(['timeout', 'kick', 'ban'])(
    'does not audit %s actions when Discord moderation fails',
    async (action) => {
      if (action === 'timeout') {
        message.member.timeout.mockRejectedValueOnce(new Error('Missing Permissions'));
      } else if (action === 'kick') {
        message.member.kick.mockRejectedValueOnce(new Error('Missing Permissions'));
      } else {
        message.guild.members.ban.mockRejectedValueOnce(new Error('Missing Permissions'));
      }
      mockGenerate.mockResolvedValue(
        makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
      );
      const guildConfig = makeAiAutoModGuildConfig({
        actions: { toxicity: action },
        timeoutDurationMs: 300000,
      });

      const result = await checkAiAutoMod(message, client, guildConfig);

      expect(result).toMatchObject({ flagged: true, action });
      if (action === 'timeout') {
        expect(message.member.timeout).toHaveBeenCalledWith(300000, expect.any(String));
      } else if (action === 'kick') {
        expect(message.member.kick).toHaveBeenCalledWith(expect.any(String));
      } else {
        expect(message.guild.members.ban).toHaveBeenCalledWith(
          'user-1',
          expect.objectContaining({ reason: expect.any(String) }),
        );
      }
      expect(createCase).not.toHaveBeenCalled();
      expect(logAuditEvent).not.toHaveBeenCalled();
    },
  );

  it('kicks member when action is kick', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = makeAiAutoModGuildConfig({ actions: { toxicity: 'kick' } });
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('kick');
    expect(message.member.kick).toHaveBeenCalledWith(expect.any(String));
  });

  it('bans member when action is ban', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.95, spam: 0.1, harassment: 0.1, reason: 'severe' }),
    );
    const guildConfig = makeAiAutoModGuildConfig({ actions: { toxicity: 'ban' } });
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
    const guildConfig = makeAiAutoModGuildConfig(
      {
        model: 'minimax:MiniMax-M2.7',
        actions: { toxicity: configuredAction },
        timeoutDurationMs: 300000,
      },
      { moderation: moderationWarnConfig },
    );

    await checkAiAutoMod(message, client, guildConfig);

    const expectedTarget = ['warn', 'timeout', 'kick', 'ban'].includes(configuredAction)
      ? { targetType: 'member', targetId: 'user-1', targetTag: 'user#0001' }
      : { targetType: 'message', targetId: 'msg-123', targetTag: 'user#0001' };

    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        guildId: 'guild-1',
        userId: 'bot-1',
        userTag: 'Bot#0001',
        action: auditAction,
        ...expectedTarget,
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
    const guildConfig = makeAiAutoModGuildConfig({
      actions: { toxicity: 'ban', spam: 'ban', harassment: 'ban' },
    });
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(false);
    expect(message.member.kick).not.toHaveBeenCalled();
  });

  it('returns categories in flagged result', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.9, harassment: 0.9, reason: 'everything bad' }),
    );
    const guildConfig = makeAiAutoModGuildConfig({ actions: { spam: 'flag', harassment: 'flag' } });
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.categories).toContain('toxicity');
    expect(result.categories).toContain('spam');
    expect(result.categories).toContain('harassment');
  });

  it('uses fallback bot identity when client user data is unavailable', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.95, harassment: 0.1, reason: 'spam' }),
    );
    const guildConfig = makeAiAutoModGuildConfig();

    await checkAiAutoMod(message, {}, guildConfig);

    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ userId: 'bot', userTag: 'Bot#0000' }),
    );
  });

  it('deletes message when action is delete and autoDelete is false', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.95, harassment: 0.1, reason: 'spam' }),
    );
    const guildConfig = makeAiAutoModGuildConfig();
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('delete');
    // Message should be deleted even though autoDelete is false —
    // the explicit 'delete' action enforces deletion independently.
    expect(message.delete).toHaveBeenCalled();
  });

  it('does not double-delete when autoDelete=true and delete is already configured', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.95, harassment: 0.1, reason: 'spam' }),
    );
    const guildConfig = makeAiAutoModGuildConfig({ autoDelete: true });
    const result = await checkAiAutoMod(message, client, guildConfig);
    expect(result.flagged).toBe(true);
    expect(result.action).toBe('delete');
    expect(message.delete).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        action: 'ai_automod.delete',
        details: expect.objectContaining({ actions: ['delete'] }),
      }),
    );
  });

  it('audits global autoDelete as delete instead of none when no category action is configured', async () => {
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = makeAiAutoModGuildConfig({
      actions: { toxicity: 'none' },
      autoDelete: true,
    });

    const result = await checkAiAutoMod(message, client, guildConfig);

    expect(result).toMatchObject({ flagged: true, action: 'none', actions: [] });
    expect(message.delete).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        action: 'ai_automod.delete',
        details: expect.objectContaining({
          action: 'delete',
          actions: ['delete'],
          autoDelete: true,
        }),
      }),
    );
    expect(logAuditEvent).not.toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ action: 'ai_automod.none' }),
    );
  });

  it('preserves flag embeds for non-flag actions when a flag channel is configured', async () => {
    const mockFlagChannel = { id: 'flag-channel-1', send: vi.fn().mockResolvedValue(undefined) };
    fetchChannelCached.mockResolvedValue(mockFlagChannel);
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.1, harassment: 0.9, reason: 'harassment' }),
    );
    const guildConfig = makeAiAutoModGuildConfig({ flagChannelId: 'flag-channel-1' });

    const result = await checkAiAutoMod(message, client, guildConfig);

    expect(result).toMatchObject({ flagged: true, action: 'warn', actions: ['warn'] });
    expect(createCase).toHaveBeenCalledWith(
      'guild-1',
      expect.objectContaining({ action: 'warn', targetId: 'user-1' }),
    );
    expect(fetchChannelCached).toHaveBeenCalledWith(client, 'flag-channel-1', 'guild-1');
    expect(safeSend).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        action: 'ai_automod.flag',
        details: expect.objectContaining({ actions: ['warn', 'flag'] }),
      }),
    );
  });

  it('does not duplicate explicit flag actions when compatibility flag embeds are enabled', async () => {
    const mockFlagChannel = { id: 'flag-channel-1', send: vi.fn().mockResolvedValue(undefined) };
    fetchChannelCached.mockResolvedValue(mockFlagChannel);
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic' }),
    );
    const guildConfig = makeAiAutoModGuildConfig({
      autoDelete: true,
      flagChannelId: 'flag-channel-1',
    });

    const result = await checkAiAutoMod(message, client, guildConfig);

    expect(result).toMatchObject({ flagged: true, action: 'flag', actions: ['flag'] });
    expect(message.delete).toHaveBeenCalledTimes(1);
    expect(safeSend).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        action: 'ai_automod.delete',
        details: expect.objectContaining({ actions: ['delete', 'flag'] }),
      }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        action: 'ai_automod.flag',
        details: expect.objectContaining({ actions: ['delete', 'flag'] }),
      }),
    );
  });

  it('does not write an audit event when the Discord guild is unavailable', async () => {
    message = makeMessage({ guild: null });
    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.1, spam: 0.95, harassment: 0.1, reason: 'spam' }),
    );
    const guildConfig = makeAiAutoModGuildConfig();

    const result = await checkAiAutoMod(message, client, guildConfig);

    expect(result).toMatchObject({ flagged: true, action: 'delete' });
    expect(message.delete).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('should send flag embed to flagChannelId when configured', async () => {
    const mockFlagChannel = { id: 'flag-channel-1', send: vi.fn().mockResolvedValue(undefined) };
    fetchChannelCached.mockResolvedValue(mockFlagChannel);

    mockGenerate.mockResolvedValue(
      makeClaudeResponse({ toxicity: 0.9, spam: 0.1, harassment: 0.1, reason: 'toxic content' }),
    );
    const guildConfig = makeAiAutoModGuildConfig({ flagChannelId: 'flag-channel-1' });
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
