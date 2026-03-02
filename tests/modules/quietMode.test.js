import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/redis.js', () => ({
  getRedis: vi.fn().mockReturnValue(null), // default: no Redis
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeReply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/permissions.js', () => ({
  isAdmin: vi.fn().mockReturnValue(false),
  isModerator: vi.fn().mockReturnValue(false),
}));

import {
  _clearMemoryStore,
  clearQuiet,
  getQuiet,
  handleQuietCommand,
  hasQuietPermission,
  isQuietMode,
  memoryStore,
  parseDurationFromContent,
  setQuiet,
} from '../../src/modules/quietMode.js';
import { getRedis } from '../../src/redis.js';
import { isAdmin, isModerator } from '../../src/utils/permissions.js';
import { safeReply } from '../../src/utils/safeSend.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const GUILD_ID = 'guild1';
const CHANNEL_ID = 'chan1';

function makeMessage(overrides = {}) {
  const member = {
    id: 'user1',
    roles: { cache: new Map() },
    permissions: { has: vi.fn().mockReturnValue(false) },
    ...overrides.member,
  };

  return {
    guild: { id: GUILD_ID },
    channel: { id: CHANNEL_ID },
    author: { id: 'user1' },
    member,
    content: overrides.content ?? '@Bot quiet',
    ...overrides,
  };
}

function makeConfig(quietModeOverrides = {}) {
  return {
    quietMode: {
      enabled: true,
      allowedRoles: ['moderator'],
      defaultDurationMinutes: 30,
      maxDurationMinutes: 1440,
      ...quietModeOverrides,
    },
    permissions: {
      moderatorRoleId: 'mod-role',
      adminRoleId: 'admin-role',
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseDurationFromContent', () => {
  it('parses short form "30m"', () => {
    expect(parseDurationFromContent('quiet 30m')).toBe(30 * 60);
  });

  it('parses short form "2h"', () => {
    expect(parseDurationFromContent('quiet 2h')).toBe(2 * 3600);
  });

  it('parses short form "1d"', () => {
    expect(parseDurationFromContent('quiet 1d')).toBe(86400);
  });

  it('parses long form "30 minutes"', () => {
    expect(parseDurationFromContent('quiet for 30 minutes')).toBe(30 * 60);
  });

  it('parses long form "1 hour"', () => {
    expect(parseDurationFromContent('quiet for 1 hour')).toBe(3600);
  });

  it('parses long form "2 hrs"', () => {
    expect(parseDurationFromContent('quiet 2 hrs')).toBe(2 * 3600);
  });

  it('returns default when no duration found', () => {
    expect(parseDurationFromContent('quiet please', 600)).toBe(600);
  });

  it('clamps to minimum (60s)', () => {
    expect(parseDurationFromContent('quiet 1s')).toBe(60);
  });

  it('clamps to maximum (24h)', () => {
    // 48 hours exceeds max
    expect(parseDurationFromContent('quiet 48 hours')).toBe(24 * 3600);
  });
});

describe('hasQuietPermission', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true for allowedRoles=["any"]', () => {
    const member = { roles: { cache: new Map() } };
    expect(hasQuietPermission(member, makeConfig({ allowedRoles: ['any'] }))).toBe(true);
  });

  it('delegates to isModerator for allowedRoles=["moderator"]', () => {
    isModerator.mockReturnValue(true);
    const member = { roles: { cache: new Map() } };
    expect(hasQuietPermission(member, makeConfig({ allowedRoles: ['moderator'] }))).toBe(true);
    expect(isModerator).toHaveBeenCalledWith(member, expect.any(Object));
  });

  it('delegates to isAdmin for allowedRoles=["admin"]', () => {
    isAdmin.mockReturnValue(true);
    const member = { roles: { cache: new Map() } };
    expect(hasQuietPermission(member, makeConfig({ allowedRoles: ['admin'] }))).toBe(true);
    expect(isAdmin).toHaveBeenCalledWith(member, expect.any(Object));
  });

  it('checks specific role IDs', () => {
    const member = { roles: { cache: new Map([['custom-role', true]]) } };
    expect(hasQuietPermission(member, makeConfig({ allowedRoles: ['custom-role'] }))).toBe(true);
  });

  it('returns false when member lacks required role', () => {
    isModerator.mockReturnValue(false);
    const member = { roles: { cache: new Map() } };
    expect(hasQuietPermission(member, makeConfig({ allowedRoles: ['moderator'] }))).toBe(false);
  });
});

