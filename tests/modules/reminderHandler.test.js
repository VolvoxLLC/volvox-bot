/**
 * Tests for src/modules/reminderHandler.js
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock discordCache to pass through to the underlying client.channels.fetch
vi.mock('../../src/utils/discordCache.js', () => ({
  fetchChannelCached: vi.fn().mockImplementation(async (client, channelId) => {
    if (!channelId) return null;
    const cached = client.channels?.cache?.get?.(channelId);
    if (cached) return cached;
    if (client.channels?.fetch) {
      return client.channels.fetch(channelId).catch(() => null);
    }
    return null;
  }),
  fetchGuildChannelsCached: vi.fn().mockResolvedValue([]),
  fetchGuildRolesCached: vi.fn().mockResolvedValue([]),
  fetchMemberCached: vi.fn().mockResolvedValue(null),
  invalidateGuildCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/utils/cronParser.js', () => ({
  getNextCronRun: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({ reminders: { enabled: true } }),
}));
vi.mock('discord.js', () => {
  class EmbedBuilder {
    setTitle() {
      return this;
    }
    setDescription() {
      return this;
    }
    setColor() {
      return this;
    }
    setTimestamp() {
      return this;
    }
    setFooter() {
      return this;
    }
    addFields() {
      return this;
    }
  }
  class ButtonBuilder {
    setCustomId() {
      return this;
    }
    setLabel() {
      return this;
    }
    setStyle() {
      return this;
    }
  }
  class ActionRowBuilder {
    addComponents() {
      return this;
    }
  }
  return {
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle: { Secondary: 2, Danger: 4 },
  };
});

import { getPool } from '../../src/db.js';
import {
  buildSnoozeButtons,
  checkReminders,
  handleReminderDismiss,
  handleReminderSnooze,
} from '../../src/modules/reminderHandler.js';
import { getNextCronRun } from '../../src/utils/cronParser.js';
import { safeSend } from '../../src/utils/safeSend.js';

describe('reminderHandler', () => {
  let mockPool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(mockPool);
  });

  describe('buildSnoozeButtons', () => {
    it('should return an ActionRowBuilder', () => {
      const row = buildSnoozeButtons(42);
      expect(row).toBeDefined();
    });
  });

  describe('checkReminders', () => {
    it('should do nothing when no reminders are due', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const mockClient = { users: { fetch: vi.fn() } };

      await checkReminders(mockClient);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('completed = false'));
    });

    it('should send DM for due reminder and mark completed', async () => {
      const mockUser = { send: vi.fn().mockResolvedValue({}) };
      const mockClient = {
        users: { fetch: vi.fn().mockResolvedValue(mockUser) },
        channels: { fetch: vi.fn() },
      };

      const reminder = {
        id: 1,
        guild_id: 'g1',
        user_id: 'u1',
        channel_id: 'c1',
        message: 'Test reminder',
        remind_at: new Date().toISOString(),
        recurring_cron: null,
        snoozed_count: 0,
        created_at: new Date().toISOString(),
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [reminder] }) // SELECT due
        .mockResolvedValueOnce({ rows: [] }); // UPDATE completed

      await checkReminders(mockClient);

      expect(mockClient.users.fetch).toHaveBeenCalledWith('u1');
      expect(mockUser.send).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array), components: expect.any(Array) }),
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE reminders SET completed = true'),
        [1],
      );
    });

    it('should fall back to channel mention if DM fails', async () => {
      const mockChannel = { id: 'c1', send: vi.fn().mockResolvedValue({}) };
      const mockClient = {
        users: { fetch: vi.fn().mockRejectedValue(new Error('Cannot DM')) },
        channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
      };

      const reminder = {
        id: 2,
        guild_id: 'g1',
        user_id: 'u2',
        channel_id: 'c1',
        message: 'Fallback test',
        remind_at: new Date().toISOString(),
        recurring_cron: null,
        snoozed_count: 0,
        created_at: new Date().toISOString(),
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [reminder] })
        .mockResolvedValueOnce({ rows: [] });

      await checkReminders(mockClient);

      expect(safeSend).toHaveBeenCalledWith(
        mockChannel,
        expect.objectContaining({ content: '<@u2>' }),
      );
    });

    it('should reschedule recurring reminders', async () => {
      const nextRun = new Date(Date.now() + 86_400_000);
      getNextCronRun.mockReturnValue(nextRun);

      const mockUser = { send: vi.fn().mockResolvedValue({}) };
      const mockClient = {
        users: { fetch: vi.fn().mockResolvedValue(mockUser) },
      };

      const reminder = {
        id: 3,
        guild_id: 'g1',
        user_id: 'u3',
        channel_id: 'c1',
        message: 'Recurring test',
        remind_at: new Date().toISOString(),
        recurring_cron: '0 9 * * *',
        snoozed_count: 0,
        created_at: new Date().toISOString(),
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [reminder] })
        .mockResolvedValueOnce({ rows: [] });

      await checkReminders(mockClient);

      expect(getNextCronRun).toHaveBeenCalledWith('0 9 * * *', expect.any(Date));
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE reminders SET remind_at'),
        [nextRun.toISOString(), 3],
      );
      // Should NOT mark completed
      const completedCalls = mockPool.query.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('completed = true'),
      );
      expect(completedCalls).toHaveLength(0);
    });

    it('should mark completed on invalid recurring cron', async () => {
      getNextCronRun.mockImplementation(() => {
        throw new Error('bad cron');
      });

      const mockUser = { send: vi.fn().mockResolvedValue({}) };
      const mockClient = { users: { fetch: vi.fn().mockResolvedValue(mockUser) } };

      const reminder = {
        id: 4,
        guild_id: 'g1',
        user_id: 'u4',
        channel_id: 'c1',
        message: 'Bad cron',
        remind_at: new Date().toISOString(),
        recurring_cron: 'invalid',
        snoozed_count: 0,
        created_at: new Date().toISOString(),
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [reminder] })
        .mockResolvedValueOnce({ rows: [] });

      await checkReminders(mockClient);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('completed = true'), [4]);
    });
  });

  describe('handleReminderSnooze', () => {
    it('should snooze a reminder for 15m', async () => {
      const reminder = {
        id: 10,
        user_id: 'u1',
        message: 'Snooze test',
      };

      mockPool.query.mockResolvedValueOnce({ rows: [reminder] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const interaction = {
        customId: 'reminder_snooze_10_15m',
        user: { id: 'u1' },
        update: vi.fn().mockResolvedValue({}),
        reply: vi.fn().mockResolvedValue({}),
      };

      await handleReminderSnooze(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('snoozed_count = snoozed_count + 1'),
        expect.arrayContaining([10]),
      );
      expect(interaction.update).toHaveBeenCalled();
    });

    it('should reject snooze from non-owner', async () => {
      const reminder = { id: 10, user_id: 'u1' };
      mockPool.query.mockResolvedValueOnce({ rows: [reminder] });

      const interaction = {
        customId: 'reminder_snooze_10_15m',
        user: { id: 'u2' },
        reply: vi.fn().mockResolvedValue({}),
      };

      await handleReminderSnooze(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("isn't your reminder") }),
      );
    });

    it('should handle not-found reminder', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const interaction = {
        customId: 'reminder_snooze_999_1h',
        user: { id: 'u1' },
        reply: vi.fn().mockResolvedValue({}),
      };

      await handleReminderSnooze(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '❌ Reminder not found.' }),
      );
    });

    it('should return early for non-matching customId', async () => {
      const interaction = {
        customId: 'something_else',
        user: { id: 'u1' },
        reply: vi.fn(),
      };

      await handleReminderSnooze(interaction);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should fall back to reply if update fails', async () => {
      const reminder = { id: 11, user_id: 'u1' };
      mockPool.query.mockResolvedValueOnce({ rows: [reminder] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const interaction = {
        customId: 'reminder_snooze_11_1h',
        user: { id: 'u1' },
        update: vi.fn().mockRejectedValue(new Error('expired')),
        reply: vi.fn().mockResolvedValue({}),
      };

      await handleReminderSnooze(interaction);
      expect(interaction.reply).toHaveBeenCalled();
    });
  });

  describe('handleReminderDismiss', () => {
    it('should dismiss a reminder', async () => {
      const reminder = { id: 20, user_id: 'u1' };
      mockPool.query.mockResolvedValueOnce({ rows: [reminder] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const interaction = {
        customId: 'reminder_dismiss_20',
        user: { id: 'u1' },
        update: vi.fn().mockResolvedValue({}),
        reply: vi.fn().mockResolvedValue({}),
      };

      await handleReminderDismiss(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('completed = true'),
        [20],
      );
      expect(interaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ content: '✅ Reminder dismissed.' }),
      );
    });

    it('should reject dismiss from non-owner', async () => {
      const reminder = { id: 20, user_id: 'u1' };
      mockPool.query.mockResolvedValueOnce({ rows: [reminder] });

      const interaction = {
        customId: 'reminder_dismiss_20',
        user: { id: 'u2' },
        reply: vi.fn().mockResolvedValue({}),
      };

      await handleReminderDismiss(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("isn't your reminder") }),
      );
    });

    it('should return early for non-matching customId', async () => {
      const interaction = {
        customId: 'not_a_dismiss',
        user: { id: 'u1' },
        reply: vi.fn(),
      };

      await handleReminderDismiss(interaction);
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });
});
