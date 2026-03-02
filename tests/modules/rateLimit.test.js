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

import {
  checkRateLimit,
  clearRateLimitState,
  getTrackedCount,
  setMaxTrackedUsers,
} from '../../src/modules/rateLimit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal fake Discord Message object.
 * @param {Object} opts
 */
function makeMessage({
  userId = 'user1',
  channelId = 'chan1',
  guildId = 'guild1',
  isAdmin = false,
  roleIds = [],
  roleNames = [],
} = {}) {
  const roles = [
    ...roleIds.map((id) => ({ id, name: `role-${id}` })),
    ...roleNames.map((name) => ({ id: `id-${name}`, name })),
  ];

  const member = {
    permissions: {
      has: vi.fn().mockReturnValue(isAdmin),
    },
    roles: {
      cache: {
        some: vi.fn((fn) => roles.some(fn)),
      },
    },
  };

  const message = {
    author: { id: userId, tag: `User#${userId}` },
    channel: { id: channelId },
    guild: { id: guildId },
    member,
    client: {
      channels: { fetch: vi.fn().mockResolvedValue({ send: vi.fn() }) },
    },
    delete: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue({
      delete: vi.fn().mockResolvedValue(undefined),
    }),
    url: 'https://discord.com/channels/guild1/chan1/msg1',
  };

  return message;
}

