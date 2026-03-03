import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(),
}));

import { ActivityType } from 'discord.js';
import {
  applyPresence,
  getActivities,
  interpolateActivity,
  reloadBotStatus,
  resolvePresenceConfig,
  startBotStatus,
  stopBotStatus,
} from '../../src/modules/botStatus.js';
import { getConfig } from '../../src/modules/config.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeClient({ memberCount = 10, guildCount = 2, username = 'TestBot' } = {}) {
  const setPresence = vi.fn();
  const guild = { memberCount };
  return {
    user: { username, setPresence: setPresence },
    guilds: {
      cache: {
        size: guildCount,
        reduce: (_fn, initial) => {
          // simulate reduce over guilds
          let acc = initial;
          for (let i = 0; i < guildCount; i++) acc += guild.memberCount;
          return acc;
        },
      },
    },
    setPresence,
  };
}

function makeConfig(overrides = {}) {
  return {
    botStatus: {
      enabled: true,
      status: 'online',
      activityType: 'Playing',
      activities: ['with {memberCount} members', 'in {guildCount} servers'],
      rotateIntervalMs: 100,
      ...overrides,
    },
  };
}

// ── interpolateActivity ────────────────────────────────────────────────────

describe('interpolateActivity', () => {
  it('replaces {memberCount} with total member count', () => {
    const client = makeClient({ memberCount: 5, guildCount: 2 });
    const result = interpolateActivity('with {memberCount} members', client);
    expect(result).toBe('with 10 members');
  });

  it('replaces {guildCount} with guild count', () => {
    const client = makeClient({ guildCount: 3 });
    const result = interpolateActivity('in {guildCount} servers', client);
    expect(result).toBe('in 3 servers');
  });

  it('replaces {botName} with bot username', () => {
    const client = makeClient({ username: 'VolvoxBot' });
    const result = interpolateActivity('{botName} here', client);
    expect(result).toBe('VolvoxBot here');
  });

  it('replaces multiple variables in one string', () => {
    const client = makeClient({ memberCount: 7, guildCount: 1, username: 'MyBot' });
    const result = interpolateActivity(
      '{botName}: {memberCount} members in {guildCount} servers',
      client,
    );
    expect(result).toBe('MyBot: 7 members in 1 servers');
  });

  it('returns text unchanged when client is null', () => {
    const result = interpolateActivity('hello {memberCount}', null);
    expect(result).toBe('hello {memberCount}');
  });

  it('returns text unchanged when text is not a string', () => {
    const client = makeClient();
    const result = interpolateActivity(null, client);
    expect(result).toBeNull();
  });

  it('defaults memberCount to 0 when guilds cache unavailable', () => {
    const client = { user: { username: 'Bot' }, guilds: null };
    const result = interpolateActivity('{memberCount}', client);
    expect(result).toBe('0');
  });
});

// ── resolvePresenceConfig ──────────────────────────────────────────────────

describe('resolvePresenceConfig', () => {
  it('returns configured status when valid', () => {
    const { status } = resolvePresenceConfig({ status: 'idle', activityType: 'Playing' });
    expect(status).toBe('idle');
  });

  it('falls back to "online" for invalid status', () => {
    const { status } = resolvePresenceConfig({ status: 'invalid', activityType: 'Playing' });
    expect(status).toBe('online');
  });

  it('falls back to "online" when config is null', () => {
    const { status } = resolvePresenceConfig(null);
    expect(status).toBe('online');
  });

  it.each(['online', 'idle', 'dnd', 'invisible'])('accepts valid status: %s', (s) => {
    const { status } = resolvePresenceConfig({ status: s });
    expect(status).toBe(s);
  });

  it('maps "Playing" to ActivityType.Playing', () => {
    const { activityType } = resolvePresenceConfig({ activityType: 'Playing' });
    expect(activityType).toBe(ActivityType.Playing);
  });

  it('maps "Watching" to ActivityType.Watching', () => {
    const { activityType } = resolvePresenceConfig({ activityType: 'Watching' });
    expect(activityType).toBe(ActivityType.Watching);
  });

  it('maps "Listening" to ActivityType.Listening', () => {
    const { activityType } = resolvePresenceConfig({ activityType: 'Listening' });
    expect(activityType).toBe(ActivityType.Listening);
  });

  it('maps "Competing" to ActivityType.Competing', () => {
    const { activityType } = resolvePresenceConfig({ activityType: 'Competing' });
    expect(activityType).toBe(ActivityType.Competing);
  });

  it('maps "Custom" to ActivityType.Custom', () => {
    const { activityType } = resolvePresenceConfig({ activityType: 'Custom' });
    expect(activityType).toBe(ActivityType.Custom);
  });

  it('falls back to Playing for unknown activity type', () => {
    const { activityType } = resolvePresenceConfig({ activityType: 'Unknown' });
    expect(activityType).toBe(ActivityType.Playing);
  });

  it('falls back to Playing when activityType is missing', () => {
    const { activityType } = resolvePresenceConfig({});
    expect(activityType).toBe(ActivityType.Playing);
  });
});

