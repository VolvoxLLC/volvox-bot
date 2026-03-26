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

vi.mock('../../src/modules/levelUpActions.js', () => ({
  executeLevelUpPipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/xpDefaults.js', () => ({
  XP_DEFAULTS: {
    enabled: true,
    levelThresholds: [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000],
    levelActions: [],
    defaultActions: [],
    roleRewards: { stackRoles: true, removeOnLevelDown: false },
  },
}));

import { getPool } from '../../src/db.js';
import { getConfig } from '../../src/modules/config.js';
import { executeLevelUpPipeline } from '../../src/modules/levelUpActions.js';
import {
  buildProgressBar,
  computeLevel,
  handleXpGain,
  sweepCooldowns,
} from '../../src/modules/reputation.js';

const DEFAULT_THRESHOLDS = [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000];

function makeMessage({
  content = 'Hello, this is a long enough message!',
  botAuthor = false,
  guildId = 'guild1',
  userId = 'user1',
} = {}) {
  return {
    content,
    author: {
      bot: botAuthor,
      id: userId,
      displayAvatarURL: vi.fn().mockReturnValue('http://avatar'),
    },
    guild: {
      id: guildId,
      channels: { cache: new Map() },
    },
    member: { roles: { add: vi.fn() } },
  };
}

function makePool({ xp = 50, level = 0 } = {}) {
  return {
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ xp, level, messages_count: 1 }] })
      .mockResolvedValue({ rows: [] }),
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

  it('returns full bar when needed is zero (division guard)', () => {
    // Covers the `if (needed <= 0)` true branch (line 58)
    const bar = buildProgressBar(5, 0);
    expect(bar).toContain('100%');
    expect(bar).not.toContain('NaN');
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

  it('returns early when message has no guild (DM context)', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    const message = makeMessage();
    message.guild = null;

    await handleXpGain(message);

    expect(pool.query).not.toHaveBeenCalled();
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
      },
      xp: {
        enabled: true,
        levelThresholds: DEFAULT_THRESHOLDS,
        levelActions: [],
        defaultActions: [],
        roleRewards: { stackRoles: true, removeOnLevelDown: false },
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
      },
      xp: {
        enabled: true,
        levelThresholds: DEFAULT_THRESHOLDS,
        levelActions: [],
        defaultActions: [],
        roleRewards: { stackRoles: true, removeOnLevelDown: false },
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
      },
      xp: {
        enabled: true,
        levelThresholds: DEFAULT_THRESHOLDS,
        levelActions: [],
        defaultActions: [],
        roleRewards: { stackRoles: true, removeOnLevelDown: false },
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

  it('calls executeLevelUpPipeline on level-up when xp system is enabled', async () => {
    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
      },
      xp: {
        enabled: true,
        levelThresholds: DEFAULT_THRESHOLDS,
        levelActions: [],
        defaultActions: [],
        roleRewards: { stackRoles: true, removeOnLevelDown: false },
      },
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ xp: 100, level: 0 }] })
        .mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(pool);

    const message = makeMessage({ userId: 'pipelineUser', guildId: 'pipelineGuild' });

    await handleXpGain(message);

    expect(executeLevelUpPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        previousLevel: 0,
        newLevel: 1,
        xp: 100,
      }),
    );
  });

  it('does not call executeLevelUpPipeline when xp system is disabled', async () => {
    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
      },
      xp: {
        enabled: false,
        levelThresholds: DEFAULT_THRESHOLDS,
      },
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ xp: 100, level: 0 }] })
        .mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(pool);

    const message = makeMessage({ userId: 'disabledXpUser', guildId: 'disabledXpGuild' });

    await handleXpGain(message);

    expect(executeLevelUpPipeline).not.toHaveBeenCalled();
  });

  it('uses default xpCooldownSeconds and xpPerMessage when not configured', async () => {
    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        // xpCooldownSeconds intentionally omitted → uses ?? 60
        // xpPerMessage intentionally omitted → uses ?? [5, 15]
      },
      xp: {
        enabled: true,
        levelThresholds: DEFAULT_THRESHOLDS,
        levelActions: [],
        defaultActions: [],
        roleRewards: { stackRoles: true, removeOnLevelDown: false },
      },
    });

    const pool = makePool({ xp: 5, level: 0 });
    getPool.mockReturnValue(pool);
    const message = makeMessage({ userId: 'defaultCfgUser', guildId: 'defaultCfgGuild' });

    await handleXpGain(message);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO reputation'),
      expect.any(Array),
    );
  });

  it('logs error and returns early when level UPDATE query throws', async () => {
    const { error: logError } = await import('../../src/logger.js');

    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
      },
      xp: {
        enabled: true,
        levelThresholds: DEFAULT_THRESHOLDS,
        levelActions: [],
        defaultActions: [],
        roleRewards: { stackRoles: true, removeOnLevelDown: false },
      },
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ xp: 100, level: 0 }] }) // upsert — triggers level-up
        .mockRejectedValueOnce(new Error('DB write failed')), // UPDATE level fails
    };
    getPool.mockReturnValue(pool);

    const message = makeMessage({
      userId: 'levelUpdateErrUser',
      guildId: 'levelUpdateErrGuild',
    });

    await expect(handleXpGain(message)).resolves.not.toThrow();
    expect(logError).toHaveBeenCalledWith(
      'Failed to update level',
      expect.objectContaining({ error: 'DB write failed' }),
    );
    // executeLevelUpPipeline should NOT be called since we returned early
    expect(executeLevelUpPipeline).not.toHaveBeenCalled();
  });
});