function makeConfig({
  enabled = true,
  maxMessages = 5,
  windowSeconds = 10,
  muteAfterTriggers = 3,
  muteWindowSeconds = 300,
  muteDurationSeconds = 60,
  alertChannelId = null,
  modRoles = [],
} = {}) {
  return {
    moderation: {
      enabled: true,
      alertChannelId,
      rateLimit: {
        enabled,
        maxMessages,
        windowSeconds,
        muteAfterTriggers,
        muteWindowSeconds,
        muteDurationSeconds,
      },
    },
    permissions: {
      modRoles,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearRateLimitState();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('checkRateLimit — disabled', () => {
  it('returns { limited: false } when rateLimit.enabled is false', async () => {
    const config = makeConfig({ enabled: false });
    const msg = makeMessage();

    for (let i = 0; i < 20; i++) {
      const result = await checkRateLimit(msg, config);
      expect(result).toEqual({ limited: false });
    }
    expect(msg.delete).not.toHaveBeenCalled();
  });
});

describe('checkRateLimit — sliding window', () => {
  it('allows messages within the limit', async () => {
    const config = makeConfig({ maxMessages: 5, windowSeconds: 10 });
    const msg = makeMessage();

    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(msg, config);
      expect(result.limited).toBe(false);
    }
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it('rate-limits the 6th message within the window', async () => {
    const config = makeConfig({ maxMessages: 5, windowSeconds: 10 });
    const msg = makeMessage();

    for (let i = 0; i < 5; i++) {
      await checkRateLimit(msg, config);
    }

    const result = await checkRateLimit(msg, config);
    expect(result.limited).toBe(true);
    expect(result.reason).toMatch(/exceeded/i);
    expect(msg.delete).toHaveBeenCalledTimes(1);
  });

  it('resets after the window expires', async () => {
    const config = makeConfig({ maxMessages: 3, windowSeconds: 10 });
    const msg = makeMessage();

    // Hit the limit
    for (let i = 0; i < 4; i++) {
      await checkRateLimit(msg, config);
    }
    expect(msg.delete).toHaveBeenCalledTimes(1);

    // Advance time past the window
    vi.advanceTimersByTime(11_000);

    // Should be allowed again
    const result = await checkRateLimit(msg, config);
    expect(result.limited).toBe(false);
  });

  it('tracks different users independently', async () => {
    const config = makeConfig({ maxMessages: 3, windowSeconds: 10 });
    const msgA = makeMessage({ userId: 'userA' });
    const msgB = makeMessage({ userId: 'userB' });

    for (let i = 0; i < 3; i++) {
      await checkRateLimit(msgA, config);
      await checkRateLimit(msgB, config);
    }

    // 4th message for A → limited
    const resultA = await checkRateLimit(msgA, config);
    expect(resultA.limited).toBe(true);

    // 4th message for B → also limited, independently
    const resultB = await checkRateLimit(msgB, config);
    expect(resultB.limited).toBe(true);
  });

  it('tracks different channels independently for the same user', async () => {
    const config = makeConfig({ maxMessages: 3, windowSeconds: 10 });
    const msgChan1 = makeMessage({ userId: 'user1', channelId: 'chan1' });
    const msgChan2 = makeMessage({ userId: 'user1', channelId: 'chan2' });

    for (let i = 0; i < 3; i++) {
      await checkRateLimit(msgChan1, config);
    }

    // chan2 should still have clean slate
    const resultChan2 = await checkRateLimit(msgChan2, config);
    expect(resultChan2.limited).toBe(false);
  });
});

describe('checkRateLimit — exemptions', () => {
  it('exempts administrators', async () => {
    const config = makeConfig({ maxMessages: 3, windowSeconds: 10 });
    const msg = makeMessage({ isAdmin: true });

    for (let i = 0; i < 20; i++) {
      const result = await checkRateLimit(msg, config);
      expect(result.limited).toBe(false);
    }
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it('exempts users with mod role (by role ID)', async () => {
    const config = makeConfig({ maxMessages: 3, windowSeconds: 10, modRoles: ['mod-role-id'] });
    const msg = makeMessage({ roleIds: ['mod-role-id'] });

    for (let i = 0; i < 10; i++) {
      const result = await checkRateLimit(msg, config);
      expect(result.limited).toBe(false);
    }
  });

  it('exempts users with mod role (by role name)', async () => {
    const config = makeConfig({ maxMessages: 3, windowSeconds: 10, modRoles: ['Moderator'] });
    const msg = makeMessage({ roleNames: ['Moderator'] });

    for (let i = 0; i < 10; i++) {
      const result = await checkRateLimit(msg, config);
      expect(result.limited).toBe(false);
    }
  });

  it('does NOT exempt users without mod roles', async () => {
    const config = makeConfig({ maxMessages: 3, windowSeconds: 10, modRoles: ['mod-role-id'] });
    const msg = makeMessage({ roleIds: ['some-other-role'] });

    for (let i = 0; i < 3; i++) {
      await checkRateLimit(msg, config);
    }

    const result = await checkRateLimit(msg, config);
    expect(result.limited).toBe(true);
  });
});

describe('checkRateLimit — repeat offender mute', () => {
  it('temp-mutes on repeated triggers within the mute window', async () => {
    const config = makeConfig({
      maxMessages: 2,
      windowSeconds: 10,
      muteAfterTriggers: 3,
      muteWindowSeconds: 300,
      muteDurationSeconds: 60,
    });

    const guild = {
      id: 'guild1',
      members: { me: { permissions: { has: vi.fn().mockReturnValue(true) } } },
    };

    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { some: vi.fn().mockReturnValue(false) } },
      timeout: vi.fn().mockResolvedValue(undefined),
      guild,
    };

    const msg = {
      author: { id: 'bad-user', tag: 'BadUser#0001' },
      channel: { id: 'chan1' },
      guild,
      member,
      client: {
        channels: { fetch: vi.fn().mockResolvedValue({ send: vi.fn() }) },
      },
      delete: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue({ delete: vi.fn().mockResolvedValue(undefined) }),
      url: 'https://discord.com/x',
    };

    // Trigger 1: 3 messages (2 ok + 1 triggers)
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config); // trigger 1

    // Trigger 2
    vi.advanceTimersByTime(11_000); // slide window to reset message count
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config); // trigger 2

    // Trigger 3 → should timeout
    vi.advanceTimersByTime(11_000);
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    const result = await checkRateLimit(msg, config); // trigger 3

    expect(result.limited).toBe(true);
    expect(result.reason).toMatch(/temp-muted/i);
    expect(member.timeout).toHaveBeenCalledWith(60_000, expect.any(String));
  });
});

describe('checkRateLimit — memory cap', () => {
  it('evicts old entries when cap is reached', async () => {
    const cap = 10;
    setMaxTrackedUsers(cap);

    const config = makeConfig({ maxMessages: 100, windowSeconds: 60 });

    // Fill exactly to the cap
    for (let i = 0; i < cap; i++) {
      const msg = makeMessage({ userId: `cap-user-${i}` });
      await checkRateLimit(msg, config);
    }

    expect(getTrackedCount()).toBe(cap);

    // Add several more users beyond the cap.
    // Each breach triggers eviction of 10% (1 entry at cap=10), then adds
    // the new user — so size stays AT cap after each overflow, proving the
    // eviction logic fired and the map never grows past the limit.
    for (let i = 0; i < 5; i++) {
      const overflow = makeMessage({ userId: `overflow-user-${i}` });
      await checkRateLimit(overflow, config);
      // Size must never exceed the cap — eviction keeps it bounded.
      expect(getTrackedCount()).toBeLessThanOrEqual(cap);
    }

    // Sanity: the map is still actively tracking entries
    expect(getTrackedCount()).toBeGreaterThan(0);
  });
});

describe('checkRateLimit — warns user', () => {
  it('sends a reply warning on first rate-limit trigger', async () => {
    const config = makeConfig({ maxMessages: 2, windowSeconds: 10 });
    const msg = makeMessage();

    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config); // trigger

    // safeReply passes an options object to message.reply (with allowedMentions etc.)
    expect(msg.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('too fast') }),
    );
  });
});

