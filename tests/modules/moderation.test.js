import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies

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
import { error as loggerError, warn as loggerWarn } from '../../src/logger.js';
import { getConfig } from '../../src/modules/config.js';
import {
  checkEscalation,
  checkHierarchy,
  createCase,
  isProtectedTarget,
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

    it('should use null for caseId when not provided', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 2, action: 'unban' }] });

      await scheduleAction('guild1', 'unban', 'user1', undefined, new Date());

      const call = mockPool.query.mock.calls[0];
      expect(call[1][3]).toBeNull(); // caseId || null = null when undefined
    });
  });

  describe('sendDmNotification', () => {
    it('should send DM embed to member', async () => {
      const mockSend = vi.fn().mockResolvedValue(undefined);
      const member = { send: mockSend };

      await sendDmNotification(member, 'warn', 'test reason', 'Test Server');

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
    });

    it('should use fallback reason when none provided', async () => {
      const mockSend = vi.fn().mockResolvedValue(undefined);
      const member = { send: mockSend };

      await sendDmNotification(member, 'kick', null, 'Test Server');

      const embed = mockSend.mock.calls[0][0].embeds[0];
      const fields = embed.toJSON().fields;
      expect(fields[0].value).toBe('No reason provided');
    });

    it('should silently catch DM failures', async () => {
      const member = { send: vi.fn().mockRejectedValue(new Error('DMs disabled')) };

      await sendDmNotification(member, 'ban', 'reason', 'Server');
    });

    it('should use action as past tense when action is not in ACTION_PAST_TENSE', async () => {
      const mockSend = vi.fn().mockResolvedValue(undefined);
      const member = { send: mockSend };

      await sendDmNotification(member, 'unknown_action', 'reason', 'Server');

      expect(mockSend).toHaveBeenCalled();
      // The embed title should contain 'unknown_action' since it's not in ACTION_PAST_TENSE
      const embed = mockSend.mock.calls[0][0].embeds[0];
      const title = embed.toJSON().title;
      expect(title).toContain('unknown_action');
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

    it('should fall back to default channel when action-specific channel is missing', async () => {
      const mockSendMessage = vi.fn().mockResolvedValue({ id: 'msg-default' });
      const mockChannel = { send: mockSendMessage };
      const client = { channels: { fetch: vi.fn().mockResolvedValue(mockChannel) } };
      const config = {
        moderation: {
          logging: { channels: { default: '123', warns: null } },
        },
      };
      mockPool.query.mockResolvedValue({ rows: [] });

      await sendModLogEmbed(client, config, {
        id: 2,
        case_number: 2,
        action: 'warn',
        target_id: 'user1',
        target_tag: 'User#0001',
        moderator_id: 'mod1',
        moderator_tag: 'Mod#0001',
        reason: 'test',
      });

      expect(client.channels.fetch).toHaveBeenCalledWith('123');
    });

    it('should include duration field when provided', async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: 'msg3' });
      const mockChannel = { send: mockSend };
      const client = {
        channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
      };
      const config = {
        moderation: { logging: { channels: { default: '123' } } },
      };
      mockPool.query.mockResolvedValue({ rows: [] });

      await sendModLogEmbed(client, config, {
        id: 3,
        case_number: 3,
        action: 'timeout',
        target_id: 'user1',
        target_tag: 'User#0001',
        moderator_id: 'mod1',
        moderator_tag: 'Mod#0001',
        reason: 'test',
        duration: '1h',
        created_at: new Date().toISOString(),
      });

      const embed = mockSend.mock.calls[0][0].embeds[0];
      const fields = embed.toJSON().fields;
      expect(fields.some((f) => f.name === 'Duration')).toBe(true);
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

    it('should return null when action channel and default channel are both missing', async () => {
      const result = await sendModLogEmbed(
        { channels: { fetch: vi.fn() } },
        { moderation: { logging: { channels: { warns: null, default: null } } } },
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
      expect(loggerWarn).toHaveBeenCalledWith(
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

    it('should return null when no thresholds are configured', async () => {
      const config = { moderation: { escalation: { enabled: true, thresholds: [] } } };
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

      expect(result).toMatchObject({ action: 'timeout' });
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

      expect(result).toHaveProperty('action', 'ban');
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

    it('should return error when target is higher', () => {
      const moderator = { roles: { highest: { position: 3 } } };
      const target = { roles: { highest: { position: 10 } } };
      expect(checkHierarchy(moderator, target)).toContain('cannot moderate');
    });

    it('should return null when botMember is null', () => {
      const moderator = { roles: { highest: { position: 10 } } };
      const target = { roles: { highest: { position: 5 } } };
      expect(checkHierarchy(moderator, target, null)).toBeNull();
    });

    it('should return error when bot role is too low', () => {
      const moderator = { roles: { highest: { position: 10 } } };
      const target = { roles: { highest: { position: 5 } } };
      const botMember = { roles: { highest: { position: 4 } } };
      expect(checkHierarchy(moderator, target, botMember)).toContain('my role is not high enough');
    });

    it('should pass when bot role is higher than target', () => {
      const moderator = { roles: { highest: { position: 10 } } };
      const target = { roles: { highest: { position: 5 } } };
      const botMember = { roles: { highest: { position: 8 } } };
      expect(checkHierarchy(moderator, target, botMember)).toBeNull();
    });
  });

  describe('isProtectedTarget', () => {
    const makeTarget = (id, roleIds = []) => ({
      id,
      roles: { cache: { keys: () => roleIds } },
    });

    const makeGuild = (ownerId) => ({ id: 'guild1', ownerId });

    it('returns false when protectRoles is disabled', () => {
      const target = makeTarget('user1', ['admin-role']);
      const guild = makeGuild('owner1');
      getConfig.mockReturnValueOnce({
        moderation: { protectRoles: { enabled: false } },
        permissions: { adminRoleId: 'admin-role' },
      });
      expect(isProtectedTarget(target, guild)).toBe(false);
    });

    it('returns false when protectRoles config is absent', () => {
      const target = makeTarget('user1');
      const guild = makeGuild('owner1');
      getConfig.mockReturnValueOnce({ moderation: {} });
      expect(isProtectedTarget(target, guild)).toBe(false);
    });

    it('returns true for server owner when includeServerOwner is true', () => {
      const target = makeTarget('owner1');
      const guild = makeGuild('owner1');
      getConfig.mockReturnValueOnce({
        moderation: {
          protectRoles: {
            enabled: true,
            roleIds: [],
            includeAdmins: false,
            includeModerators: false,
            includeServerOwner: true,
          },
        },
      });
      expect(isProtectedTarget(target, guild)).toBe(true);
    });

    it('returns false for server owner when includeServerOwner is false', () => {
      const target = makeTarget('owner1');
      const guild = makeGuild('owner1');
      getConfig.mockReturnValueOnce({
        moderation: {
          protectRoles: {
            enabled: true,
            roleIds: [],
            includeAdmins: false,
            includeModerators: false,
            includeServerOwner: false,
          },
        },
      });
      expect(isProtectedTarget(target, guild)).toBe(false);
    });

    it('returns true for user with adminRoleId when includeAdmins is true', () => {
      const target = makeTarget('user1', ['admin-role']);
      const guild = makeGuild('owner1');
      getConfig.mockReturnValueOnce({
        moderation: {
          protectRoles: {
            enabled: true,
            roleIds: [],
            includeAdmins: true,
            includeModerators: false,
            includeServerOwner: false,
          },
        },
        permissions: { adminRoleId: 'admin-role' },
      });
      expect(isProtectedTarget(target, guild)).toBe(true);
    });

    it('returns false for admin role when includeAdmins is false', () => {
      const target = makeTarget('user1', ['admin-role']);
      const guild = makeGuild('owner1');
      getConfig.mockReturnValueOnce({
        moderation: {
          protectRoles: {
            enabled: true,
            roleIds: [],
            includeAdmins: false,
            includeModerators: false,
            includeServerOwner: false,
          },
        },
        permissions: { adminRoleId: 'admin-role' },
      });
      expect(isProtectedTarget(target, guild)).toBe(false);
    });

    it('returns true for user with moderatorRoleId when includeModerators is true', () => {
      const target = makeTarget('user1', ['mod-role']);
      const guild = makeGuild('owner1');
      getConfig.mockReturnValueOnce({
        moderation: {
          protectRoles: {
            enabled: true,
            roleIds: [],
            includeAdmins: false,
            includeModerators: true,
            includeServerOwner: false,
          },
        },
        permissions: { moderatorRoleId: 'mod-role' },
      });
      expect(isProtectedTarget(target, guild)).toBe(true);
    });

    it('returns true for user with a custom roleId in protectRoles.roleIds', () => {
      const target = makeTarget('user1', ['custom-role']);
      const guild = makeGuild('owner1');
      getConfig.mockReturnValueOnce({
        moderation: {
          protectRoles: {
            enabled: true,
            roleIds: ['custom-role'],
            includeAdmins: false,
            includeModerators: false,
            includeServerOwner: false,
          },
        },
      });
      expect(isProtectedTarget(target, guild)).toBe(true);
    });

    it('returns false for regular user with no protected roles', () => {
      const target = makeTarget('user1', ['regular-role']);
      const guild = makeGuild('owner1');
      getConfig.mockReturnValueOnce({
        moderation: {
          protectRoles: {
            enabled: true,
            roleIds: [],
            includeAdmins: true,
            includeModerators: true,
            includeServerOwner: true,
          },
        },
        permissions: { adminRoleId: 'admin-role', moderatorRoleId: 'mod-role' },
      });
      expect(isProtectedTarget(target, guild)).toBe(false);
    });

    it('returns false when no protectedRoleIds resolve (no adminRoleId set) and user is non-owner', () => {
      const target = makeTarget('user1', ['some-role']);
      const guild = makeGuild('owner1');
      getConfig.mockReturnValueOnce({
        moderation: {
          protectRoles: {
            enabled: true,
            roleIds: [],
            includeAdmins: true,
            includeModerators: true,
            includeServerOwner: false,
          },
        },
        permissions: {},
      });
      expect(isProtectedTarget(target, guild)).toBe(false);
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

    it('should return false when action is not configured', () => {
      const config = { moderation: {} };
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
