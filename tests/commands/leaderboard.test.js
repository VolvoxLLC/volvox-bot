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
  getConfig: vi.fn().mockReturnValue({ reputation: { enabled: true } }),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeEditReply: vi.fn(),
}));

vi.mock('discord.js', () => {
  class MockSlashCommandBuilder {
    setName() {
      return this;
    }
    setDescription() {
      return this;
    }
  }

  class MockEmbedBuilder {
    setColor() {
      return this;
    }
    setTitle() {
      return this;
    }
    setDescription() {
      return this;
    }
    setFooter() {
      return this;
    }
    setTimestamp() {
      return this;
    }
  }

  return { SlashCommandBuilder: MockSlashCommandBuilder, EmbedBuilder: MockEmbedBuilder };
});

import { execute } from '../../src/commands/leaderboard.js';
import { getPool } from '../../src/db.js';
import { safeEditReply } from '../../src/utils/safeSend.js';

function makeInteraction({ guildId = 'guild1' } = {}) {
  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    guildId,
    guild: {
      members: {
        fetch: vi.fn().mockImplementation((opts) => {
          if (opts?.user) {
            // Batch fetch — return a Map (mirrors guild.members.fetch({ user: [...] }))
            const map = new Map();
            for (const id of opts.user) {
              map.set(id, { displayName: `User_${id}` });
            }
            return Promise.resolve(map);
          }
          // Single fetch fallback
          return Promise.resolve({ displayName: `User_${opts}` });
        }),
      },
    },
  };
}

describe('/leaderboard command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no users have XP', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    getPool.mockReturnValue(pool);

    const interaction = makeInteraction();
    await execute(interaction);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ content: expect.stringContaining('📭') }),
    );
  });

  it('shows top 10 ordered by XP', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      user_id: `user${i + 1}`,
      xp: (10 - i) * 100,
      level: 10 - i,
    }));
    const pool = { query: vi.fn().mockResolvedValue({ rows }) };
    getPool.mockReturnValue(pool);

    const interaction = makeInteraction();
    await execute(interaction);

    // Should query with LIMIT 10 and ORDER BY xp DESC
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY xp DESC'),
      expect.any(Array),
    );
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 10'), expect.any(Array));

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('shows error when DB unavailable', async () => {
    getPool.mockImplementation(() => {
      throw new Error('Database not available');
    });

    const interaction = makeInteraction();
    await execute(interaction);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ content: expect.stringContaining('❌') }),
    );
  });

  it('replies with disabled message when reputation is not enabled', async () => {
    const { getConfig } = await import('../../src/modules/config.js');
    getConfig.mockReturnValueOnce({ reputation: { enabled: false } });

    const interaction = makeInteraction();
    await execute(interaction);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ content: 'Reputation system is not enabled.' }),
    );
  });

  it('handles member fetch failure gracefully', async () => {
    const rows = [{ user_id: 'leftUser', xp: 500, level: 3 }];
    const pool = { query: vi.fn().mockResolvedValue({ rows }) };
    getPool.mockReturnValue(pool);

    const interaction = makeInteraction();
    // Simulate user having left the server
    interaction.guild.members.fetch.mockRejectedValue(new Error('Unknown Member'));

    await execute(interaction);

    // Should still reply with embed (falls back to mention)
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });
});
