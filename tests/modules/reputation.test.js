import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn(),
}));

vi.mock('discord.js', () => {
  class MockEmbedBuilder {
    setColor() { return this; }
    setTitle() { return this; }
    setDescription() { return this; }
    setThumbnail() { return this; }
    addFields() { return this; }
    setTimestamp() { return this; }
  }
  return { EmbedBuilder: MockEmbedBuilder };
});

import { getPool } from '../../src/db.js';
import { getConfig } from '../../src/modules/config.js';
import { safeSend } from '../../src/utils/safeSend.js';
import {
  buildProgressBar,
  computeLevel,
  handleXpGain,
} from '../../src/modules/reputation.js';

const DEFAULT_THRESHOLDS = [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000];

function makeMessage({
  content = 'Hello, this is a long enough message!',
  botAuthor = false,
  guildId = 'guild1',
  userId = 'user1',
  roleAdd = vi.fn(),
  channelCache = new Map(),
} = {}) {
  return {
    content,
    author: { bot: botAuthor, id: userId, displayAvatarURL: vi.fn().mockReturnValue('http://avatar') },
    guild: {
      id: guildId,
      channels: { cache: channelCache },
    },
    member: { roles: { add: roleAdd } },
  };
}

function makePool({ xp = 50, level = 0 } = {}) {
  return {
    query: vi.fn().mockResolvedValueOnce({ rows: [{ xp, level, messages_count: 1 }] }).mockResolvedValue({ rows: [] }),
  };
}

describe('computeLevel', () => {
  it('returns 0 for 0 XP', () => {
    expect(computeLevel(0, DEFAULT_THRESHOLDS)).toBe(0);
  });

  it('returns 1 at exactly the first threshold', () => {
    expect(computeLevel(100, DEFAULT_THRESHOLDS)).toBe(1);
  });

  it('returns max level at max threshold', () => {
    expect(computeLevel(12000, DEFAULT_THRESHOLDS)).toBe(10);
  });

  it('returns correct intermediate level', () => {
    expect(computeLevel(350, DEFAULT_THRESHOLDS)).toBe(2); // >= 300
  });
});

describe('buildProgressBar', () => {
  it('renders a 10-segment bar', () => {
    const bar = buildProgressBar(5, 10);
    expect(bar).toMatch(/^[▓░]+ \d+%$/);
    expect(bar.replace(/ \d+%/, '')).toHaveLength(10);
  });

  it('shows 100% when current >= needed', () => {
    const bar = buildProgressBar(10, 10);
    expect(bar).toContain('100%');
  });

  it('shows 0% when no progress', () => {
    const bar = buildProgressBar(0, 100);
    expect(bar).toContain('0%');
  });
});

describe('handleXpGain', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when reputation is disabled', async () => {
    getConfig.mockReturnValue({ reputation: { enabled: false } });
    const pool = makePool();
    getPool.mockReturnValue(pool);
    const message = makeMessage();

    await handleXpGain(message);

    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing for messages shorter than 10 chars', async () => {
    getConfig.mockReturnValue({ reputation: { enabled: true } });
    const pool = makePool();
    getPool.mockReturnValue(pool);
    const message = makeMessage({ content: 'hi' });

    await handleXpGain(message);

    expect(pool.query).not.toHaveBeenCalled();
  });

  it('awards XP for a valid message', async () => {
    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
        levelThresholds: DEFAULT_THRESHOLDS,
        roleRewards: {},
        announceChannelId: null,
      },
    });
    const pool = makePool({ xp: 5, level: 0 });
    getPool.mockReturnValue(pool);
    const message = makeMessage({ userId: 'uniqueuser1' });

    await handleXpGain(message);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO reputation'),
      expect.arrayContaining(['guild1', 'uniqueuser1', 5]),
    );
  });

  it('enforces cooldown — second call within window is ignored', async () => {
    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
        levelThresholds: DEFAULT_THRESHOLDS,
        roleRewards: {},
        announceChannelId: null,
      },
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ xp: 5, level: 0 }] })
        .mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(pool);

    // Use a unique user ID to avoid cross-test cooldown contamination
    const message = makeMessage({ userId: 'cooldownUser99', guildId: 'cooldownGuild' });

    await handleXpGain(message);
    await handleXpGain(message); // second call — should be blocked by cooldown

    // Only one INSERT should have fired
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('allows XP gain after cooldown expires', async () => {
    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
        levelThresholds: DEFAULT_THRESHOLDS,
        roleRewards: {},
        announceChannelId: null,
      },
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ xp: 5, level: 0 }] })
        .mockResolvedValue({ rows: [{ xp: 10, level: 0 }] }),
    };
    getPool.mockReturnValue(pool);

    const message = makeMessage({ userId: 'cooldownUserExpiry', guildId: 'cooldownGuildExp' });

    await handleXpGain(message);

    // Advance time past cooldown
    vi.advanceTimersByTime(61 * 1000);

    await handleXpGain(message);

    // Should have queried twice (both INSERT calls)
    expect(pool.query.mock.calls.filter((c) => c[0].includes('INSERT')).length).toBe(2);
  });

  it('detects level-up and sends announcement', async () => {
    const announceChannelId = 'announce-channel';
    const announceChannel = { id: announceChannelId };
    const channelCache = new Map([[announceChannelId, announceChannel]]);

    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
        levelThresholds: DEFAULT_THRESHOLDS,
        roleRewards: {},
        announceChannelId,
      },
    });

    // XP returned is 100, which triggers level 1 (current stored level is 0)
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ xp: 100, level: 0 }] }) // upsert result
        .mockResolvedValue({ rows: [] }), // UPDATE level
    };
    getPool.mockReturnValue(pool);

    const message = makeMessage({
      userId: 'levelUpUser',
      guildId: 'levelUpGuild',
      channelCache,
    });

    await handleXpGain(message);

    expect(safeSend).toHaveBeenCalledWith(announceChannel, expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it('assigns role reward on level-up when configured', async () => {
    const announceChannelId = 'announce-ch-role';
    const announceChannel = { id: announceChannelId };
    const channelCache = new Map([[announceChannelId, announceChannel]]);
    const roleId = 'role-level-1';
    const roleAdd = vi.fn().mockResolvedValue(undefined);

    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
        levelThresholds: DEFAULT_THRESHOLDS,
        roleRewards: { '1': roleId },
        announceChannelId,
      },
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ xp: 100, level: 0 }] })
        .mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(pool);

    const message = makeMessage({
      userId: 'roleRewardUser',
      guildId: 'roleRewardGuild',
      roleAdd,
      channelCache,
    });

    await handleXpGain(message);

    expect(roleAdd).toHaveBeenCalledWith(roleId);
  });
});
