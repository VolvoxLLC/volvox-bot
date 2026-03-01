/**
 * Tests for src/commands/remind.js
 */
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
  getConfig: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue(undefined),
  safeReply: vi.fn().mockResolvedValue(undefined),
  safeEditReply: vi.fn().mockResolvedValue(undefined),
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
      fn(chainable());
      return this;
    }
  }

  class MockEmbedBuilder {
    setTitle() {
      return this;
    }
    setDescription() {
      return this;
    }
    setColor() {
      return this;
    }
    setFooter() {
      return this;
    }
  }

  return {
    SlashCommandBuilder: MockSlashCommandBuilder,
    EmbedBuilder: MockEmbedBuilder,
  };
});

import { getPool } from '../../src/db.js';
import { getConfig } from '../../src/modules/config.js';
import { safeEditReply } from '../../src/utils/safeSend.js';

describe('remind command', () => {
  let mockPool;
  let mockClient;
  let data;
  let execute;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(mockClient),
    };

    getPool.mockReturnValue(mockPool);
    getConfig.mockReturnValue({ reminders: { enabled: true, maxPerUser: 25 } });

    const mod = await import('../../src/commands/remind.js');
    data = mod.data;
    execute = mod.execute;
  });

  it('should export data and execute', () => {
    expect(data).toBeDefined();
    expect(data.name).toBe('remind');
    expect(execute).toBeTypeOf('function');
  });

  it('should reject when reminders disabled', async () => {
    getConfig.mockReturnValue({ reminders: { enabled: false } });
    const interaction = {
      guildId: 'g1',
      reply: vi.fn().mockResolvedValue(undefined),
      options: { getSubcommand: () => 'me' },
    };

    await execute(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('not enabled') }),
    );
  });

  describe('/remind me', () => {
    it('should create a reminder', async () => {
      const futureDate = new Date(Date.now() + 3_600_000);
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT
        .mockResolvedValueOnce({
          rows: [{ id: 1, remind_at: futureDate.toISOString(), message: 'test' }],
        }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const interaction = {
        guildId: 'g1',
        channelId: 'c1',
        user: { id: 'u1' },
        deferReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: () => 'me',
          getString: (name) => (name === 'when' ? 'in 1 hour' : 'test reminder'),
          getInteger: () => null,
        },
      };

      await execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Reminder **#1**') }),
      );
    });

    it('should reject invalid time', async () => {
      const interaction = {
        guildId: 'g1',
        channelId: 'c1',
        user: { id: 'u1' },
        deferReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: () => 'me',
          getString: (name) => (name === 'when' ? 'gibberish' : 'test'),
          getInteger: () => null,
        },
      };

      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Could not understand') }),
      );
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('should enforce max per user limit', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // COUNT
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const interaction = {
        guildId: 'g1',
        channelId: 'c1',
        user: { id: 'u1' },
        deferReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: () => 'me',
          getString: (name) => (name === 'when' ? 'in 1 hour' : 'test'),
          getInteger: () => null,
        },
      };

      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('maximum') }),
      );
    });

    it('should handle database errors while creating reminder', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('db unavailable')) // lock
        .mockResolvedValueOnce({ rows: [] }); // rollback from catch

      const interaction = {
        guildId: 'g1',
        channelId: 'c1',
        user: { id: 'u1' },
        deferReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: () => 'me',
          getString: (name) => (name === 'when' ? 'in 1 hour' : 'test'),
          getInteger: () => null,
        },
      };

      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('creating your reminder') }),
      );
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('/remind list', () => {
    it('should show empty message when no reminders', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const interaction = {
        guildId: 'g1',
        user: { id: 'u1' },
        deferReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: () => 'list',
          getString: () => null,
          getInteger: () => null,
        },
      };

      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('no active reminders') }),
      );
    });

    it('should list active reminders', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            message: 'Check build',
            remind_at: new Date(Date.now() + 60_000).toISOString(),
            recurring_cron: null,
            snoozed_count: 0,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const interaction = {
        guildId: 'g1',
        user: { id: 'u1' },
        deferReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: () => 'list',
          getString: () => null,
          getInteger: () => null,
        },
      };

      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should handle database errors while listing reminders', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('db unavailable'));

      const interaction = {
        guildId: 'g1',
        user: { id: 'u1' },
        deferReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: () => 'list',
          getString: () => null,
          getInteger: () => null,
        },
      };

      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('fetching your reminders') }),
      );
    });
  });

  describe('/remind cancel', () => {
    it('should cancel an owned reminder', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 5, user_id: 'u1', message: 'test' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const interaction = {
        guildId: 'g1',
        user: { id: 'u1' },
        deferReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: () => 'cancel',
          getString: () => null,
          getInteger: () => 5,
        },
      };

      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('#5') }),
      );
    });

    it("should reject cancelling another user's reminder", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 5, user_id: 'other-user' }],
      });

      const interaction = {
        guildId: 'g1',
        user: { id: 'u1' },
        deferReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: () => 'cancel',
          getString: () => null,
          getInteger: () => 5,
        },
      };

      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('only cancel your own') }),
      );
    });

    it('should handle non-existent reminder', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const interaction = {
        guildId: 'g1',
        user: { id: 'u1' },
        deferReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: () => 'cancel',
          getString: () => null,
          getInteger: () => 999,
        },
      };

      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('#999') }),
      );
    });

    it('should handle database errors while cancelling reminder', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('db unavailable'));

      const interaction = {
        guildId: 'g1',
        user: { id: 'u1' },
        deferReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: () => 'cancel',
          getString: () => null,
          getInteger: () => 5,
        },
      };

      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('cancelling your reminder') }),
      );
    });
  });
});
