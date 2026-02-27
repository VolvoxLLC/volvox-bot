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
  getConfig: vi.fn().mockReturnValue({ engagement: { enabled: true } }),
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
    addUserOption(fn) {
      fn({
        setName: () => ({ setDescription: () => ({ setRequired: () => ({}) }) }),
      });
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

import { execute, getActivityBadge } from '../../src/commands/profile.js';
import { getPool } from '../../src/db.js';
import { getConfig } from '../../src/modules/config.js';
import { safeEditReply } from '../../src/utils/safeSend.js';

function makeUser(id = 'user1') {
  return {
    id,
    username: `User_${id}`,
    displayName: `DisplayUser_${id}`,
    displayAvatarURL: vi.fn().mockReturnValue(`http://avatar/${id}`),
  };
}

function makeInteraction({ userId = 'user1', targetUser = null, guildId = 'guild1' } = {}) {
  const user = makeUser(userId);
  const target = targetUser ?? null;
  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    guildId,
    user,
    options: {
      getUser: vi.fn().mockReturnValue(target),
    },
  };
}

function makePool(rows = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfig.mockReturnValue({ engagement: { enabled: true } });
});

describe('getActivityBadge', () => {
  it('returns Newcomer for <7 days', () => {
    expect(getActivityBadge(0)).toBe('🌱 Newcomer');
    expect(getActivityBadge(6)).toBe('🌱 Newcomer');
  });

  it('returns Regular for 7-29 days', () => {
    expect(getActivityBadge(7)).toBe('🌿 Regular');
    expect(getActivityBadge(29)).toBe('🌿 Regular');
  });

  it('returns Veteran for 30-89 days', () => {
    expect(getActivityBadge(30)).toBe('🌳 Veteran');
    expect(getActivityBadge(89)).toBe('🌳 Veteran');
  });

  it('returns Legend for 90+ days', () => {
    expect(getActivityBadge(90)).toBe('👑 Legend');
    expect(getActivityBadge(200)).toBe('👑 Legend');
  });
});

describe('/profile execute', () => {
  it('returns error when engagement is disabled', async () => {
    getConfig.mockReturnValue({ engagement: { enabled: false } });
    const interaction = makeInteraction();
    await execute(interaction);
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ content: expect.stringContaining('not enabled') }),
    );
  });

  it('returns error when not in a guild', async () => {
    const interaction = makeInteraction({ guildId: null });
    await execute(interaction);
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ content: expect.stringContaining('only be used in a server') }),
    );
  });

  it('shows zeroed stats when user has no record', async () => {
    const pool = makePool([]);
    getPool.mockReturnValue(pool);
    const interaction = makeInteraction();
    await execute(interaction);
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('shows stats for a user with a record', async () => {
    const pool = makePool([
      {
        messages_sent: 100,
        reactions_given: 20,
        reactions_received: 15,
        days_active: 10,
        first_seen: new Date('2024-01-01'),
        last_active: new Date('2024-06-01'),
      },
    ]);
    getPool.mockReturnValue(pool);
    const interaction = makeInteraction();
    await execute(interaction);
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('shows another user profile when user option is provided', async () => {
    const pool = makePool([
      {
        messages_sent: 50,
        reactions_given: 5,
        reactions_received: 3,
        days_active: 95,
        first_seen: new Date('2023-01-01'),
        last_active: new Date('2024-05-01'),
      },
    ]);
    getPool.mockReturnValue(pool);
    const targetUser = makeUser('other-user');
    const interaction = makeInteraction({ targetUser });
    interaction.options.getUser.mockReturnValue(targetUser);
    await execute(interaction);
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['guild1', 'other-user']);
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('returns error when db throws', async () => {
    getPool.mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error('DB down')),
    });
    const interaction = makeInteraction();
    await execute(interaction);
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ content: expect.stringContaining('Something went wrong') }),
    );
  });

  it('uses self when no user option given', async () => {
    const pool = makePool([]);
    getPool.mockReturnValue(pool);
    const interaction = makeInteraction();
    interaction.options.getUser.mockReturnValue(null);
    await execute(interaction);
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['guild1', 'user1']);
  });
});
