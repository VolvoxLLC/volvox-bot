import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    moderation: {
      dmNotifications: { warn: true, kick: true, timeout: true, ban: true },
      escalation: { enabled: false, thresholds: [] },
      logging: { channels: { default: '123', warns: null, bans: '456' } },
    },
  }),
}));

vi.mock('../../src/utils/duration.js', () => ({
  parseDuration: vi.fn().mockReturnValue(3600000),
  formatDuration: vi.fn().mockReturnValue('1 hour'),
}));

import { getPool } from '../../src/db.js';
import { error as loggerError } from '../../src/logger.js';
import {
  checkEscalation,
  checkHierarchy,
  createCase,
  scheduleAction,
  sendDmNotification,
  sendModLogEmbed,
  shouldSendDm,
  startTempbanScheduler,
  stopTempbanScheduler,
} from '../../src/modules/moderation.js';

describe('moderation module', () => {
  let mockPool;
  let mockConnection;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConnection = {
      query: vi.fn(),
      release: vi.fn(),
    };

    mockPool = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(mockConnection),
    };

    getPool.mockReturnValue(mockPool);
  });

  afterEach(() => {
    stopTempbanScheduler();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('createCase', () => {
    it('should insert a case atomically and return it', async () => {
      mockConnection.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // advisory lock
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              guild_id: 'guild1',
              case_number: 4,
              action: 'warn',
              target_id: 'user1',
              target_tag: 'User#0001',
              moderator_id: 'mod1',
              moderator_tag: 'Mod#0001',
              reason: 'test reason',
              duration: null,
              expires_at: null,
              created_at: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({}); // COMMIT

      const result = await createCase('guild1', {
        action: 'warn',
        targetId: 'user1',
        targetTag: 'User#0001',
        moderatorId: 'mod1',
        moderatorTag: 'Mod#0001',
        reason: 'test reason',
      });

      expect(result.case_number).toBe(4);
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
      expect(mockConnection.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['guild1'],
      );
      expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should rollback transaction when insert fails', async () => {
      mockConnection.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // advisory lock
        .mockRejectedValueOnce(new Error('insert failed')) // INSERT
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        createCase('guild1', {
          action: 'warn',
          targetId: 'user1',
          targetTag: 'User#0001',
          moderatorId: 'mod1',
          moderatorTag: 'Mod#0001',
        }),
      ).rejects.toThrow('insert failed');

      expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('scheduleAction', () => {
    it('should insert a scheduled action row', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 1, action: 'unban' }] });

      const result = await scheduleAction('guild1', 'unban', 'user1', 10, new Date());

      expect(result).toEqual({ id: 1, action: 'unban' });
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO mod_scheduled_actions'),
        expect.arrayContaining(['guild1', 'unban', 'user1', 10]),
      );
    });
  });

  describe('sendDmNotification', () => {
    it('should send DM embed to member', async () => {
      const mockSend = vi.fn().mockResolvedValue(undefined);
      const member = { send: mockSend };

      await sendDmNotification(member, 'warn', 'test reason', 'Test Server');

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
    });

    it('should silently catch DM failures', async () => {
      const member = { send: vi.fn().mockRejectedValue(new Error('DMs disabled')) };

      await sendDmNotification(member, 'ban', 'reason', 'Server');
    });
  });

  describe('sendModLogEmbed', () => {
    it('should send embed to action-specific channel', async () => {
      const mockSendMessage = vi.fn().mockResolvedValue({ id: 'msg1' });
      const mockChannel = { send: mockSendMessage };
      const client = {
        channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
      };
      const config = {
        moderation: {
          logging: { channels: { default: '123', bans: '456' } },
        },
      };
      mockPool.query.mockResolvedValue({ rows: [] }); // update log_message_id

      const caseData = {
        id: 1,
        case_number: 1,
        action: 'ban',
        target_id: 'user1',
        target_tag: 'User#0001',
        moderator_id: 'mod1',
        moderator_tag: 'Mod#0001',
        reason: 'test',
        created_at: new Date().toISOString(),
      };

      const result = await sendModLogEmbed(client, config, caseData);

      expect(client.channels.fetch).toHaveBeenCalledWith('456');
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE mod_cases SET log_message_id = $1 WHERE id = $2',
        ['msg1', 1],
      );
      expect(result).toEqual({ id: 'msg1' });
    });

    it('should log when storing log_message_id fails', async () => {
      const mockChannel = { send: vi.fn().mockResolvedValue({ id: 'msg1' }) };
      const client = { channels: { fetch: vi.fn().mockResolvedValue(mockChannel) } };
      const config = { moderation: { logging: { channels: { default: '123' } } } };
      mockPool.query.mockRejectedValue(new Error('db write failed'));

      await sendModLogEmbed(client, config, {
        id: 4,
        case_number: 4,
        action: 'warn',
        target_id: 'user1',
        target_tag: 'User#0001',
        moderator_id: 'mod1',
        moderator_tag: 'Mod#0001',
        reason: 'test',
      });

      expect(loggerError).toHaveBeenCalledWith(
        'Failed to store log message ID',
        expect.objectContaining({ caseId: 4, messageId: 'msg1' }),
      );
    });

    it('should return null when no log channels are configured', async () => {
      const result = await sendModLogEmbed(
        { channels: { fetch: vi.fn() } },
        { moderation: {} },
        { action: 'warn' },
      );

      expect(result).toBeNull();
    });

    it('should return null when channel cannot be fetched', async () => {
      const client = { channels: { fetch: vi.fn().mockRejectedValue(new Error('no channel')) } };
      const config = { moderation: { logging: { channels: { default: '123' } } } };

      const result = await sendModLogEmbed(client, config, {
        action: 'warn',
        case_number: 1,
      });

      expect(result).toBeNull();
    });

    it('should return null when sending embed fails', async () => {
      const mockChannel = { send: vi.fn().mockRejectedValue(new Error('cannot send')) };
      const client = { channels: { fetch: vi.fn().mockResolvedValue(mockChannel) } };
      const config = { moderation: { logging: { channels: { default: '123' } } } };

      const result = await sendModLogEmbed(client, config, {
        id: 9,
        action: 'warn',
        case_number: 9,
        target_id: 'user1',
        target_tag: 'User#0001',
        moderator_id: 'mod1',
        moderator_tag: 'Mod#0001',
        reason: 'test',
      });

      expect(result).toBeNull();
      expect(loggerError).toHaveBeenCalledWith(
        'Failed to send mod log embed',
        expect.objectContaining({ channelId: '123' }),
      );
    });
  });

  describe('checkEscalation', () => {
    it('should return null when escalation is disabled', async () => {
      const config = { moderation: { escalation: { enabled: false } } };
      const result = await checkEscalation(null, 'guild1', 'user1', 'mod1', 'Mod#0001', config);
      expect(result).toBeNull();
    });

    it('should return null when warn count is below threshold', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });

      const config = {
        moderation: {
          escalation: {
            enabled: true,
            thresholds: [{ warns: 3, withinDays: 7, action: 'timeout', duration: '1h' }],
          },
        },
      };

      const result = await checkEscalation(
        { guilds: { fetch: vi.fn() } },
        'guild1',
        'user1',
        'mod1',
        'Mod#0001',
        config,
      );

      expect(result).toBeNull();
    });

    it('should trigger escalation when threshold is met', async () => {
      const mockMember = {
        timeout: vi.fn().mockResolvedValue(undefined),
        user: { tag: 'User#0001' },
      };
      const mockGuild = {
        members: {
          fetch: vi.fn().mockResolvedValue(mockMember),
          ban: vi.fn(),
        },
      };
      const mockClient = {
        guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) },
        channels: {
          fetch: vi.fn().mockResolvedValue({ send: vi.fn().mockResolvedValue({ id: 'msg' }) }),
        },
      };

      // warn count query, then log_message_id update from sendModLogEmbed
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })
        .mockResolvedValueOnce({ rows: [] });

      // createCase transaction queries
      mockConnection.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // advisory lock
        .mockResolvedValueOnce({
          rows: [
            {
              id: 6,
              case_number: 6,
              action: 'timeout',
              target_id: 'user1',
              target_tag: 'User#0001',
              moderator_id: 'mod1',
              moderator_tag: 'Mod#0001',
              reason: 'Auto-escalation: 3 warns in 7 days',
              duration: '1h',
              created_at: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({}); // COMMIT

      const config = {
        moderation: {
          escalation: {
            enabled: true,
            thresholds: [{ warns: 3, withinDays: 7, action: 'timeout', duration: '1h' }],
          },
          logging: { channels: { default: '123' } },
        },
      };

      const result = await checkEscalation(
        mockClient,
        'guild1',
        'user1',
        'mod1',
        'Mod#0001',
        config,
      );

      expect(result).toBeTruthy();
      expect(result.action).toBe('timeout');
      expect(mockMember.timeout).toHaveBeenCalled();
    });

    it('should support ban escalation action', async () => {
      const mockGuild = {
        members: {
          fetch: vi.fn().mockResolvedValue({ user: { tag: 'User#0001' } }),
          ban: vi.fn().mockResolvedValue(undefined),
        },
      };
      const mockClient = {
        guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) },
        channels: {
          fetch: vi.fn().mockResolvedValue({ send: vi.fn().mockResolvedValue({ id: 'msg' }) }),
        },
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      mockConnection.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // advisory lock
        .mockResolvedValueOnce({
          rows: [
            {
              id: 11,
              case_number: 11,
              action: 'ban',
              target_id: 'user1',
              target_tag: 'User#0001',
              moderator_id: 'mod1',
              moderator_tag: 'Mod#0001',
              reason: 'Auto-escalation: 5 warns in 30 days',
              created_at: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({}); // COMMIT

      const config = {
        moderation: {
          escalation: {
            enabled: true,
            thresholds: [{ warns: 5, withinDays: 30, action: 'ban' }],
          },
          logging: { channels: { default: '123' } },
        },
      };

      const result = await checkEscalation(
        mockClient,
        'guild1',
        'user1',
        'mod1',
        'Mod#0001',
        config,
      );

      expect(result).toBeTruthy();
      expect(mockGuild.members.ban).toHaveBeenCalledWith('user1', { reason: expect.any(String) });
    });
  });

  describe('checkHierarchy', () => {
    it('should return null when moderator is higher', () => {
      const moderator = { roles: { highest: { position: 10 } } };
      const target = { roles: { highest: { position: 5 } } };
      expect(checkHierarchy(moderator, target)).toBeNull();
    });

    it('should return error when target is equal or higher', () => {
      const moderator = { roles: { highest: { position: 5 } } };
      const target = { roles: { highest: { position: 5 } } };
      expect(checkHierarchy(moderator, target)).toContain('cannot moderate');
    });
  });

  describe('shouldSendDm', () => {
    it('should return true when enabled', () => {
      const config = { moderation: { dmNotifications: { warn: true } } };
      expect(shouldSendDm(config, 'warn')).toBe(true);
    });

    it('should return false when disabled', () => {
      const config = { moderation: { dmNotifications: { warn: false } } };
      expect(shouldSendDm(config, 'warn')).toBe(false);
    });
  });

  describe('tempban scheduler', () => {
    it('should start and stop scheduler idempotently', async () => {
      vi.useFakeTimers();
      mockPool.query.mockResolvedValue({ rows: [] });
      const client = {
        guilds: { fetch: vi.fn() },
        users: { fetch: vi.fn() },
        user: { id: 'bot1', tag: 'Bot#0001' },
      };

      startTempbanScheduler(client);
      startTempbanScheduler(client);

      await vi.advanceTimersByTimeAsync(100);

      stopTempbanScheduler();
      stopTempbanScheduler();
    });

    it('should process expired tempbans on poll', async () => {
      const mockGuild = {
        members: { unban: vi.fn().mockResolvedValue(undefined) },
      };
      const mockClient = {
        guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) },
        users: { fetch: vi.fn().mockResolvedValue({ tag: 'User#0001' }) },
        user: { id: 'bot1', tag: 'Bot#0001' },
        channels: {
          fetch: vi.fn().mockResolvedValue({ send: vi.fn().mockResolvedValue({ id: 'msg' }) }),
        },
      };

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              guild_id: 'guild1',
              action: 'unban',
              target_id: 'user1',
              case_id: 5,
              execute_at: new Date(),
              executed: false,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // claim executed row
        .mockResolvedValueOnce({ rows: [] }); // log_message_id update

      mockConnection.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // advisory lock
        .mockResolvedValueOnce({
          rows: [
            {
              id: 7,
              case_number: 7,
              action: 'unban',
              target_id: 'user1',
              target_tag: 'User#0001',
              moderator_id: 'bot1',
              moderator_tag: 'Bot#0001',
              reason: 'Tempban expired (case #5)',
              created_at: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({}); // COMMIT

      vi.useFakeTimers();
      startTempbanScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockGuild.members.unban).toHaveBeenCalledWith('user1', 'Tempban expired');
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE mod_scheduled_actions SET executed = TRUE WHERE id = $1 AND executed = FALSE RETURNING id',
        [1],
      );

      stopTempbanScheduler();
    });

    it('should skip rows that were already claimed by another poll', async () => {
      const mockClient = {
        guilds: { fetch: vi.fn() },
        users: { fetch: vi.fn() },
        user: { id: 'bot1', tag: 'Bot#0001' },
        channels: { fetch: vi.fn() },
      };

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 44,
              guild_id: 'guild1',
              action: 'unban',
              target_id: 'user1',
              case_id: 3,
              execute_at: new Date(),
              executed: false,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // claim failed

      vi.useFakeTimers();
      startTempbanScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockClient.guilds.fetch).not.toHaveBeenCalled();

      stopTempbanScheduler();
    });

    it('should mark claimed tempban as executed even when unban fails', async () => {
      const mockGuild = {
        members: { unban: vi.fn().mockRejectedValue(new Error('unban failed')) },
      };
      const mockClient = {
        guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) },
        users: { fetch: vi.fn() },
        user: { id: 'bot1', tag: 'Bot#0001' },
        channels: { fetch: vi.fn() },
      };

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 99,
              guild_id: 'guild1',
              action: 'unban',
              target_id: 'user1',
              case_id: 5,
              execute_at: new Date(),
              executed: false,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 99 }] }); // claim executed row

      vi.useFakeTimers();
      startTempbanScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE mod_scheduled_actions SET executed = TRUE WHERE id = $1 AND executed = FALSE RETURNING id',
        [99],
      );
      expect(loggerError).toHaveBeenCalledWith(
        'Failed to process expired tempban',
        expect.objectContaining({ id: 99, targetId: 'user1' }),
      );

      stopTempbanScheduler();
    });
  });
});
