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
  extractStats: vi.fn((_msg, model) => ({
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

import { warn } from '../../src/logger.js';
import { safeSend } from '../../src/utils/safeSend.js';

beforeEach(() => {
  vi.clearAllMocks();
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
      expect(result[0].messageId).toBe('msg2');
      expect(result[0].author).toBe('Bob');
      expect(result[0].isContext).toBe(true);
      expect(result[1].messageId).toBe('msg1');
    });

    it('should mark bot messages with [BOT] suffix', async () => {
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

      const result = await fetchChannelContext('channel1', mockClient, [], 15);

      expect(result[0].author).toBe('BotUser [BOT]');
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
    it('should send moderation embed to log channel', async () => {
      const mockLogChannel = {
        id: 'log-channel',
      };

      const mockClient = {
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

      await sendModerationLog(mockClient, classification, snapshot, 'channel1', config);

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
        total_cost_usd: 0.001,
      };

      const respondMessage = {
        total_cost_usd: 0.002,
      };

      const resolved = {
        classifyModel: 'claude-3-haiku',
        respondModel: 'claude-3-sonnet',
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

      const result = await buildStatsAndLog({}, {}, {}, [], {}, 0, mockClient, 'channel1');

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

      const result = await buildStatsAndLog(
        {},
        {},
        {},
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
