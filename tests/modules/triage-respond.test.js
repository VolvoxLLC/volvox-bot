import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStatsAndLog,
  fetchChannelContext,
  sendModerationLog,
  sendResponses,
} from '../../src/modules/triage-respond.js';

// Mock dependencies

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

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn(async (_ch, opts) => ({ id: 'sent123', content: opts.content || opts })),
}));

vi.mock('../../src/utils/splitMessage.js', () => ({
  splitMessage: vi.fn((text) => [text]),
}));

vi.mock('../../src/utils/debugFooter.js', () => ({
  buildDebugEmbed: vi.fn(() => ({ title: 'Debug' })),
  extractStats: vi.fn((_msg, model, _providerName) => ({
    model,
    promptTokens: 100,
    completionTokens: 50,
    totalCostUsd: 0.001,
  })),
  logAiUsage: vi.fn(),
}));

vi.mock('../../src/modules/triage-filter.js', () => ({
  resolveMessageId: vi.fn((msgId) => msgId),
  sanitizeText: vi.fn((text) => text),
}));

vi.mock('../../src/modules/moderation.js', () => ({
  isProtectedTarget: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/modules/auditLogger.js', async () => {
  const actual = await vi.importActual('../../src/modules/auditLogger.js');
  return {
    ...actual,
    logAuditEvent: vi.fn(),
  };
});

import { getPool } from '../../src/db.js';
import { warn } from '../../src/logger.js';
import { getBotIdentity, logAuditEvent } from '../../src/modules/auditLogger.js';
import { isProtectedTarget } from '../../src/modules/moderation.js';
import { safeSend } from '../../src/utils/safeSend.js';

beforeEach(() => {
  vi.clearAllMocks();
  isProtectedTarget.mockReturnValue(false);
  getPool.mockImplementation(() => {
    throw new Error('Database not initialized');
  });
});

describe('triage-respond', () => {
  describe('fetchChannelContext', () => {
    it('should fetch and format channel messages', async () => {
      const mockMessages = new Map([
        [
          'msg1',
          {
            id: 'msg1',
            content: 'Old message',
            author: { id: 'user1', username: 'Alice', bot: false },
            createdTimestamp: 1000,
          },
        ],
        [
          'msg2',
          {
            id: 'msg2',
            content: 'Older message',
            author: { id: 'user2', username: 'Bob', bot: false },
            createdTimestamp: 2000,
          },
        ],
      ]);

      const mockChannel = {
        messages: {
          fetch: vi.fn(async () => mockMessages),
        },
      };

      const mockClient = {
        channels: {
          fetch: vi.fn(async () => mockChannel),
        },
      };

      const bufferSnapshot = [
        {
          messageId: 'msg3',
          author: 'Charlie',
          userId: 'user3',
          content: 'New message',
        },
      ];

      const result = await fetchChannelContext('channel1', mockClient, bufferSnapshot, 15);

      expect(result).toHaveLength(2);
      expect(result[0].messageId).toBe('msg1');
      expect(result[0].author).toBe('Alice');
      expect(result[0].isContext).toBe(true);
      expect(result[1].messageId).toBe('msg2');
    });

    it('should mark bot messages with [BOT] suffix when included', async () => {
      const mockMessages = new Map([
        [
          'msg1',
          {
            id: 'msg1',
            content: 'Bot message',
            author: { id: 'bot1', username: 'BotUser', bot: true },
            createdTimestamp: 1000,
          },
        ],
      ]);

      const mockChannel = {
        messages: {
          fetch: vi.fn(async () => mockMessages),
        },
      };

      const mockClient = {
        channels: {
          fetch: vi.fn(async () => mockChannel),
        },
      };

      // With includeBotsInContext: true, bot messages should be included
      const config = { triage: { includeBotsInContext: true } };
      const result = await fetchChannelContext('channel1', mockClient, [], 15, config);

      expect(result[0].author).toBe('BotUser [BOT]');
    });

    it('should filter out bot messages by default', async () => {
      const mockMessages = new Map([
        [
          'msg1',
          {
            id: 'msg1',
            content: 'Human message',
            author: { id: 'user1', username: 'Alice', bot: false },
            createdTimestamp: 1000,
          },
        ],
        [
          'msg2',
          {
            id: 'msg2',
            content: 'Bot message',
            author: { id: 'bot1', username: 'BotUser', bot: true },
            createdTimestamp: 2000,
          },
        ],
      ]);

      const mockChannel = {
        messages: {
          fetch: vi.fn(async () => mockMessages),
        },
      };

      const mockClient = {
        channels: {
          fetch: vi.fn(async () => mockChannel),
        },
      };

      // Default config (no includeBotsInContext) should filter bot messages
      const result = await fetchChannelContext('channel1', mockClient, [], 15);

      expect(result).toHaveLength(1);
      expect(result[0].author).toBe('Alice');
    });

    it('should filter out webhook messages entirely', async () => {
      const mockMessages = new Map([
        [
          'msg1',
          {
            id: 'msg1',
            content: 'Human message',
            author: { id: 'user1', username: 'Alice', bot: false },
            createdTimestamp: 1000,
          },
        ],
        [
          'msg2',
          {
            id: 'msg2',
            content: 'GitHub: PR merged',
            author: { id: 'webhook1', username: 'GitHub', bot: true },
            webhookId: 'webhook-123',
            createdTimestamp: 2000,
          },
        ],
      ]);

      const mockChannel = {
        messages: {
          fetch: vi.fn(async () => mockMessages),
        },
      };

      const mockClient = {
        channels: {
          fetch: vi.fn(async () => mockChannel),
        },
      };

      // Even with includeBotsInContext: true, webhooks should be filtered
      const config = { triage: { includeBotsInContext: true } };
      const result = await fetchChannelContext('channel1', mockClient, [], 15, config);

      expect(result).toHaveLength(1);
      expect(result[0].author).toBe('Alice');
    });

    it('should include allowlisted bot in context', async () => {
      const mockMessages = new Map([
        [
          'msg1',
          {
            id: 'msg1',
            content: 'Allowed bot message',
            author: { id: 'allowed-bot-id', username: 'AllowedBot', bot: true },
            createdTimestamp: 1000,
          },
        ],
        [
          'msg2',
          {
            id: 'msg2',
            content: 'Other bot message',
            author: { id: 'other-bot-id', username: 'OtherBot', bot: true },
            createdTimestamp: 2000,
          },
        ],
      ]);

      const mockChannel = {
        messages: {
          fetch: vi.fn(async () => mockMessages),
        },
      };

      const mockClient = {
        channels: {
          fetch: vi.fn(async () => mockChannel),
        },
      };

      // Only allowed-bot-id should be included
      const config = { triage: { botAllowlist: ['allowed-bot-id'] } };
      const result = await fetchChannelContext('channel1', mockClient, [], 15, config);

      expect(result).toHaveLength(1);
      expect(result[0].author).toBe('AllowedBot [BOT]');
    });

    it('should handle fetch errors gracefully', async () => {
      const mockClient = {
        channels: {
          fetch: vi.fn(async () => {
            throw new Error('Channel not found');
          }),
        },
      };

      const result = await fetchChannelContext('channel1', mockClient, [], 15);

      expect(result).toEqual([]);
      expect(warn).toHaveBeenCalled();
    });

    it('should truncate long messages to 500 characters', async () => {
      const longContent = 'a'.repeat(600);
      const mockMessages = new Map([
        [
          'msg1',
          {
            id: 'msg1',
            content: longContent,
            author: { id: 'user1', username: 'Alice', bot: false },
            createdTimestamp: 1000,
          },
        ],
      ]);

      const mockChannel = {
        messages: {
          fetch: vi.fn(async () => mockMessages),
        },
      };

      const mockClient = {
        channels: {
          fetch: vi.fn(async () => mockChannel),
        },
      };

      const result = await fetchChannelContext('channel1', mockClient, [], 15);

      expect(result[0].content.length).toBeLessThanOrEqual(500);
    });
  });

  describe('sendModerationLog', () => {
    const useMockAuditPool = () => {
      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);
      return mockPool;
    };

    const createModerationClassification = ({
      recommendedAction = 'warn',
      violatedRule = 'Rule 1: Be respectful',
      reasoning = 'User was rude',
      targetMessageIds = ['msg1'],
    } = {}) => ({
      recommendedAction,
      violatedRule,
      reasoning,
      targetMessageIds,
    });

    const createModerationSnapshot = ({
      messageId = 'msg1',
      author = 'BadUser',
      userId = 'user1',
      content = 'Offensive content',
    } = {}) => [{ messageId, author, userId, content }];

    const createModerationLogConfig = (overrides = {}) => ({
      ...overrides,
      triage: { moderationLogChannel: 'log-channel', ...overrides.triage },
    });

    const createModerationLogClient = ({
      logChannel = { id: 'log-channel' },
      user = { id: 'bot1', tag: 'Volvox.Bot#0001' },
      fetchLogChannel = async (id) => (id === 'log-channel' ? logChannel : null),
    } = {}) => ({
      user,
      channels: {
        fetch: vi.fn(fetchLogChannel),
      },
    });

    it('should send moderation embed to log channel', async () => {
      const mockLogChannel = {
        id: 'log-channel',
      };

      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);

      const mockClient = {
        user: { id: 'bot1', tag: 'Volvox.Bot#0001' },
        channels: {
          fetch: vi.fn(async (id) => (id === 'log-channel' ? mockLogChannel : null)),
        },
      };

      const classification = {
        recommendedAction: 'warn',
        violatedRule: 'Rule 1: Be respectful',
        reasoning: 'User was rude',
        targetMessageIds: ['msg1'],
      };

      const snapshot = [
        {
          messageId: 'msg1',
          author: 'BadUser',
          userId: 'user1',
          content: 'Offensive content',
        },
      ];

      const config = {
        triage: {
          moderationLogChannel: 'log-channel',
        },
      };

      await sendModerationLog(mockClient, classification, snapshot, 'channel1', config, 'guild1');

      expect(logAuditEvent).toHaveBeenCalledWith(
        mockPool,
        expect.objectContaining({
          guildId: 'guild1',
          userId: 'bot1',
          userTag: 'Volvox.Bot#0001',
          action: 'triage.moderation_flag',
          targetType: 'message',
          targetId: 'msg1',
          targetTag: 'BadUser',
          details: expect.objectContaining({
            sourceChannelId: 'channel1',
            logChannelId: 'log-channel',
            recommendedAction: 'warn',
            violatedRule: 'Rule 1: Be respectful',
            targetMessageIds: ['msg1'],
          }),
        }),
      );

      expect(logAuditEvent.mock.calls[0][1].details.targets).toEqual([
        expect.objectContaining({
          messageId: 'msg1',
          content: 'Offensive content',
        }),
      ]);

      expect(safeSend).toHaveBeenCalledWith(
        mockLogChannel,
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '\uD83D\uDEE1\uFE0F Moderation Flag',
              }),
            }),
          ]),
        }),
      );
    });

    it('writes DB audit for old-style callers using the log channel guild id', async () => {
      const mockLogChannel = {
        id: 'log-channel',
        guild: { id: 'guild-from-log-channel' },
      };
      const mockPool = useMockAuditPool();
      const mockClient = createModerationLogClient({ logChannel: mockLogChannel });

      await sendModerationLog(
        mockClient,
        createModerationClassification(),
        createModerationSnapshot(),
        'channel1',
        createModerationLogConfig(),
      );

      expect(logAuditEvent).toHaveBeenCalledWith(
        mockPool,
        expect.objectContaining({
          guildId: 'guild-from-log-channel',
          action: 'triage.moderation_flag',
          targetId: 'msg1',
        }),
      );
      expect(safeSend).toHaveBeenCalledWith(mockLogChannel, expect.any(Object));
    });

    it('writes DB audit for protected-role checks using the log channel guild id', async () => {
      isProtectedTarget.mockReturnValue(false);

      const mockPool = useMockAuditPool();
      const mockMember = { id: 'user1' };
      const mockGuild = {
        id: 'guild-from-protection-log-channel',
        members: { fetch: vi.fn().mockResolvedValue(mockMember) },
      };
      const mockLogChannel = { id: 'log-channel', guild: mockGuild };
      const mockClient = createModerationLogClient({
        logChannel: mockLogChannel,
        user: { id: 'bot1', username: 'Volvox.Bot' },
        fetchLogChannel: async () => mockLogChannel,
      });

      await sendModerationLog(
        mockClient,
        createModerationClassification({
          recommendedAction: 'timeout',
          violatedRule: 'Rule 2',
          reasoning: 'Needs moderation review',
          targetMessageIds: ['msg-protection-check'],
        }),
        createModerationSnapshot({ messageId: 'msg-protection-check', content: 'msg' }),
        'source-channel',
        createModerationLogConfig({ moderation: { protectRoles: { enabled: true } } }),
      );

      expect(mockGuild.members.fetch).toHaveBeenCalledWith('user1');
      expect(isProtectedTarget).toHaveBeenCalledWith(mockMember, mockGuild);
      expect(logAuditEvent).toHaveBeenCalledWith(
        mockPool,
        expect.objectContaining({
          guildId: 'guild-from-protection-log-channel',
          action: 'triage.moderation_flag',
          targetId: 'msg-protection-check',
        }),
      );
      expect(safeSend).toHaveBeenCalledWith(mockLogChannel, expect.any(Object));
    });

    it('writes the DB audit even when the moderation log channel cannot be fetched', async () => {
      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);

      const mockClient = {
        user: { id: 'bot1', username: 'Volvox.Bot' },
        channels: {
          fetch: vi.fn(async () => null),
        },
      };

      const classification = {
        recommendedAction: 'timeout',
        violatedRule: 'Rule 2',
        reasoning: 'Escalating abuse',
        targetMessageIds: ['msg-missing-channel'],
      };
      const snapshot = [
        {
          messageId: 'msg-missing-channel',
          author: 'BadUser',
          userId: 'user1',
          content: 'Bad content',
        },
      ];
      const config = {
        triage: { moderationLogChannel: 'missing-log-channel' },
      };

      await sendModerationLog(
        mockClient,
        classification,
        snapshot,
        'source-channel',
        config,
        'guild1',
      );

      expect(logAuditEvent).toHaveBeenCalledWith(
        mockPool,
        expect.objectContaining({
          guildId: 'guild1',
          action: 'triage.moderation_flag',
          targetId: 'msg-missing-channel',
          details: expect.objectContaining({
            sourceChannelId: 'source-channel',
            logChannelId: 'missing-log-channel',
          }),
        }),
      );
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('writes the DB audit without Discord send when no moderation log channel is configured', async () => {
      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);

      const mockClient = {
        user: { id: 'bot1', username: 'Volvox.Bot' },
        channels: { fetch: vi.fn() },
      };
      const classification = {
        recommendedAction: 'timeout',
        violatedRule: 'Rule 2',
        reasoning: 'Escalating abuse',
        targetMessageIds: ['msg-no-log-channel'],
      };
      const snapshot = [
        {
          messageId: 'msg-no-log-channel',
          author: 'BadUser',
          userId: 'user1',
          content: 'Bad content',
        },
      ];

      await sendModerationLog(
        mockClient,
        classification,
        snapshot,
        'source-channel',
        { triage: {} },
        'guild1',
      );

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
      expect(logAuditEvent).toHaveBeenCalledWith(
        mockPool,
        expect.objectContaining({
          guildId: 'guild1',
          action: 'triage.moderation_flag',
          targetId: 'msg-no-log-channel',
          details: expect.objectContaining({
            sourceChannelId: 'source-channel',
            logChannelId: null,
            targetMessageIds: ['msg-no-log-channel'],
          }),
        }),
      );
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('skips fallback DB audit for protected targets when the moderation log channel fetch fails', async () => {
      isProtectedTarget.mockReturnValueOnce(true);

      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);

      const mockMember = { id: 'user1' };
      const mockGuild = {
        id: 'guild1',
        members: { fetch: vi.fn().mockResolvedValue(mockMember) },
      };
      const mockClient = {
        user: { id: 'bot1', username: 'Volvox.Bot' },
        channels: {
          fetch: vi.fn(async () => {
            throw new Error('Missing access');
          }),
        },
        guilds: {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        },
      };

      const classification = {
        recommendedAction: 'ban',
        violatedRule: 'Rule 1',
        reasoning: 'Protected target flagged',
        targetMessageIds: ['msg-protected'],
      };
      const snapshot = [
        { messageId: 'msg-protected', author: 'AdminUser', userId: 'user1', content: 'msg' },
      ];
      const config = {
        triage: { moderationLogChannel: 'missing-log-channel' },
        moderation: { protectRoles: { enabled: true, includeAdmins: true } },
      };

      await sendModerationLog(
        mockClient,
        classification,
        snapshot,
        'source-channel',
        config,
        'guild1',
      );

      expect(mockClient.channels.fetch).toHaveBeenCalledWith('missing-log-channel');
      expect(mockClient.guilds.fetch).toHaveBeenCalledWith('guild1');
      expect(mockGuild.members.fetch).toHaveBeenCalledWith('user1');
      expect(isProtectedTarget).toHaveBeenCalledWith(mockMember, mockGuild);
      expect(logAuditEvent).not.toHaveBeenCalled();
      expect(safeSend).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('protected role'),
        expect.objectContaining({
          guildId: 'guild1',
          channelId: 'source-channel',
          userId: 'user1',
        }),
      );
    });

    it('truncates stored moderation target content in audit details', async () => {
      const mockLogChannel = { id: 'log-channel' };
      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);

      const mockClient = {
        user: { id: 'bot1', tag: 'Volvox.Bot#0001' },
        channels: { fetch: vi.fn(async () => mockLogChannel) },
      };

      const longContent = 'x'.repeat(1200);
      const classification = {
        recommendedAction: 'warn',
        violatedRule: 'Rule 1',
        reasoning: 'Long abusive content',
        targetMessageIds: ['msg-long'],
      };
      const snapshot = [
        { messageId: 'msg-long', author: 'BadUser', userId: 'user1', content: longContent },
      ];
      const config = { triage: { moderationLogChannel: 'log-channel' } };

      await sendModerationLog(mockClient, classification, snapshot, 'channel1', config, 'guild1');

      const auditDetails = logAuditEvent.mock.calls[0][1].details;
      expect(auditDetails.targets[0].content).toHaveLength(1000);
      expect(auditDetails.targets[0].content).toBe(longContent.slice(0, 1000));
    });

    it('falls back to the most recent snapshot message for DB audit when targetMessageIds is missing', async () => {
      const mockPool = useMockAuditPool();
      const mockLogChannel = { id: 'log-channel' };
      const mockClient = createModerationLogClient({ logChannel: mockLogChannel });

      const classification = createModerationClassification();
      delete classification.targetMessageIds;
      const snapshot = [
        { messageId: 'older-msg', author: 'EarlierUser', userId: 'user-old', content: 'Earlier' },
        { messageId: 'recent-msg', author: 'RecentUser', userId: 'user-recent', content: 'Recent' },
      ];

      await sendModerationLog(
        mockClient,
        classification,
        snapshot,
        'channel1',
        createModerationLogConfig(),
        'guild1',
      );

      expect(logAuditEvent).toHaveBeenCalledWith(
        mockPool,
        expect.objectContaining({
          targetId: 'recent-msg',
          targetTag: 'RecentUser',
          details: expect.objectContaining({
            targetMessageIds: ['recent-msg'],
            targets: [
              expect.objectContaining({
                messageId: 'recent-msg',
                userId: 'user-recent',
                author: 'RecentUser',
              }),
            ],
          }),
        }),
      );
      expect(safeSend).toHaveBeenCalledWith(mockLogChannel, expect.any(Object));
    });

    it('uses fallback targets for protected-role checks when targetMessageIds is empty', async () => {
      isProtectedTarget.mockReturnValueOnce(true);

      const mockMember = { id: 'user-recent' };
      const mockGuild = {
        id: 'guild1',
        members: { fetch: vi.fn().mockResolvedValue(mockMember) },
      };
      const mockLogChannel = { id: 'log-channel', guild: mockGuild };
      const mockClient = createModerationLogClient({ logChannel: mockLogChannel });

      await sendModerationLog(
        mockClient,
        createModerationClassification({ targetMessageIds: [] }),
        [
          { messageId: 'older-msg', author: 'EarlierUser', userId: 'user-old', content: 'Earlier' },
          {
            messageId: 'recent-msg',
            author: 'RecentUser',
            userId: 'user-recent',
            content: 'Recent',
          },
        ],
        'channel1',
        createModerationLogConfig({ moderation: { protectRoles: { enabled: true } } }),
        'guild1',
      );

      expect(mockGuild.members.fetch).toHaveBeenCalledWith('user-recent');
      expect(isProtectedTarget).toHaveBeenCalledWith(mockMember, mockGuild);
      expect(logAuditEvent).not.toHaveBeenCalled();
      expect(safeSend).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('protected role'),
        expect.objectContaining({ userId: 'user-recent' }),
      );
    });

    it('skips moderation audit and send when protected-role checks have unresolved explicit targets', async () => {
      useMockAuditPool();
      const mockLogChannel = { id: 'log-channel' };
      const mockClient = createModerationLogClient({ logChannel: mockLogChannel });

      await sendModerationLog(
        mockClient,
        createModerationClassification({ targetMessageIds: ['missing-msg'] }),
        [{ messageId: 'other-msg', author: 'OtherUser', userId: 'user-other', content: 'Other' }],
        'channel1',
        createModerationLogConfig({ moderation: { protectRoles: { enabled: true } } }),
        'guild1',
      );

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
      expect(isProtectedTarget).not.toHaveBeenCalled();
      expect(logAuditEvent).not.toHaveBeenCalled();
      expect(safeSend).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('explicit targets were missing from snapshot'),
        expect.objectContaining({
          guildId: 'guild1',
          channelId: 'channel1',
          targetMessageIds: ['missing-msg'],
        }),
      );
    });

    it('resolves fallback bot identity for audit helpers', () => {
      expect(getBotIdentity({ user: { id: 'bot-id', username: 'Volvox' } })).toEqual({
        userId: 'bot-id',
        userTag: 'Volvox',
      });
      expect(getBotIdentity({})).toEqual({ userId: 'volvox-bot', userTag: 'Volvox.Bot' });
    });

    it('should do nothing if log channel not configured', async () => {
      const mockClient = {
        channels: {
          fetch: vi.fn(),
        },
      };

      const config = {
        triage: {},
      };

      await sendModerationLog(mockClient, {}, [], 'channel1', config);

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('should handle channel fetch errors gracefully', async () => {
      const mockClient = {
        channels: {
          fetch: vi.fn(async () => {
            throw new Error('Channel not found');
          }),
        },
      };

      const config = {
        triage: {
          moderationLogChannel: 'invalid-channel',
        },
      };

      await expect(
        sendModerationLog(mockClient, {}, [], 'channel1', config),
      ).resolves.not.toThrow();
    });

    it('should skip the moderation log when a target is a protected role', async () => {
      isProtectedTarget.mockReturnValueOnce(true);

      const mockMember = { id: 'user1' };
      const mockGuild = {
        members: { fetch: vi.fn().mockResolvedValue(mockMember) },
      };
      const mockLogChannel = { id: 'log-channel', guild: mockGuild };
      const mockClient = {
        channels: { fetch: vi.fn().mockResolvedValue(mockLogChannel) },
      };

      const classification = {
        recommendedAction: 'ban',
        violatedRule: 'Rule 1',
        reasoning: 'Spamming',
        targetMessageIds: ['msg1'],
      };
      const snapshot = [
        { messageId: 'msg1', author: 'AdminUser', userId: 'user1', content: 'msg' },
      ];
      const config = {
        triage: { moderationLogChannel: 'log-channel' },
        moderation: { protectRoles: { enabled: true, includeAdmins: true } },
      };

      await sendModerationLog(mockClient, classification, snapshot, 'channel1', config, 'guild1');

      expect(logAuditEvent).not.toHaveBeenCalled();
      expect(safeSend).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('protected role'),
        expect.objectContaining({ userId: 'user1' }),
      );
    });

    it('should still send moderation log when target is not protected', async () => {
      isProtectedTarget.mockReturnValue(false);

      const mockMember = { id: 'user1' };
      const mockGuild = {
        members: { fetch: vi.fn().mockResolvedValue(mockMember) },
      };
      const mockLogChannel = { id: 'log-channel', guild: mockGuild };
      const mockClient = {
        channels: { fetch: vi.fn().mockResolvedValue(mockLogChannel) },
      };

      const classification = {
        recommendedAction: 'warn',
        violatedRule: 'Rule 1',
        reasoning: 'Rude message',
        targetMessageIds: ['msg1'],
      };
      const snapshot = [{ messageId: 'msg1', author: 'BadUser', userId: 'user1', content: 'msg' }];
      const config = {
        triage: { moderationLogChannel: 'log-channel' },
        moderation: { protectRoles: { enabled: true } },
      };

      await sendModerationLog(mockClient, classification, snapshot, 'channel1', config);

      expect(safeSend).toHaveBeenCalled();
    });

    it('does not resolve the guild for role protection when protectRoles is disabled', async () => {
      const mockLogChannel = { id: 'log-channel' };
      const mockClient = {
        channels: { fetch: vi.fn().mockResolvedValue(mockLogChannel) },
        guilds: { fetch: vi.fn().mockRejectedValue(new Error('should not fetch guild')) },
      };

      const classification = {
        recommendedAction: 'warn',
        violatedRule: 'Rule 1',
        reasoning: 'Rude message',
        targetMessageIds: ['msg1'],
      };
      const snapshot = [{ messageId: 'msg1', author: 'BadUser', userId: 'user1', content: 'msg' }];
      const config = {
        triage: { moderationLogChannel: 'log-channel' },
        moderation: { protectRoles: { enabled: false } },
      };

      await sendModerationLog(mockClient, classification, snapshot, 'channel1', config, 'guild1');

      expect(mockClient.guilds.fetch).not.toHaveBeenCalled();
      expect(isProtectedTarget).not.toHaveBeenCalled();
      expect(safeSend).toHaveBeenCalledWith(mockLogChannel, expect.any(Object));
    });

    it('skips moderation audit and send when protected-role guild lookup fails', async () => {
      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);

      const mockClient = {
        user: { id: 'bot1', username: 'Volvox.Bot' },
        channels: {
          fetch: vi.fn(async () => {
            throw new Error('Missing access');
          }),
        },
        guilds: {
          fetch: vi.fn().mockRejectedValue(new Error('Guild fetch failed')),
        },
      };

      const classification = {
        recommendedAction: 'ban',
        violatedRule: 'Rule 1',
        reasoning: 'Protected target could not be checked',
        targetMessageIds: ['msg-protection-unknown'],
      };
      const snapshot = [
        {
          messageId: 'msg-protection-unknown',
          author: 'MaybeAdmin',
          userId: 'user1',
          content: 'msg',
        },
      ];
      const config = {
        triage: { moderationLogChannel: 'missing-log-channel' },
        moderation: { protectRoles: { enabled: true } },
      };

      await sendModerationLog(
        mockClient,
        classification,
        snapshot,
        'source-channel',
        config,
        'guild1',
      );

      expect(mockClient.channels.fetch).toHaveBeenCalledWith('missing-log-channel');
      expect(mockClient.guilds.fetch).toHaveBeenCalledWith('guild1');
      expect(logAuditEvent).not.toHaveBeenCalled();
      expect(safeSend).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('protected-role guild lookup failed'),
        expect.objectContaining({ guildId: 'guild1', channelId: 'source-channel' }),
      );
    });

    it('skips moderation audit and send when protected-role member lookup returns no member', async () => {
      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);

      const mockGuild = {
        id: 'guild1',
        members: { fetch: vi.fn().mockResolvedValue(null) },
      };
      const mockLogChannel = { id: 'log-channel', guild: mockGuild };
      const mockClient = {
        user: { id: 'bot1', username: 'Volvox.Bot' },
        channels: { fetch: vi.fn().mockResolvedValue(mockLogChannel) },
      };

      const classification = {
        recommendedAction: 'ban',
        violatedRule: 'Rule 1',
        reasoning: 'Protected target could not be checked',
        targetMessageIds: ['msg-missing-member'],
      };
      const snapshot = [
        { messageId: 'msg-missing-member', author: 'MaybeAdmin', userId: 'user1', content: 'msg' },
      ];
      const config = {
        triage: { moderationLogChannel: 'log-channel' },
        moderation: { protectRoles: { enabled: true } },
      };

      await sendModerationLog(
        mockClient,
        classification,
        snapshot,
        'source-channel',
        config,
        'guild1',
      );

      expect(mockGuild.members.fetch).toHaveBeenCalledWith('user1');
      expect(isProtectedTarget).not.toHaveBeenCalled();
      expect(logAuditEvent).not.toHaveBeenCalled();
      expect(safeSend).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('protected-role member lookup returned no member'),
        expect.objectContaining({
          guildId: 'guild1',
          channelId: 'source-channel',
          userId: 'user1',
        }),
      );
    });

    it('should skip the protected-role fetch loop when protectRoles is explicitly disabled', async () => {
      const mockFetch = vi.fn();
      const mockGuild = { members: { fetch: mockFetch } };
      const mockLogChannel = { id: 'log-channel', guild: mockGuild };
      const mockClient = {
        channels: { fetch: vi.fn().mockResolvedValue(mockLogChannel) },
      };

      const classification = {
        recommendedAction: 'warn',
        violatedRule: 'Rule 1',
        reasoning: 'Rude message',
        targetMessageIds: ['msg1'],
      };
      const snapshot = [{ messageId: 'msg1', author: 'BadUser', userId: 'user1', content: 'msg' }];
      const config = {
        triage: { moderationLogChannel: 'log-channel' },
        moderation: { protectRoles: { enabled: false } },
      };

      await sendModerationLog(mockClient, classification, snapshot, 'channel1', config);

      // Member fetch should not be called since protection is disabled
      expect(mockFetch).not.toHaveBeenCalled();
      expect(isProtectedTarget).not.toHaveBeenCalled();
      expect(safeSend).toHaveBeenCalled();
    });
  });

  describe('sendResponses', () => {
    it('should send normal responses with typing indicator', async () => {
      const mockChannel = {
        id: 'channel1',
        sendTyping: vi.fn(async () => {}),
      };

      const parsed = {
        responses: [
          {
            response: 'Hello there!',
            targetMessageId: 'msg1',
            targetUser: 'Alice',
          },
        ],
      };

      const classification = {
        classification: 'respond',
        reasoning: 'User asked a question',
      };

      const snapshot = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'Question',
        },
      ];

      const config = {
        triage: {},
      };

      await sendResponses(mockChannel, parsed, classification, snapshot, config, null, 'channel1');

      expect(mockChannel.sendTyping).toHaveBeenCalled();
      expect(safeSend).toHaveBeenCalledWith(
        mockChannel,
        expect.objectContaining({
          content: 'Hello there!',
        }),
      );
    });

    it('should send moderation responses when enabled', async () => {
      const mockChannel = {
        id: 'channel1',
      };

      const parsed = {
        responses: [
          {
            response: 'Please be respectful',
            targetMessageId: 'msg1',
            targetUser: 'BadUser',
          },
        ],
      };

      const classification = {
        classification: 'moderate',
        reasoning: 'User violated rules',
      };

      const snapshot = [
        {
          messageId: 'msg1',
          author: 'BadUser',
          userId: 'user1',
          content: 'Bad content',
        },
      ];

      const config = {
        triage: {
          moderationResponse: true,
        },
      };

      await sendResponses(mockChannel, parsed, classification, snapshot, config, null, 'channel1');

      expect(safeSend).toHaveBeenCalled();
    });

    it('should skip moderation responses when disabled', async () => {
      const mockChannel = {
        id: 'channel1',
      };

      const parsed = {
        responses: [
          {
            response: 'Warning',
            targetMessageId: 'msg1',
            targetUser: 'BadUser',
          },
        ],
      };

      const classification = {
        classification: 'moderate',
        reasoning: 'Violation',
      };

      const snapshot = [];

      const config = {
        triage: {
          moderationResponse: false,
        },
      };

      await sendResponses(mockChannel, parsed, classification, snapshot, config, null, 'channel1');

      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should handle null channel gracefully', async () => {
      const parsed = {
        responses: [],
      };

      const classification = {
        classification: 'respond',
      };

      await expect(
        sendResponses(null, parsed, classification, [], {}, null, 'channel1'),
      ).resolves.not.toThrow();

      expect(warn).toHaveBeenCalledWith(
        'Could not fetch channel for triage response',
        expect.any(Object),
      );
    });

    it('should skip empty responses', async () => {
      const mockChannel = {
        id: 'channel1',
        sendTyping: vi.fn(async () => {}),
      };

      const parsed = {
        responses: [
          {
            response: '',
            targetMessageId: 'msg1',
            targetUser: 'Alice',
          },
        ],
      };

      const classification = {
        classification: 'respond',
      };

      await sendResponses(mockChannel, parsed, classification, [], {}, null, 'channel1');

      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should attach debug embed when enabled', async () => {
      const mockChannel = {
        id: 'channel1',
        sendTyping: vi.fn(async () => {}),
      };

      const parsed = {
        responses: [
          {
            response: 'Response',
            targetMessageId: 'msg1',
            targetUser: 'Alice',
          },
        ],
      };

      const classification = {
        classification: 'respond',
      };

      const config = {
        triage: {
          debugFooter: true,
          debugFooterLevel: 'verbose',
        },
      };

      const stats = {
        classify: { totalCostUsd: 0.001 },
        respond: { totalCostUsd: 0.002 },
        searchCount: 0,
      };

      await sendResponses(mockChannel, parsed, classification, [], config, stats, 'channel1');

      expect(safeSend).toHaveBeenCalledWith(
        mockChannel,
        expect.objectContaining({
          embeds: expect.arrayContaining([expect.any(Object)]),
        }),
      );
    });
  });

  describe('buildStatsAndLog', () => {
    it('should build stats and fetch channel', async () => {
      const classifyMessage = {
        costUsd: 0.001,
      };

      const respondMessage = {
        costUsd: 0.002,
      };

      const resolved = {
        classifyModel: 'minimax:MiniMax-M2.7',
        respondModel: 'minimax:MiniMax-M2.7',
      };

      const snapshot = [
        {
          messageId: 'msg1',
          userId: 'user1',
        },
      ];

      const classification = {
        targetMessageIds: ['msg1'],
      };

      const mockChannel = {
        id: 'channel1',
        guildId: 'guild1',
      };

      const mockClient = {
        channels: {
          fetch: vi.fn(async () => mockChannel),
        },
      };

      const result = await buildStatsAndLog(
        classifyMessage,
        respondMessage,
        resolved,
        snapshot,
        classification,
        0,
        mockClient,
        'channel1',
      );

      expect(result).toHaveProperty('stats');
      expect(result.stats).toHaveProperty('classify');
      expect(result.stats).toHaveProperty('respond');
      expect(result.stats.userId).toBe('user1');
      expect(result.stats.searchCount).toBe(0);
      expect(result.channel).toBe(mockChannel);
    });

    it('should handle channel fetch failure', async () => {
      const mockClient = {
        channels: {
          fetch: vi.fn(async () => {
            throw new Error('Not found');
          }),
        },
      };

      const resolved = {
        classifyModel: 'minimax:MiniMax-M2.7',
        respondModel: 'minimax:MiniMax-M2.7',
      };

      const result = await buildStatsAndLog({}, {}, resolved, [], {}, 0, mockClient, 'channel1');

      expect(result.channel).toBe(null);
    });

    it('should handle missing target message', async () => {
      const snapshot = [
        {
          messageId: 'msg2',
          userId: 'user2',
        },
      ];

      const classification = {
        targetMessageIds: ['msg1'],
      };

      const mockClient = {
        channels: {
          fetch: vi.fn(async () => ({ id: 'channel1', guildId: 'guild1' })),
        },
      };

      const resolved = {
        classifyModel: 'minimax:MiniMax-M2.7',
        respondModel: 'minimax:MiniMax-M2.7',
      };

      const result = await buildStatsAndLog(
        {},
        {},
        resolved,
        snapshot,
        classification,
        0,
        mockClient,
        'channel1',
      );

      expect(result.stats.userId).toBe(null);
    });
  });
});
