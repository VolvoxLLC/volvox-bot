import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
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
    permissions: { enabled: true, adminRoleId: null, usePermissions: true },
  }),
}));

vi.mock('../../src/utils/permissions.js', () => ({
  isModerator: vi.fn().mockReturnValue(true),
  getPermissionError: vi.fn().mockReturnValue("❌ You don't have permission to use `/announce`."),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn(),
  safeReply: (t, opts) => t.reply(opts),
  safeEditReply: (t, opts) => t.editReply(opts),
}));

vi.mock('discord.js', () => {
  /**
   * Create a chainable proxy that returns itself for any method call.
   * Supports nested builder patterns like setName().setDescription().addChannelTypes().setRequired().
   */
  function chainable() {
    const proxy = new Proxy(() => proxy, {
      get: () => () => proxy,
      apply: () => proxy,
    });
    return proxy;
  }

  class MockSlashCommandBuilder {
    constructor() {
      this.name = '';
      this.description = '';
    }
    setName(name) {
      this.name = name;
      return this;
    }
    setDescription(desc) {
      this.description = desc;
      return this;
    }
    addSubcommand(fn) {
      const sub = {
        setName: () => ({
          setDescription: () => ({
            addStringOption: function self(fn2) {
              fn2(chainable());
              return { addChannelOption: self, addStringOption: self, addIntegerOption: self };
            },
            addChannelOption: function self(fn2) {
              fn2(chainable());
              return { addStringOption: self, addChannelOption: self, addIntegerOption: self };
            },
            addIntegerOption: function self(fn2) {
              fn2(chainable());
              return { addStringOption: self, addChannelOption: self, addIntegerOption: self };
            },
          }),
        }),
      };
      fn(sub);
      return this;
    }
    toJSON() {
      return { name: this.name, description: this.description };
    }
  }
  return {
    SlashCommandBuilder: MockSlashCommandBuilder,
    ChannelType: { GuildText: 0 },
  };
});

import { data, execute, parseTime } from '../../src/commands/announce.js';
import { getPool } from '../../src/db.js';
import { isModerator } from '../../src/utils/permissions.js';

/**
 * Create a mock interaction for announce tests.
 */
function createMockInteraction(subcommand, options = {}) {
  const optionValues = {
    time: null,
    cron: null,
    channel: null,
    message: null,
    id: null,
    ...options,
  };

  return {
    guildId: 'guild-123',
    user: { id: 'user-456' },
    member: { id: 'user-456' },
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getString: vi.fn((name) => optionValues[name] ?? null),
      getChannel: vi.fn(() => optionValues.channel),
      getInteger: vi.fn((name) => optionValues[name] ?? null),
    },
    reply: vi.fn(),
    editReply: vi.fn(),
  };
}

describe('announce command', () => {
  let mockPool;

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(mockPool);
    isModerator.mockReturnValue(true);
  });

  it('should export data with name', () => {
    expect(data.name).toBe('announce');
  });

  it('should export adminOnly flag', async () => {
    const mod = await import('../../src/commands/announce.js');
    expect(mod.adminOnly).toBe(true);
  });

  it('should deny non-moderators', async () => {
    isModerator.mockReturnValueOnce(false);
    const interaction = createMockInteraction('list');

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("don't have permission"),
        ephemeral: true,
      }),
    );
  });

  describe('once subcommand', () => {
    it('should parse time and insert scheduled message', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const interaction = createMockInteraction('once', {
        time: 'in 2h',
        channel: { id: 'ch-789' },
        message: 'Hello world!',
      });

      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scheduled_messages'),
        expect.arrayContaining(['guild-123', 'ch-789', 'Hello world!']),
      );
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Scheduled message **#1**'),
          ephemeral: true,
        }),
      );
    });

    it('should reject unparseable time', async () => {
      const interaction = createMockInteraction('once', {
        time: 'whenever',
        channel: { id: 'ch-789' },
        message: 'Hello!',
      });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Could not parse time'),
          ephemeral: true,
        }),
      );
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('recurring subcommand', () => {
    it('should validate and insert recurring message', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });

      const interaction = createMockInteraction('recurring', {
        cron: '0 9 * * *',
        channel: { id: 'ch-789' },
        message: 'Daily update!',
      });

      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scheduled_messages'),
        expect.arrayContaining(['guild-123', 'ch-789', 'Daily update!', '0 9 * * *']),
      );
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Recurring message **#2**'),
          ephemeral: true,
        }),
      );
    });

    it('should reject invalid cron expression', async () => {
      const interaction = createMockInteraction('recurring', {
        cron: 'not a cron',
        channel: { id: 'ch-789' },
        message: 'Hello!',
      });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Invalid cron expression'),
          ephemeral: true,
        }),
      );
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('list subcommand', () => {
    it('should show scheduled messages', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            channel_id: 'ch-789',
            content: 'Hello',
            cron_expression: null,
            next_run: new Date('2026-03-01T09:00:00Z'),
            one_time: true,
            author_id: 'user-456',
            enabled: true,
          },
        ],
      });

      const interaction = createMockInteraction('list');

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Scheduled Messages (1)'),
          ephemeral: true,
        }),
      );
    });

    it('should show empty message when no scheduled messages', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const interaction = createMockInteraction('list');

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No scheduled messages'),
          ephemeral: true,
        }),
      );
    });
  });

  describe('cancel subcommand', () => {
    it('should cancel a scheduled message', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 5, author_id: 'user-456', guild_id: 'guild-123' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const interaction = createMockInteraction('cancel', { id: 5 });

      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scheduled_messages SET enabled = false'),
        [5],
      );
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('has been cancelled'),
          ephemeral: true,
        }),
      );
    });

    it('should reject cancel for non-existent message', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const interaction = createMockInteraction('cancel', { id: 999 });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No active scheduled message'),
          ephemeral: true,
        }),
      );
    });
  });
});

describe('parseTime', () => {
  it('should parse "in Xh"', () => {
    const before = Date.now();
    const result = parseTime('in 2h');
    const after = Date.now();

    expect(result).toBeInstanceOf(Date);
    // Should be ~2 hours from now
    const diff = result.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000 - 1000);
    expect(diff).toBeLessThanOrEqual(2 * 60 * 60 * 1000 + (after - before) + 1000);
  });

  it('should parse "in Xm"', () => {
    const before = Date.now();
    const result = parseTime('in 30m');

    expect(result).toBeInstanceOf(Date);
    const diff = result.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(29 * 60 * 1000);
    expect(diff).toBeLessThanOrEqual(31 * 60 * 1000);
  });

  it('should parse "in XhYm"', () => {
    const before = Date.now();
    const result = parseTime('in 1h30m');

    expect(result).toBeInstanceOf(Date);
    const diff = result.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(89 * 60 * 1000);
    expect(diff).toBeLessThanOrEqual(91 * 60 * 1000);
  });

  it('should parse "tomorrow HH:MM"', () => {
    const result = parseTime('tomorrow 09:00');

    expect(result).toBeInstanceOf(Date);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(result.getDate()).toBe(tomorrow.getDate());
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it('should parse "YYYY-MM-DD HH:MM"', () => {
    const result = parseTime('2026-06-15 14:30');

    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(5); // 0-indexed
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
  });

  it('should return null for unrecognized format', () => {
    expect(parseTime('whenever')).toBeNull();
    expect(parseTime('next tuesday')).toBeNull();
    expect(parseTime('')).toBeNull();
  });
});
