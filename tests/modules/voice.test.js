import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({ voice: { enabled: true } }),
}));

import { getPool } from '../../src/db.js';
import { getConfig } from '../../src/modules/config.js';
import {
  clearActiveSessions,
  closeSession,
  exportVoiceSessions,
  flushActiveSessions,
  formatDuration,
  getActiveSessionCount,
  getUserVoiceStats,
  getVoiceLeaderboard,
  handleVoiceStateUpdate,
  openSession,
  startVoiceFlush,
  stopVoiceFlush,
} from '../../src/modules/voice.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePool({ queryResult = { rows: [], rowCount: 1 } } = {}) {
  return {
    query: vi.fn().mockResolvedValue(queryResult),
  };
}

function makeVoiceState({ guildId, userId, channelId, isBot = false } = {}) {
  return {
    channelId: channelId ?? null,
    guild: { id: guildId ?? 'guild1' },
    member: {
      user: { id: userId ?? 'user1', bot: isBot },
    },
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  clearActiveSessions();
  getConfig.mockReturnValue({ voice: { enabled: true } });
});

afterEach(() => {
  stopVoiceFlush();
  clearActiveSessions();
});

// ─── formatDuration ───────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats seconds under 1 minute', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes only', () => {
    expect(formatDuration(90)).toBe('1m');
    expect(formatDuration(3599)).toBe('59m');
  });

  it('formats hours only (no remainder minutes)', () => {
    expect(formatDuration(7200)).toBe('2h');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3661)).toBe('1h 1m');
  });

  it('handles 0 seconds', () => {
    expect(formatDuration(0)).toBe('0s');
  });
});

// ─── openSession ──────────────────────────────────────────────────────────────

describe('openSession', () => {
  it('inserts a row and stores in-memory session', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);

    await openSession('g1', 'u1', 'ch1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO voice_sessions/);
    expect(params).toEqual(expect.arrayContaining(['g1', 'u1', 'ch1']));
    expect(getActiveSessionCount()).toBe(1);
  });

  it('closes existing session before opening a new one', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);

    await openSession('g1', 'u1', 'ch1');
    await openSession('g1', 'u1', 'ch2');

    // First call: INSERT (open ch1)
    // Second call: UPDATE (close ch1) + INSERT (open ch2)
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(getActiveSessionCount()).toBe(1);
  });

  it('throws and propagates DB errors', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('DB error')) };
    getPool.mockReturnValue(pool);

    await expect(openSession('g1', 'u1', 'ch1')).rejects.toThrow('DB error');
  });
});

// ─── closeSession ─────────────────────────────────────────────────────────────

describe('closeSession', () => {
  it('returns null if no open session exists', async () => {
    const result = await closeSession('g1', 'u1');
    expect(result).toBeNull();
  });

  it('closes session and returns duration', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);

    await openSession('g1', 'u1', 'ch1');

    // Simulate 10 seconds elapsed
    vi.useFakeTimers();
    vi.advanceTimersByTime(10_000);

    const duration = await closeSession('g1', 'u1');

    vi.useRealTimers();

    expect(duration).toBeGreaterThanOrEqual(0);
    expect(getActiveSessionCount()).toBe(0);
    // UPDATE call should include duration
    const updateCall = pool.query.mock.calls.find((c) => c[0].includes('UPDATE'));
    expect(updateCall).toBeDefined();
  });
});

// ─── handleVoiceStateUpdate ───────────────────────────────────────────────────

describe('handleVoiceStateUpdate', () => {
  it('opens a session when user joins a channel', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);

    const old = makeVoiceState({ channelId: null });
    const next = makeVoiceState({ channelId: 'ch1' });

    await handleVoiceStateUpdate(old, next);

    expect(getActiveSessionCount()).toBe(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO voice_sessions'),
      expect.arrayContaining(['guild1', 'user1', 'ch1']),
    );
  });

  it('closes a session when user leaves all channels', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);

    // First join
    await handleVoiceStateUpdate(
      makeVoiceState({ channelId: null }),
      makeVoiceState({ channelId: 'ch1' }),
    );
    expect(getActiveSessionCount()).toBe(1);

    // Then leave
    await handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'ch1' }),
      makeVoiceState({ channelId: null }),
    );
    expect(getActiveSessionCount()).toBe(0);
  });

  it('moves session when user switches channels', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);

    // Join ch1
    await handleVoiceStateUpdate(
      makeVoiceState({ channelId: null }),
      makeVoiceState({ channelId: 'ch1' }),
    );

    // Move to ch2
    await handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'ch1' }),
      makeVoiceState({ channelId: 'ch2' }),
    );

    expect(getActiveSessionCount()).toBe(1);
    // Last open session should be for ch2
    // We can verify by checking if the last INSERT used ch2
    const inserts = pool.query.mock.calls.filter((c) => c[0].includes('INSERT'));
    const lastInsert = inserts[inserts.length - 1];
    expect(lastInsert[1]).toContain('ch2');
  });

  it('ignores bot users', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);

    const old = makeVoiceState({ channelId: null, isBot: true });
    const next = makeVoiceState({ channelId: 'ch1', isBot: true });

    await handleVoiceStateUpdate(old, next);

    expect(pool.query).not.toHaveBeenCalled();
    expect(getActiveSessionCount()).toBe(0);
  });

  it('ignores events when voice is disabled', async () => {
    getConfig.mockReturnValue({ voice: { enabled: false } });
    const pool = makePool();
    getPool.mockReturnValue(pool);

    const old = makeVoiceState({ channelId: null });
    const next = makeVoiceState({ channelId: 'ch1' });

    await handleVoiceStateUpdate(old, next);

    expect(pool.query).not.toHaveBeenCalled();
  });

  it('ignores mute/deafen changes (no channel change)', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);

    const state = makeVoiceState({ channelId: 'ch1' });
    // Both old and new have same channel → mute/deafen change
    await handleVoiceStateUpdate(state, state);

    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing if guild or user id is missing', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);

    const badState = { channelId: 'ch1', guild: null, member: null };
    await handleVoiceStateUpdate(badState, badState);

    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ─── getVoiceLeaderboard ──────────────────────────────────────────────────────

