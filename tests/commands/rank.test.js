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
  getConfig: vi.fn().mockReturnValue({ reputation: {} }),
}));

vi.mock('../../src/modules/reputation.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    computeLevel: actual.computeLevel,
    buildProgressBar: actual.buildProgressBar,
  };
});

vi.mock('../../src/utils/safeSend.js', () => ({
  safeEditReply: vi.fn(),
}));

vi.mock('discord.js', () => {
  function chainable() {
    const proxy = new Proxy(() => proxy, {
      get: () => () => proxy,
      apply: () => proxy,
    });
    return proxy;
  }

  class MockSlashCommandBuilder {
    setName() {
      return this;
    }
    setDescription() {
      return this;
    }
    addUserOption(fn) {
      fn(chainable());
      return this;
    }
  }

  class MockEmbedBuilder {
    setColor() {
      return this;
    }
    setAuthor() {
      return this;
    }
    setTitle() {
      return this;
    }
    addFields() {
      return this;
    }
    setThumbnail() {
      return this;
    }
    setTimestamp() {
      return this;
    }
  }

  return { SlashCommandBuilder: MockSlashCommandBuilder, EmbedBuilder: MockEmbedBuilder };
});

import { execute } from '../../src/commands/rank.js';
import { getPool } from '../../src/db.js';
import { safeEditReply } from '../../src/utils/safeSend.js';

function makeInteraction({ userId = 'user1', targetUser = null, guildId = 'guild1' } = {}) {
  const user = {
    id: userId,
    username: 'TestUser',
    displayName: 'TestUser',
    displayAvatarURL: vi.fn().mockReturnValue('http://avatar'),
  };
  const target = targetUser ?? user;
  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    guildId,
    user,
    guild: {
      members: { fetch: vi.fn().mockResolvedValue({ displayName: 'TestUser' }) },
    },
    options: {
      getUser: vi.fn().mockReturnValue(target),
    },
  };
}

describe('/rank command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows no-data state when user has no XP', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // reputation row
        .mockResolvedValueOnce({ rows: [{ rank: 1 }] }), // rank position
    };
    getPool.mockReturnValue(pool);

    const interaction = makeInteraction();
    await execute(interaction);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('shows level and XP when user has reputation data', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ xp: 350, level: 2, messages_count: 42 }] })
        .mockResolvedValueOnce({ rows: [{ rank: 3 }] }),
    };
    getPool.mockReturnValue(pool);

    const interaction = makeInteraction();
    await execute(interaction);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('shows error when DB unavailable', async () => {
    getPool.mockReturnValue(null);

    const interaction = makeInteraction();
    await execute(interaction);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ content: expect.stringContaining('❌') }),
    );
  });

  it('looks up specified user', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ xp: 500, level: 2, messages_count: 10 }] })
        .mockResolvedValueOnce({ rows: [{ rank: 1 }] }),
    };
    getPool.mockReturnValue(pool);

    const targetUser = {
      id: 'user2',
      username: 'OtherUser',
      displayName: 'OtherUser',
      displayAvatarURL: vi.fn().mockReturnValue('http://avatar2'),
    };
    const interaction = makeInteraction({ targetUser });
    await execute(interaction);

    // Should query with target user's ID
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['user2']));
  });
});