describe('storage (memory fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearMemoryStore();
    getRedis.mockReturnValue(null);
  });

  afterEach(() => _clearMemoryStore());

  it('setQuiet stores a record in memory', async () => {
    const until = Date.now() + 60_000;
    await setQuiet(GUILD_ID, CHANNEL_ID, until, 'user1');
    expect(memoryStore.has(`${GUILD_ID}:${CHANNEL_ID}`)).toBe(true);
  });

  it('getQuiet returns the stored record', async () => {
    const until = Date.now() + 60_000;
    await setQuiet(GUILD_ID, CHANNEL_ID, until, 'user1');
    const record = await getQuiet(GUILD_ID, CHANNEL_ID);
    expect(record).toMatchObject({ until, by: 'user1' });
  });

  it('getQuiet returns null for expired entries', async () => {
    const until = Date.now() - 1; // already expired
    memoryStore.set(`${GUILD_ID}:${CHANNEL_ID}`, { until, by: 'user1' });
    const record = await getQuiet(GUILD_ID, CHANNEL_ID);
    expect(record).toBeNull();
    // Expired entry should be pruned
    expect(memoryStore.has(`${GUILD_ID}:${CHANNEL_ID}`)).toBe(false);
  });

  it('getQuiet returns null when no record exists', async () => {
    expect(await getQuiet(GUILD_ID, CHANNEL_ID)).toBeNull();
  });

  it('clearQuiet removes the record', async () => {
    const until = Date.now() + 60_000;
    await setQuiet(GUILD_ID, CHANNEL_ID, until, 'user1');
    await clearQuiet(GUILD_ID, CHANNEL_ID);
    expect(await getQuiet(GUILD_ID, CHANNEL_ID)).toBeNull();
  });

  it('isQuietMode returns true when active', async () => {
    await setQuiet(GUILD_ID, CHANNEL_ID, Date.now() + 60_000, 'user1');
    expect(await isQuietMode(GUILD_ID, CHANNEL_ID)).toBe(true);
  });

  it('isQuietMode returns false when not active', async () => {
    expect(await isQuietMode(GUILD_ID, CHANNEL_ID)).toBe(false);
  });
});

describe('storage (Redis path)', () => {
  const mockRedis = {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _clearMemoryStore();
    getRedis.mockReturnValue(mockRedis);
  });

  afterEach(() => _clearMemoryStore());

  it('setQuiet calls redis.set with EX TTL', async () => {
    const until = Date.now() + 60_000;
    await setQuiet(GUILD_ID, CHANNEL_ID, until, 'user1');
    expect(mockRedis.set).toHaveBeenCalledWith(
      `quiet:${GUILD_ID}:${CHANNEL_ID}`,
      expect.stringContaining('"by":"user1"'),
      'EX',
      expect.any(Number),
    );
  });

  it('getQuiet parses JSON from Redis', async () => {
    const record = { until: Date.now() + 60_000, by: 'user1' };
    mockRedis.get.mockResolvedValue(JSON.stringify(record));
    const result = await getQuiet(GUILD_ID, CHANNEL_ID);
    expect(result).toMatchObject(record);
  });

  it('getQuiet returns null when Redis returns null', async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await getQuiet(GUILD_ID, CHANNEL_ID)).toBeNull();
  });

  it('clearQuiet calls redis.del', async () => {
    await clearQuiet(GUILD_ID, CHANNEL_ID);
    expect(mockRedis.del).toHaveBeenCalledWith(`quiet:${GUILD_ID}:${CHANNEL_ID}`);
  });

  it('falls back to memory on Redis get error', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis down'));
    const until = Date.now() + 60_000;
    memoryStore.set(`${GUILD_ID}:${CHANNEL_ID}`, { until, by: 'fallback' });
    const result = await getQuiet(GUILD_ID, CHANNEL_ID);
    expect(result).toMatchObject({ by: 'fallback' });
  });

  it('falls back to memory on Redis set error', async () => {
    mockRedis.set.mockRejectedValue(new Error('Redis down'));
    const until = Date.now() + 60_000;
    await setQuiet(GUILD_ID, CHANNEL_ID, until, 'user1');
    // Should have written to memory store as fallback
    expect(memoryStore.has(`${GUILD_ID}:${CHANNEL_ID}`)).toBe(true);
  });
});