describe('getVoiceLeaderboard', () => {
  it('returns leaderboard rows with correct shape', async () => {
    const pool = makePool({
      queryResult: {
        rows: [
          { user_id: 'u1', total_seconds: '3600', session_count: '5' },
          { user_id: 'u2', total_seconds: '1800', session_count: '2' },
        ],
      },
    });
    getPool.mockReturnValue(pool);

    const rows = await getVoiceLeaderboard('g1', { limit: 10, period: 'week' });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ user_id: 'u1', total_seconds: 3600, session_count: 5 });
    expect(rows[1]).toEqual({ user_id: 'u2', total_seconds: 1800, session_count: 2 });
  });

  it('uses monthly window when period=month', async () => {
    const pool = makePool({ queryResult: { rows: [] } });
    getPool.mockReturnValue(pool);

    await getVoiceLeaderboard('g1', { period: 'month' });

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/30 days/);
  });

  it('omits window clause when period=all', async () => {
    const pool = makePool({ queryResult: { rows: [] } });
    getPool.mockReturnValue(pool);

    await getVoiceLeaderboard('g1', { period: 'all' });

    const [sql] = pool.query.mock.calls[0];
    expect(sql).not.toMatch(/INTERVAL/);
  });
});

// ─── getUserVoiceStats ────────────────────────────────────────────────────────

describe('getUserVoiceStats', () => {
  it('returns zero stats when no sessions exist', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ total_seconds: '0', session_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getPool.mockReturnValue(pool);

    const stats = await getUserVoiceStats('g1', 'u1');

    expect(stats).toEqual({ total_seconds: 0, session_count: 0, favorite_channel: null });
  });

  it('returns correct stats when sessions exist', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ total_seconds: '7200', session_count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ channel_id: 'ch42', total: '7200' }] }),
    };
    getPool.mockReturnValue(pool);

    const stats = await getUserVoiceStats('g1', 'u1');

    expect(stats).toEqual({ total_seconds: 7200, session_count: 3, favorite_channel: 'ch42' });
  });
});

// ─── exportVoiceSessions ─────────────────────────────────────────────────────

describe('exportVoiceSessions', () => {
  it('returns session rows', async () => {
    const mockRows = [
      {
        id: 1,
        user_id: 'u1',
        channel_id: 'ch1',
        joined_at: new Date(),
        left_at: new Date(),
        duration_seconds: 60,
      },
    ];
    const pool = makePool({ queryResult: { rows: mockRows } });
    getPool.mockReturnValue(pool);

    const result = await exportVoiceSessions('g1', { period: 'all', limit: 100 });

    expect(result).toEqual(mockRows);
  });

  it('applies weekly window filter', async () => {
    const pool = makePool({ queryResult: { rows: [] } });
    getPool.mockReturnValue(pool);

    await exportVoiceSessions('g1', { period: 'week' });

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/7 days/);
  });
});

// ─── flushActiveSessions ─────────────────────────────────────────────────────

describe('flushActiveSessions', () => {
  it('does nothing when no active sessions', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);

    await flushActiveSessions();

    expect(pool.query).not.toHaveBeenCalled();
  });

  it('updates duration without closing (left_at stays NULL)', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);

    await openSession('g1', 'u1', 'ch1');
    pool.query.mockClear(); // clear the INSERT call

    await flushActiveSessions();

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE voice_sessions/);
    expect(sql).toMatch(/left_at IS NULL/);
    expect(getActiveSessionCount()).toBe(1); // still open
  });
});

// ─── startVoiceFlush / stopVoiceFlush ─────────────────────────────────────────

describe('startVoiceFlush / stopVoiceFlush', () => {
  it('starts the flush interval without throwing', () => {
    expect(() => startVoiceFlush()).not.toThrow();
    stopVoiceFlush();
  });

  it('is idempotent — calling start twice is safe', () => {
    startVoiceFlush();
    expect(() => startVoiceFlush()).not.toThrow();
    stopVoiceFlush();
  });

  it('stopping without starting is safe', () => {
    expect(() => stopVoiceFlush()).not.toThrow();
  });
});