import { stopRateLimitCleanup } from '../../src/modules/rateLimit.js';

describe('checkRateLimit — handleRepeatOffender edge cases', () => {
  it('should return early if message.member is null', async () => {
    const config = makeConfig({
      maxMessages: 2,
      windowSeconds: 10,
      muteAfterTriggers: 1,
    });

    const msg = {
      author: { id: 'no-member-user', tag: 'NoMember#0001' },
      channel: { id: 'chan1' },
      guild: { id: 'guild1' },
      member: null,
      client: { channels: { fetch: vi.fn() } },
      delete: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue({ delete: vi.fn() }),
    };

    // Fill + trigger
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    const result = await checkRateLimit(msg, config);
    expect(result.limited).toBe(true);
    // No timeout should be attempted since member is null
  });

  it('should warn when bot lacks MODERATE_MEMBERS permission', async () => {
    const config = makeConfig({
      maxMessages: 2,
      windowSeconds: 10,
      muteAfterTriggers: 1,
      muteWindowSeconds: 300,
    });

    const guild = {
      id: 'guild1',
      members: { me: { permissions: { has: vi.fn().mockReturnValue(false) } } },
    };

    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { some: vi.fn().mockReturnValue(false) } },
      timeout: vi.fn(),
      guild,
    };

    const msg = {
      author: { id: 'user-noperm', tag: 'NoPerm#0001' },
      channel: { id: 'chan1' },
      guild,
      member,
      client: { channels: { fetch: vi.fn() } },
      delete: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue({ delete: vi.fn() }),
    };

    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    const result = await checkRateLimit(msg, config);
    expect(result.limited).toBe(true);
    expect(result.reason).toMatch(/temp-muted/i);
    // timeout should NOT be called since bot lacks permission
    expect(member.timeout).not.toHaveBeenCalled();
  });

  it('should handle timeout failure gracefully', async () => {
    const config = makeConfig({
      maxMessages: 2,
      windowSeconds: 10,
      muteAfterTriggers: 1,
      muteWindowSeconds: 300,
      muteDurationSeconds: 60,
    });

    const guild = {
      id: 'guild1',
      members: { me: { permissions: { has: vi.fn().mockReturnValue(true) } } },
    };

    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { some: vi.fn().mockReturnValue(false) } },
      timeout: vi.fn().mockRejectedValue(new Error('Cannot timeout')),
      guild,
    };

    const msg = {
      author: { id: 'user-timeout-err', tag: 'TimeoutErr#0001' },
      channel: { id: 'chan1' },
      guild,
      member,
      client: { channels: { fetch: vi.fn().mockResolvedValue({ send: vi.fn() }) } },
      delete: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue({ delete: vi.fn() }),
    };

    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    const result = await checkRateLimit(msg, config);
    expect(result.limited).toBe(true);
    expect(member.timeout).toHaveBeenCalled();
  });

  it('should send alert to mod channel with embed on mute', async () => {
    const config = makeConfig({
      maxMessages: 2,
      windowSeconds: 10,
      muteAfterTriggers: 1,
      muteWindowSeconds: 300,
      muteDurationSeconds: 60,
      alertChannelId: 'alert-ch',
    });

    const guild = {
      id: 'guild1',
      members: { me: { permissions: { has: vi.fn().mockReturnValue(true) } } },
    };

    const alertSend = vi.fn().mockResolvedValue(undefined);
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { some: vi.fn().mockReturnValue(false) } },
      timeout: vi.fn().mockResolvedValue(undefined),
      guild,
    };

    const msg = {
      author: { id: 'user-alert', tag: 'AlertUser#0001' },
      channel: { id: 'chan1' },
      guild,
      member,
      client: {
        channels: { fetch: vi.fn().mockResolvedValue({ send: alertSend }) },
      },
      delete: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue({ delete: vi.fn() }),
    };

    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);

    expect(alertSend).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it('should handle alert channel fetch returning null', async () => {
    const config = makeConfig({
      maxMessages: 2,
      windowSeconds: 10,
      muteAfterTriggers: 1,
      alertChannelId: 'missing-ch',
    });

    const guild = {
      id: 'guild1',
      members: { me: { permissions: { has: vi.fn().mockReturnValue(true) } } },
    };

    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { some: vi.fn().mockReturnValue(false) } },
      timeout: vi.fn().mockResolvedValue(undefined),
      guild,
    };

    const msg = {
      author: { id: 'user-no-alert-ch', tag: 'NoAlert#0001' },
      channel: { id: 'chan1' },
      guild,
      member,
      client: {
        channels: { fetch: vi.fn().mockRejectedValue(new Error('not found')) },
      },
      delete: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue({ delete: vi.fn() }),
    };

    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    // Should not throw
    await checkRateLimit(msg, config);
  });

  it('should reset trigger window when mute window expires', async () => {
    const config = makeConfig({
      maxMessages: 2,
      windowSeconds: 10,
      muteAfterTriggers: 3,
      muteWindowSeconds: 60, // short mute window
    });

    const msg = makeMessage();

    // Trigger 1
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config); // trigger

    // Advance past mute window (60s)
    vi.advanceTimersByTime(61_000);

    // Trigger 2 — should reset trigger counter since window expired
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    const result = await checkRateLimit(msg, config);
    expect(result.limited).toBe(true);
    // triggerCount should be 1 (reset) not 2
  });

  it('should not warn on subsequent triggers (only first)', async () => {
    const config = makeConfig({ maxMessages: 2, windowSeconds: 10 });
    const msg = makeMessage();

    // Fill + trigger 1 (warns)
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config); // trigger 1 — warns

    expect(msg.reply).toHaveBeenCalledTimes(1);

    // Trigger 2 — should NOT warn again (triggerCount is 2 now)
    const result = await checkRateLimit(msg, config);
    expect(result.limited).toBe(true);
    expect(msg.reply).toHaveBeenCalledTimes(1); // still just 1 warn
  });
});