describe('handleQuietCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearMemoryStore();
    getRedis.mockReturnValue(null);
    isModerator.mockReturnValue(true);
  });

  afterEach(() => _clearMemoryStore());

  it('returns false when quietMode is disabled', async () => {
    const message = makeMessage({ content: '<@bot> quiet' });
    const config = makeConfig({ enabled: false });
    expect(await handleQuietCommand(message, config)).toBe(false);
    expect(safeReply).not.toHaveBeenCalled();
  });

  it('returns false when no guild', async () => {
    const message = makeMessage({ guild: null, content: '<@bot> quiet' });
    expect(await handleQuietCommand(message, makeConfig())).toBe(false);
  });

  it('activates quiet mode with default duration', async () => {
    const message = makeMessage({ content: '<@123> quiet' });
    const result = await handleQuietCommand(message, makeConfig());
    expect(result).toBe(true);
    expect(await isQuietMode(GUILD_ID, CHANNEL_ID)).toBe(true);
    expect(safeReply).toHaveBeenCalledWith(
      message,
      expect.objectContaining({ content: expect.stringContaining('Going quiet for') }),
    );
  });

  it('activates quiet mode with custom duration from message', async () => {
    const message = makeMessage({ content: '<@123> quiet for 1 hour' });
    await handleQuietCommand(message, makeConfig());
    const record = await getQuiet(GUILD_ID, CHANNEL_ID);
    // Should be ~1 hour (3600s) duration; allow ±5s tolerance
    const approxDuration = (record.until - Date.now()) / 1000;
    expect(approxDuration).toBeGreaterThan(3590);
    expect(approxDuration).toBeLessThan(3605);
  });

  it('denies quiet activation without permission', async () => {
    isModerator.mockReturnValue(false);
    const message = makeMessage({ content: '<@123> quiet' });
    const result = await handleQuietCommand(message, makeConfig());
    expect(result).toBe(true);
    expect(await isQuietMode(GUILD_ID, CHANNEL_ID)).toBe(false);
    expect(safeReply).toHaveBeenCalledWith(
      message,
      expect.objectContaining({ content: expect.stringContaining("don't have permission") }),
    );
  });

  it('deactivates quiet mode with "unquiet"', async () => {
    await setQuiet(GUILD_ID, CHANNEL_ID, Date.now() + 60_000, 'user1');
    const message = makeMessage({ content: '<@123> unquiet' });
    const result = await handleQuietCommand(message, makeConfig());
    expect(result).toBe(true);
    expect(await isQuietMode(GUILD_ID, CHANNEL_ID)).toBe(false);
    expect(safeReply).toHaveBeenCalledWith(
      message,
      expect.objectContaining({ content: expect.stringContaining("I'm back") }),
    );
  });

  it('deactivates quiet mode with "resume"', async () => {
    await setQuiet(GUILD_ID, CHANNEL_ID, Date.now() + 60_000, 'user1');
    const message = makeMessage({ content: '<@123> resume' });
    await handleQuietCommand(message, makeConfig());
    expect(await isQuietMode(GUILD_ID, CHANNEL_ID)).toBe(false);
  });

  it('replies "already off" if unquiet when not active', async () => {
    const message = makeMessage({ content: '<@123> unquiet' });
    await handleQuietCommand(message, makeConfig());
    expect(safeReply).toHaveBeenCalledWith(
      message,
      expect.objectContaining({ content: expect.stringContaining('already off') }),
    );
  });

  it('denies unquiet without permission', async () => {
    isModerator.mockReturnValue(false);
    await setQuiet(GUILD_ID, CHANNEL_ID, Date.now() + 60_000, 'user1');
    const message = makeMessage({ content: '<@123> unquiet' });
    await handleQuietCommand(message, makeConfig());
    expect(await isQuietMode(GUILD_ID, CHANNEL_ID)).toBe(true); // still active
    expect(safeReply).toHaveBeenCalledWith(
      message,
      expect.objectContaining({ content: expect.stringContaining("don't have permission") }),
    );
  });

  it('reports status when not in quiet mode', async () => {
    const message = makeMessage({ content: '<@123> status' });
    await handleQuietCommand(message, makeConfig());
    expect(safeReply).toHaveBeenCalledWith(
      message,
      expect.objectContaining({ content: expect.stringContaining('not** active') }),
    );
  });

  it('reports remaining time when in quiet mode', async () => {
    await setQuiet(GUILD_ID, CHANNEL_ID, Date.now() + 30 * 60 * 1000, 'user1');
    const message = makeMessage({ content: '<@123> status' });
    await handleQuietCommand(message, makeConfig());
    expect(safeReply).toHaveBeenCalledWith(
      message,
      expect.objectContaining({ content: expect.stringContaining('expires in') }),
    );
  });

  it('returns false for unrecognized commands', async () => {
    const message = makeMessage({ content: '<@123> hello world' });
    expect(await handleQuietCommand(message, makeConfig())).toBe(false);
    expect(safeReply).not.toHaveBeenCalled();
  });

  it('respects maxDurationMinutes cap', async () => {
    const message = makeMessage({ content: '<@123> quiet 999 hours' });
    const config = makeConfig({ maxDurationMinutes: 60 }); // 1 hour max
    await handleQuietCommand(message, config);
    const record = await getQuiet(GUILD_ID, CHANNEL_ID);
    const approxDuration = (record.until - Date.now()) / 1000;
    expect(approxDuration).toBeLessThanOrEqual(3605); // 1h + 5s tolerance
  });

  it('strips multiple bot mentions from content', async () => {
    // Content with two mentions; command body should be "quiet"
    const message = makeMessage({ content: '<@123> <@456> quiet' });
    const result = await handleQuietCommand(message, makeConfig());
    expect(result).toBe(true);
    expect(await isQuietMode(GUILD_ID, CHANNEL_ID)).toBe(true);
  });
});
