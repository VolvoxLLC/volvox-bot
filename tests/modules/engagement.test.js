import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { trackMessage, trackReaction } from '../../src/modules/engagement.js';

function makeMessage({ guildId = 'guild1', userId = 'user1' } = {}) {
  return {
    author: { id: userId },
    guild: { id: guildId },
  };
}

function makeReaction({ guildId = 'guild1', authorId = 'author1' } = {}) {
  return {
    message: {
      guild: { id: guildId },
      author: { id: authorId },
    },
  };
}

function makeUser(id = 'reactor1') {
  return { id };
}

function makePool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfig.mockReturnValue({
    engagement: { enabled: true, trackMessages: true, trackReactions: true },
  });
});

describe('trackMessage', () => {
  it('upserts message stat when enabled', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage());
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_stats'),
      expect.arrayContaining(['guild1', 'user1']),
    );
  });

  it('does nothing when engagement is disabled', async () => {
    getConfig.mockReturnValue({ engagement: { enabled: false } });
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage());
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when trackMessages is false', async () => {
    getConfig.mockReturnValue({
      engagement: { enabled: true, trackMessages: false, trackReactions: true },
    });
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage(makeMessage());
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when message has no guild', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackMessage({ author: { id: 'user1' }, guild: null });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('logs error and does not throw on db failure', async () => {
    getPool.mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error('connection refused')),
    });
    await expect(trackMessage(makeMessage())).resolves.not.toThrow();
    expect(logError).toHaveBeenCalled();
  });
});

describe('trackReaction', () => {
  it('increments reactions_given for reactor and reactions_received for author', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackReaction(makeReaction({ authorId: 'author1' }), makeUser('reactor1'));
    expect(pool.query).toHaveBeenCalledTimes(2);
    // First call: reactions_given for reactor
    expect(pool.query.mock.calls[0][1]).toContain('reactor1');
    // Second call: reactions_received for author
    expect(pool.query.mock.calls[1][1]).toContain('author1');
  });

  it('skips reactions_received when reactor is the message author', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackReaction(makeReaction({ authorId: 'same-user' }), makeUser('same-user'));
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('does nothing when engagement is disabled', async () => {
    getConfig.mockReturnValue({ engagement: { enabled: false } });
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackReaction(makeReaction(), makeUser());
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when trackReactions is false', async () => {
    getConfig.mockReturnValue({
      engagement: { enabled: true, trackMessages: true, trackReactions: false },
    });
    const pool = makePool();
    getPool.mockReturnValue(pool);
    await trackReaction(makeReaction(), makeUser());
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('does nothing when reaction has no guild', async () => {
    const pool = makePool();
    getPool.mockReturnValue(pool);
    const reaction = { message: { guild: null, author: { id: 'a1' } } };
    await trackReaction(reaction, makeUser());
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('logs error and does not throw on db failure', async () => {
    getPool.mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    await expect(trackReaction(makeReaction(), makeUser())).resolves.not.toThrow();
    expect(logError).toHaveBeenCalled();
  });
});
