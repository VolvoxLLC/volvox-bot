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
  getConfig: vi.fn().mockReturnValue({
    engagement: { enabled: true, trackMessages: true, trackReactions: true },
  }),
}));

import { getPool } from '../../src/db.js';
import { error as logError } from '../../src/logger.js';
import { getConfig } from '../../src/modules/config.js';
import {
  flushEngagementBuffer,
  startEngagementFlushInterval,
  stopEngagementFlushInterval,
  trackMessage,
  trackReaction,
} from '../../src/modules/engagement.js';

function makeMessage({ guildId = 'guild1', userId = 'user1' } = {}) {
  return { author: { id: userId }, guild: { id: guildId } };
}

function makeReaction({ guildId = 'guild1', authorId = 'author1' } = {}) {
  return { message: { guild: { id: guildId }, author: { id: authorId } } };
}

function makeUser(id = 'reactor1') {
  return { id };
}

function makePool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

beforeEach(async () => {
  vi.clearAllMocks();
  getConfig.mockReturnValue({
    engagement: { enabled: true, trackMessages: true, trackReactions: true },
  });
  // Drain any residual buffer entries left from a previous test.
  getPool.mockReturnValue(makePool());
  await flushEngagementBuffer();
  vi.clearAllMocks();
  // Re-apply default config mock after the second clearAllMocks.
  getConfig.mockReturnValue({
    engagement: { enabled: true, trackMessages: true, trackReactions: true },
  });
});

afterEach(async () => {
  // Stop any running flush interval and drain the buffer.
  getPool.mockReturnValue(makePool());
  await stopEngagementFlushInterval();
});

// ─────────────────────────── trackMessage ────────────────────────────

describe('trackMessage', () => {
  it('buffers a message without immediately hitting the DB', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage());
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when engagement is disabled', async () => {
    getConfig.mockReturnValue({ engagement: { enabled: false } });
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage());
    await flushEngagementBuffer();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when trackMessages is false', async () => {
    getConfig.mockReturnValue({
      engagement: { enabled: true, trackMessages: false, trackReactions: true },
    });
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage());
    await flushEngagementBuffer();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when message has no guild', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage({ author: { id: 'user1' }, guild: null });
    await flushEngagementBuffer();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when message author is a bot', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage({ author: { id: 'bot1', bot: true }, guild: { id: 'guild1' } });
    await flushEngagementBuffer();
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────── trackReaction ───────────────────────────

describe('trackReaction', () => {
  it('buffers a reaction without immediately hitting the DB', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackReaction(makeReaction({ authorId: 'author1' }), makeUser('reactor1'));
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when engagement is disabled', async () => {
    getConfig.mockReturnValue({ engagement: { enabled: false } });
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackReaction(makeReaction(), makeUser());
    await flushEngagementBuffer();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when trackReactions is false', async () => {
    getConfig.mockReturnValue({
      engagement: { enabled: true, trackMessages: true, trackReactions: false },
    });
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackReaction(makeReaction(), makeUser());
    await flushEngagementBuffer();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when reaction has no guild', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    const reaction = { message: { guild: null, author: { id: 'a1' } } };
    await trackReaction(reaction, makeUser());
    await flushEngagementBuffer();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when reactor user is a bot', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackReaction(makeReaction(), { id: 'bot1', bot: true });
    await flushEngagementBuffer();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('skips reactions_received when message author is a bot', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    const reaction = {
      message: { guild: { id: 'guild1' }, author: { id: 'botAuthor', bot: true } },
    };
    await trackReaction(reaction, makeUser('reactor1'));
    await flushEngagementBuffer();
    // Only the reactor entry — bot author is not added
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toContain('reactor1');
    expect(params).not.toContain('botAuthor');
  });
});

// ─────────────────────────── flushEngagementBuffer ───────────────────

