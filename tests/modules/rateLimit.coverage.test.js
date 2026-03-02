/**
 * Coverage tests for src/modules/rateLimit.js
 * Tests: memory cap eviction, mute escalation, cooldown reset, exempt users, bot permission check
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';


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
  debug: vi.fn(),
}));

vi.mock('../../src/utils/modExempt.js', () => ({
  isExempt: vi.fn().mockReturnValue(false),
}));
vi.mock('../../src/utils/safeSend.js', () => ({
  safeReply: vi.fn().mockResolvedValue({ delete: vi.fn().mockResolvedValue(undefined) }),
  safeSend: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/utils/sanitizeMentions.js', () => ({
  sanitizeMentions: vi.fn((s) => s),
}));

import {
  checkRateLimit,
  clearRateLimitState,
  getTrackedCount,
  setMaxTrackedUsers,
  stopRateLimitCleanup,
} from '../../src/modules/rateLimit.js';
import { isExempt } from '../../src/utils/modExempt.js';
import { safeReply } from '../../src/utils/safeSend.js';

function makeMessage({
  userId = 'user1',
  channelId = 'chan1',
  guildId = 'guild1',
  hasMePermission = true,
} = {}) {
  const mockSend = vi.fn().mockResolvedValue(undefined);
  const mockAlertChannel = { send: mockSend };

  return {
    author: { id: userId, tag: `User#${userId}` },
    channel: { id: channelId },
    guild: {
      id: guildId,
      members: {
        me: {
          permissions: {
            has: vi.fn().mockReturnValue(hasMePermission),
          },
        },
      },
    },
    member: {
      timeout: vi.fn().mockResolvedValue(undefined),
      guild: {
        id: guildId,
        members: {
          me: {
            permissions: {
              has: vi.fn().mockReturnValue(hasMePermission),
            },
          },
        },
      },
    },
    delete: vi.fn().mockResolvedValue(undefined),
    client: {
      channels: {
        fetch: vi.fn().mockResolvedValue(mockAlertChannel),
      },
    },
  };
}

function makeConfig(overrides = {}) {
  return {
    moderation: {
      rateLimit: {
        enabled: true,
        maxMessages: 3,
        windowSeconds: 5,
        muteAfterTriggers: 2,
        muteWindowSeconds: 60,
        muteDurationSeconds: 30,
        ...overrides,
      },
      alertChannelId: 'alert-channel',
    },
  };
}

async function triggerRateLimit(message, config, count = 4) {
  for (let i = 0; i < count; i++) {
    await checkRateLimit(message, config);
  }
}

describe('rateLimit coverage', () => {
  beforeEach(() => {
    clearRateLimitState();
    vi.clearAllMocks();
    isExempt.mockReturnValue(false);
    stopRateLimitCleanup();
  });

  afterEach(() => {
    clearRateLimitState();
    stopRateLimitCleanup();
  });

  describe('exempt users', () => {
    it('returns not limited when user is exempt', async () => {
      isExempt.mockReturnValue(true);
      const msg = makeMessage();
      const config = makeConfig();
      const result = await checkRateLimit(msg, config);
      expect(result).toEqual({ limited: false });
      expect(msg.delete).not.toHaveBeenCalled();
    });
  });

  describe('disabled rate limiting', () => {
    it('returns not limited when rateLimit not enabled', async () => {
      const msg = makeMessage();
      const config = { moderation: { rateLimit: { enabled: false } } };
      const result = await checkRateLimit(msg, config);
      expect(result).toEqual({ limited: false });
    });

    it('returns not limited when moderation config missing', async () => {
      const msg = makeMessage();
      const config = {};
      const result = await checkRateLimit(msg, config);
      expect(result).toEqual({ limited: false });
    });
  });

  describe('memory cap eviction', () => {
    it('evicts oldest entries when at capacity', async () => {
      setMaxTrackedUsers(3);
      const config = makeConfig({ maxMessages: 100 }); // high limit so no actual rate limiting

      // Fill to capacity with different users
      for (let i = 0; i < 3; i++) {
        await checkRateLimit(makeMessage({ userId: `user${i}`, channelId: `chan${i}` }), config);
      }
      expect(getTrackedCount()).toBe(3);

      // Adding a 4th user should trigger eviction of 10% (at least 1)
      await checkRateLimit(makeMessage({ userId: 'user-new', channelId: 'chan-new' }), config);
      expect(getTrackedCount()).toBeLessThan(4);
    });
  });

  describe('mute escalation', () => {
    it('applies timeout on repeat triggers reaching muteAfterTriggers threshold', async () => {
      const msg = makeMessage();
      const config = makeConfig({ maxMessages: 2, muteAfterTriggers: 2, muteWindowSeconds: 300 });

      // First trigger (warn)
      await triggerRateLimit(msg, config, 3);
      expect(msg.member.timeout).not.toHaveBeenCalled();
      expect(safeReply).toHaveBeenCalled();

      // Second trigger in same window (mute)
      await checkRateLimit(msg, config);
      expect(msg.member.timeout).toHaveBeenCalled();
    });

    it('resets trigger count after mute', async () => {
      const msg = makeMessage();
      const config = makeConfig({ maxMessages: 2, muteAfterTriggers: 2 });

      // Trigger twice to hit mute threshold
      await triggerRateLimit(msg, config, 3); // first trigger (warn)
      await checkRateLimit(msg, config); // second trigger (mute)

      expect(msg.member.timeout).toHaveBeenCalledTimes(1);
    });

    it('resets trigger window when muteWindowMs has elapsed', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

        const msg = makeMessage();
        const config = makeConfig({ maxMessages: 2, muteAfterTriggers: 2, muteWindowSeconds: 1 });

        // First trigger starts the mute window
        await triggerRateLimit(msg, config, 3);
        expect(msg.member.timeout).not.toHaveBeenCalled();
        expect(safeReply).toHaveBeenCalledTimes(1);

        // Move beyond mute window and trigger again: should reset instead of muting
        vi.setSystemTime(new Date('2024-01-01T00:00:06.500Z'));
        await triggerRateLimit(msg, config, 3);

        expect(msg.member.timeout).not.toHaveBeenCalled();
        expect(safeReply).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('skips mute when member is null', async () => {
      const msg = makeMessage();
      msg.member = null;
      const config = makeConfig({ maxMessages: 2, muteAfterTriggers: 2 });

      // Reach mute threshold
      await triggerRateLimit(msg, config, 3);
      await checkRateLimit(msg, config);
      // No error should be thrown
    });

    it('handles timeout failure gracefully', async () => {
      const msg = makeMessage();
      msg.member.timeout = vi.fn().mockRejectedValue(new Error('Missing permissions'));
      const config = makeConfig({ maxMessages: 2, muteAfterTriggers: 2 });

      await triggerRateLimit(msg, config, 3); // first trigger
      await expect(checkRateLimit(msg, config)).resolves.toBeDefined(); // second trigger (mute, but throws)
    });
  });

  describe('bot lacks MODERATE_MEMBERS permission', () => {
    it('logs warn and skips timeout when bot lacks permission', async () => {
      const { warn } = await import('../../src/logger.js');
      const msg = makeMessage({ hasMePermission: false });
      const config = makeConfig({ maxMessages: 2, muteAfterTriggers: 2 });

      await triggerRateLimit(msg, config, 3); // first trigger
      await checkRateLimit(msg, config); // second trigger tries to mute

      expect(msg.member.timeout).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit: bot lacks MODERATE_MEMBERS permission'),
        expect.any(Object),
      );
    });
  });

  describe('alert channel', () => {
    it('sends alert to mod channel on mute', async () => {
      const msg = makeMessage();
      const config = makeConfig({ maxMessages: 2, muteAfterTriggers: 2 });

      await triggerRateLimit(msg, config, 3); // warn
      await checkRateLimit(msg, config); // mute

      expect(msg.client.channels.fetch).toHaveBeenCalledWith('alert-channel');
    });

    it('skips alert when alertChannelId is not configured', async () => {
      const msg = makeMessage();
      const config = makeConfig({ maxMessages: 2, muteAfterTriggers: 2 });
      delete config.moderation.alertChannelId;

      await triggerRateLimit(msg, config, 3);
      await checkRateLimit(msg, config);

      expect(msg.client.channels.fetch).not.toHaveBeenCalled();
    });

    it('skips alert when channel fetch returns null', async () => {
      const msg = makeMessage();
      msg.client.channels.fetch = vi.fn().mockResolvedValue(null);
      const config = makeConfig({ maxMessages: 2, muteAfterTriggers: 2 });

      await triggerRateLimit(msg, config, 3);
      // Should not throw even if channel is null
      await expect(checkRateLimit(msg, config)).resolves.toBeDefined();
    });
  });

  describe('cooldown reset', () => {
    it('only warns on first trigger, not subsequent ones within window', async () => {
      const msg = makeMessage();
      const config = makeConfig({ maxMessages: 2, muteAfterTriggers: 5 });

      await triggerRateLimit(msg, config, 3); // first trigger: warn
      vi.clearAllMocks();
      isExempt.mockReturnValue(false);

      // Second trigger in same window: no warn (triggerCount > 1, not 1)
      await checkRateLimit(msg, config);
      expect(safeReply).not.toHaveBeenCalled();
    });
  });

  describe('window sliding', () => {
    it('correctly returns not limited when under threshold', async () => {
      const msg = makeMessage();
      const config = makeConfig({ maxMessages: 5 });

      for (let i = 0; i < 5; i++) {
        const result = await checkRateLimit(msg, config);
        expect(result).toEqual({ limited: false });
      }
    });

    it('returns limited when threshold exceeded', async () => {
      const msg = makeMessage();
      const config = makeConfig({ maxMessages: 2 });

      await checkRateLimit(msg, config);
      await checkRateLimit(msg, config);
      const result = await checkRateLimit(msg, config);
      expect(result.limited).toBe(true);
    });
  });

  describe('warnUser with null reply', () => {
    it('handles null reply from safeReply gracefully', async () => {
      safeReply.mockResolvedValueOnce(null); // simulate safeReply failing silently
      const msg = makeMessage();
      const config = makeConfig({ maxMessages: 2 });

      // Trigger rate limit - this calls warnUser which calls safeReply
      await checkRateLimit(msg, config);
      await checkRateLimit(msg, config);
      const result = await checkRateLimit(msg, config); // triggers

      expect(result.limited).toBe(true);
      // No error thrown even when reply is null
    });
  });
});