describe('sweepCooldowns', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes entries older than 120 seconds', async () => {
    // Prime the cooldowns map by triggering handleXpGain for a user
    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
      },
      xp: {
        enabled: true,
        levelThresholds: DEFAULT_THRESHOLDS,
        levelActions: [],
        defaultActions: [],
        roleRewards: { stackRoles: true, removeOnLevelDown: false },
      },
    });
    const pool = makePool({ xp: 5, level: 0 });
    getPool.mockReturnValue(pool);
    const message = makeMessage({ userId: 'sweepOldUser', guildId: 'sweepGuild' });

    await handleXpGain(message);

    // Advance time past the 120-second stale threshold
    vi.advanceTimersByTime(121_000);

    sweepCooldowns();

    // After sweep, cooldown should be gone — next XP gain should go through
    vi.clearAllMocks();
    const pool2 = makePool({ xp: 10, level: 0 });
    getPool.mockReturnValue(pool2);
    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
      },
      xp: {
        enabled: true,
        levelThresholds: DEFAULT_THRESHOLDS,
        levelActions: [],
        defaultActions: [],
        roleRewards: { stackRoles: true, removeOnLevelDown: false },
      },
    });

    await handleXpGain(message);
    expect(pool2.query).toHaveBeenCalled();
  });

  it('keeps entries newer than 120 seconds', async () => {
    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
      },
      xp: {
        enabled: true,
        levelThresholds: DEFAULT_THRESHOLDS,
        levelActions: [],
        defaultActions: [],
        roleRewards: { stackRoles: true, removeOnLevelDown: false },
      },
    });
    const pool = makePool({ xp: 5, level: 0 });
    getPool.mockReturnValue(pool);
    const message = makeMessage({ userId: 'sweepFreshUser', guildId: 'sweepFreshGuild' });

    await handleXpGain(message);

    // Advance time to just under the 120-second stale threshold (but still within 60s XP cooldown)
    vi.advanceTimersByTime(30_000);

    sweepCooldowns();

    // Cooldown should still be active — second call should be blocked
    vi.clearAllMocks();
    const pool2 = makePool({ xp: 10, level: 0 });
    getPool.mockReturnValue(pool2);
    getConfig.mockReturnValue({
      reputation: {
        enabled: true,
        xpPerMessage: [5, 5],
        xpCooldownSeconds: 60,
      },
      xp: {
        enabled: true,
        levelThresholds: DEFAULT_THRESHOLDS,
        levelActions: [],
        defaultActions: [],
        roleRewards: { stackRoles: true, removeOnLevelDown: false },
      },
    });

    await handleXpGain(message);
    // Still within the 60s XP cooldown window — no second DB call
    expect(pool2.query).not.toHaveBeenCalled();
  });
});
