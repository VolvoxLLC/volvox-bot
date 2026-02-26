import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