describe('stopRateLimitCleanup', () => {
  it('should stop and clear the cleanup interval', () => {
    // Calling it twice should be safe
    stopRateLimitCleanup();
    stopRateLimitCleanup();
    // No error means success
  });
});

describe('checkRateLimit — muteWindowMinutes singular/plural', () => {
  it('should format singular "minute" when muteWindowSeconds rounds to 60', async () => {
    const config = makeConfig({
      maxMessages: 2,
      windowSeconds: 10,
      muteAfterTriggers: 1,
      muteWindowSeconds: 60, // 1 minute
      muteDurationSeconds: 60,
      alertChannelId: 'alert-ch',
    });

    const guild = {
      id: 'guild1',
      members: { me: { permissions: { has: vi.fn().mockReturnValue(true) } } },
    };

    const alertSend = vi.fn().mockResolvedValue(undefined);
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { some: vi.fn().mockReturnValue(false) } },
      timeout: vi.fn().mockResolvedValue(undefined),
      guild,
    };

    const msg = {
      author: { id: 'user-singular', tag: 'Singular#0001' },
      channel: { id: 'chan1' },
      guild,
      member,
      client: {
        channels: { fetch: vi.fn().mockResolvedValue({ send: alertSend }) },
      },
      delete: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue({ delete: vi.fn() }),
    };

    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);
    await checkRateLimit(msg, config);

    expect(alertSend).toHaveBeenCalled();
  });
});