describe('flushEngagementBuffer', () => {
  it('is a no-op when the buffer is empty', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await flushEngagementBuffer();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('issues a single batch upsert for a tracked message', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage({ guildId: 'g1', userId: 'u1' }));
    await flushEngagementBuffer();
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO user_stats');
    expect(sql).toContain('ON CONFLICT');
    expect(params).toContain('g1');
    expect(params).toContain('u1');
  });

  it('batches multiple users into one query', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage({ guildId: 'g1', userId: 'u1' }));
    await trackMessage(makeMessage({ guildId: 'g1', userId: 'u2' }));
    await flushEngagementBuffer();
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toContain('u1');
    expect(params).toContain('u2');
  });

  it('accumulates multiple messages for the same user into one entry', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage({ guildId: 'g1', userId: 'u1' }));
    await trackMessage(makeMessage({ guildId: 'g1', userId: 'u1' }));
    await flushEngagementBuffer();
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = pool.query.mock.calls[0];
    // Params layout per entry: [guildId, userId, messages, reactionsGiven, reactionsReceived, bumpDays]
    // messages (index userId+1) should be 2
    const userIdx = params.indexOf('u1');
    expect(params[userIdx + 1]).toBe(2);
  });

  it('sets bumpDays=1 for active users (sent messages)', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage({ guildId: 'g1', userId: 'u1' }));
    await flushEngagementBuffer();
    const [, params] = pool.query.mock.calls[0];
    // Params layout: [guildId, userId, messages, reactionsGiven, reactionsReceived, bumpDays]
    const userIdx = params.indexOf('u1');
    const bumpDaysFlag = params[userIdx + 4]; // +4 offsets from userId to bumpDays
    expect(bumpDaysFlag).toBe(1);
  });

  it('sets bumpDays=0 for passive-only users (received reactions only)', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    // 'passive-author' only receives a reaction — never sends anything
    await trackReaction(
      makeReaction({ guildId: 'g1', authorId: 'passive-author' }),
      makeUser('active-reactor'),
    );
    await flushEngagementBuffer();
    const [sql, params] = pool.query.mock.calls[0];
    // SQL should use the EXCLUDED.days_active = 1 conditional
    expect(sql).toContain('EXCLUDED.days_active = 1');
    // passive-author's bumpDays flag should be 0
    const authorIdx = params.indexOf('passive-author');
    const bumpDaysFlag = params[authorIdx + 4];
    expect(bumpDaysFlag).toBe(0);
  });

  it('batches reactor and author entries from a reaction into one query', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackReaction(makeReaction({ guildId: 'g1', authorId: 'author1' }), makeUser('reactor1'));
    await flushEngagementBuffer();
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO user_stats');
    expect(params).toContain('reactor1');
    expect(params).toContain('author1');
  });

  it('emits only one entry when reactor is the message author', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackReaction(makeReaction({ authorId: 'same-user' }), makeUser('same-user'));
    await flushEngagementBuffer();
    const [, params] = pool.query.mock.calls[0];
    const occurrences = params.filter((p) => p === 'same-user');
    expect(occurrences).toHaveLength(1);
  });

  it('clears the buffer after a successful flush (second flush is a no-op)', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage());
    await flushEngagementBuffer();
    pool.query.mockClear();
    await flushEngagementBuffer();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('logs the error and re-merges entries back into the buffer on DB failure', async () => {
    const failPool = { query: vi.fn().mockRejectedValue(new Error('db error')) };
    getPool.mockReturnValue(failPool);
    await trackMessage(makeMessage({ guildId: 'g1', userId: 'u1' }));
    await flushEngagementBuffer();
    expect(logError).toHaveBeenCalledWith(
      'Failed to flush engagement buffer',
      expect.objectContaining({ error: 'db error' }),
    );
    // Entries should be re-merged — the next flush should attempt the query again
    const pool2 = makePool();
    getPool.mockReturnValue(pool2);
    await flushEngagementBuffer();
    expect(pool2.query).toHaveBeenCalledTimes(1);
  });

  it('merges new events that arrived during a failed flush', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage({ guildId: 'g1', userId: 'u1' }));
    // Fail the first flush — re-merge happens inside flushEngagementBuffer
    pool.query.mockRejectedValueOnce(new Error('transient error'));
    await flushEngagementBuffer();
    // Accumulate another message while pool is failing
    await trackMessage(makeMessage({ guildId: 'g1', userId: 'u1' }));
    // Now let the second flush succeed
    pool.query.mockResolvedValueOnce({ rows: [] });
    await flushEngagementBuffer();
    // The messages count should be 2 (1 re-merged + 1 new)
    const [, params] = pool.query.mock.calls[1];
    const userIdx = params.indexOf('u1');
    expect(params[userIdx + 1]).toBe(2);
  });
});

// ─────────────────── startEngagementFlushInterval / stop ─────────────

describe('startEngagementFlushInterval / stopEngagementFlushInterval', () => {
  it('startEngagementFlushInterval is idempotent (calling twice does not throw)', () => {
    startEngagementFlushInterval(60_000);
    startEngagementFlushInterval(60_000);
    // cleanup handled by afterEach
  });

  it('stopEngagementFlushInterval flushes remaining buffer entries', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    startEngagementFlushInterval(60_000); // long period — won't auto-fire
    await trackMessage(makeMessage());
    await stopEngagementFlushInterval();
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain('INSERT INTO user_stats');
  });

  it('stopEngagementFlushInterval is a no-op when no interval is running', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await stopEngagementFlushInterval(); // no interval started, buffer empty
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('fires a flush automatically after the interval period elapses', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    vi.useFakeTimers();
    try {
      startEngagementFlushInterval(1000);
      await trackMessage(makeMessage());
      await vi.advanceTimersByTimeAsync(1100);
      expect(pool.query).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