// ── getActivities ──────────────────────────────────────────────────────────

describe('getActivities', () => {
  it('returns configured activities array', () => {
    const result = getActivities({ activities: ['a', 'b', 'c'] });
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('filters out empty/whitespace strings', () => {
    const result = getActivities({ activities: ['good', '', '   ', 'also good'] });
    expect(result).toEqual(['good', 'also good']);
  });

  it('returns default activity when activities is empty array', () => {
    const result = getActivities({ activities: [] });
    expect(result).toEqual(['with Discord']);
  });

  it('returns default activity when activities is missing', () => {
    const result = getActivities({});
    expect(result).toEqual(['with Discord']);
  });

  it('returns default activity when cfg is null', () => {
    const result = getActivities(null);
    expect(result).toEqual(['with Discord']);
  });
});

// ── applyPresence ──────────────────────────────────────────────────────────

describe('applyPresence', () => {
  afterEach(() => {
    stopBotStatus();
    vi.clearAllMocks();
  });

  it('calls setPresence with correct status and activity', () => {
    const cfg = makeConfig({ activities: ['hello world'] });
    getConfig.mockReturnValue(cfg);
    const client = makeClient();
    applyPresence(client);
    expect(client.user.setPresence).toHaveBeenCalledWith({
      status: 'online',
      activities: [{ name: 'hello world', type: ActivityType.Playing }],
    });
  });

  it('interpolates variables in activity text', () => {
    const cfg = makeConfig({ activities: ['with {memberCount} members'] });
    getConfig.mockReturnValue(cfg);
    const client = makeClient({ memberCount: 5, guildCount: 2 });
    applyPresence(client);
    expect(client.user.setPresence).toHaveBeenCalledWith(
      expect.objectContaining({
        activities: [expect.objectContaining({ name: 'with 10 members' })],
      }),
    );
  });

  it('does nothing when botStatus.enabled is false', () => {
    getConfig.mockReturnValue(makeConfig({ enabled: false }));
    const client = makeClient();
    applyPresence(client);
    expect(client.user.setPresence).not.toHaveBeenCalled();
  });

  it('does nothing when botStatus config is missing', () => {
    getConfig.mockReturnValue({});
    const client = makeClient();
    applyPresence(client);
    expect(client.user.setPresence).not.toHaveBeenCalled();
  });

  it('uses dnd status when configured', () => {
    getConfig.mockReturnValue(makeConfig({ status: 'dnd', activities: ['busy'] }));
    const client = makeClient();
    applyPresence(client);
    expect(client.user.setPresence).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'dnd' }),
    );
  });

  it('warns instead of throwing when setPresence throws', async () => {
    const { warn } = await import('../../src/logger.js');
    getConfig.mockReturnValue(makeConfig({ activities: ['hi'] }));
    const client = makeClient();
    client.user.setPresence = vi.fn(() => {
      throw new Error('Network error');
    });
    expect(() => applyPresence(client)).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

// ── startBotStatus / stopBotStatus ─────────────────────────────────────────

describe('startBotStatus / stopBotStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopBotStatus();
    vi.useRealTimers();
  });

  it('calls setPresence immediately on start', () => {
    getConfig.mockReturnValue(makeConfig({ activities: ['hello'] }));
    const client = makeClient();
    startBotStatus(client);
    expect(client.user.setPresence).toHaveBeenCalledTimes(1);
  });

  it('rotates activities on interval', () => {
    const cfg = makeConfig({
      activities: ['activity A', 'activity B', 'activity C'],
      rotateIntervalMs: 100,
    });
    getConfig.mockReturnValue(cfg);
    const client = makeClient();

    startBotStatus(client);
    expect(client.user.setPresence).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(client.user.setPresence).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(100);
    expect(client.user.setPresence).toHaveBeenCalledTimes(3);
  });

  it('does not start interval for single activity', () => {
    getConfig.mockReturnValue(makeConfig({ activities: ['only one'], rotateIntervalMs: 100 }));
    const client = makeClient();
    startBotStatus(client);

    vi.advanceTimersByTime(500);
    // Only the initial call — no rotation
    expect(client.user.setPresence).toHaveBeenCalledTimes(1);
  });

  it('stops rotation on stopBotStatus', () => {
    const cfg = makeConfig({ activities: ['A', 'B'], rotateIntervalMs: 100 });
    getConfig.mockReturnValue(cfg);
    const client = makeClient();

    startBotStatus(client);
    vi.advanceTimersByTime(100);
    expect(client.user.setPresence).toHaveBeenCalledTimes(2);

    stopBotStatus();
    vi.advanceTimersByTime(500);
    // No new calls after stop
    expect(client.user.setPresence).toHaveBeenCalledTimes(2);
  });

  it('does nothing when disabled', () => {
    getConfig.mockReturnValue(makeConfig({ enabled: false }));
    const client = makeClient();
    startBotStatus(client);
    vi.advanceTimersByTime(500);
    expect(client.user.setPresence).not.toHaveBeenCalled();
  });

  it('uses default interval of 30s when rotateIntervalMs is missing', () => {
    const cfg = makeConfig({ activities: ['A', 'B'], rotateIntervalMs: undefined });
    getConfig.mockReturnValue(cfg);
    const client = makeClient();

    startBotStatus(client);
    vi.advanceTimersByTime(29_999);
    expect(client.user.setPresence).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(client.user.setPresence).toHaveBeenCalledTimes(2);
  });

  it('wraps activity index around when activities cycle through', () => {
    const cfg = makeConfig({
      activities: ['first', 'second'],
      rotateIntervalMs: 100,
    });
    getConfig.mockReturnValue(cfg);
    const client = makeClient();

    startBotStatus(client);
    // Initial: first
    const calls = client.user.setPresence.mock.calls;
    expect(calls[0][0].activities[0].name).toBe('first');

    vi.advanceTimersByTime(100);
    expect(calls[1][0].activities[0].name).toBe('second');

    vi.advanceTimersByTime(100);
    // Wraps back to first
    expect(calls[2][0].activities[0].name).toBe('first');
  });
});

// ── reloadBotStatus ────────────────────────────────────────────────────────

describe('reloadBotStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopBotStatus();
    vi.useRealTimers();
  });

  it('restarts with updated config', () => {
    const cfg1 = makeConfig({ activities: ['old activity'], rotateIntervalMs: 100 });
    const cfg2 = makeConfig({
      activities: ['new activity 1', 'new activity 2'],
      rotateIntervalMs: 100,
    });

    getConfig.mockReturnValue(cfg1);
    const client = makeClient();
    startBotStatus(client);

    expect(client.user.setPresence.mock.calls[0][0].activities[0].name).toBe('old activity');

    // Update config and reload
    getConfig.mockReturnValue(cfg2);
    reloadBotStatus(client);

    const lastCall = client.user.setPresence.mock.calls.at(-1);
    expect(lastCall[0].activities[0].name).toBe('new activity 1');
  });

  it('uses cached client when none is provided', () => {
    getConfig.mockReturnValue(makeConfig({ activities: ['hello'] }));
    const client = makeClient();
    startBotStatus(client);

    const callsBefore = client.user.setPresence.mock.calls.length;
    reloadBotStatus(); // no client arg
    expect(client.user.setPresence.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
