import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

import { getPool } from '../../src/db.js';
import { info, error as logError } from '../../src/logger.js';
import {
  assignTempRole,
  listTempRoles,
  revokeTempRole,
  revokeTempRoleById,
  startTempRoleScheduler,
  stopTempRoleScheduler,
} from '../../src/modules/tempRoleHandler.js';

describe('tempRoleHandler', () => {
  let mockPool;

  beforeEach(() => {
    vi.useFakeTimers();

    mockPool = { query: vi.fn() };
    getPool.mockReturnValue(mockPool);
  });

  afterEach(() => {
    stopTempRoleScheduler();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ── assignTempRole ────────────────────────────────────────────────────────

  describe('assignTempRole', () => {
    it('inserts a record and returns it', async () => {
      const fakeRow = {
        id: 1,
        guild_id: 'g1',
        user_id: 'u1',
        user_tag: 'User#0001',
        role_id: 'r1',
        role_name: 'VIP',
        duration: '1 day',
        expires_at: new Date(Date.now() + 86400000),
      };
      mockPool.query.mockResolvedValueOnce({ rows: [fakeRow] });

      const result = await assignTempRole({
        guildId: 'g1',
        userId: 'u1',
        userTag: 'User#0001',
        roleId: 'r1',
        roleName: 'VIP',
        moderatorId: 'mod1',
        moderatorTag: 'Mod#0001',
        duration: '1 day',
        expiresAt: fakeRow.expires_at,
        reason: 'test reason',
      });

      expect(result).toEqual(fakeRow);
      expect(mockPool.query).toHaveBeenCalledOnce();
      expect(mockPool.query.mock.calls[0][0]).toContain('INSERT INTO temp_roles');
      expect(info).toHaveBeenCalledWith(
        'Temp role assigned',
        expect.objectContaining({ roleId: 'r1' }),
      );
    });

    it('throws on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB connection failed'));

      await expect(
        assignTempRole({
          guildId: 'g1',
          userId: 'u1',
          userTag: 'User#0001',
          roleId: 'r1',
          roleName: 'VIP',
          moderatorId: 'mod1',
          moderatorTag: 'Mod#0001',
          duration: '1 day',
          expiresAt: new Date(),
        }),
      ).rejects.toThrow('Failed to assign temp role');

      expect(logError).toHaveBeenCalledWith(
        'Failed to assign temp role',
        expect.objectContaining({ error: 'DB connection failed' }),
      );
    });
  });

  // ── revokeTempRole ────────────────────────────────────────────────────────

  describe('revokeTempRole', () => {
    it('marks the record removed and returns it', async () => {
      const fakeRow = { id: 1, guild_id: 'g1', user_id: 'u1', role_id: 'r1', removed: true };
      mockPool.query.mockResolvedValueOnce({ rows: [fakeRow] });

      const result = await revokeTempRole('g1', 'u1', 'r1');

      expect(result).toEqual(fakeRow);
      expect(mockPool.query.mock.calls[0][0]).toContain('UPDATE temp_roles');
      expect(info).toHaveBeenCalledWith('Temp role revoked early', expect.any(Object));
    });

    it('returns null when no active assignment found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await revokeTempRole('g1', 'u1', 'nonexistent');
      expect(result).toBeNull();
    });

    it('throws on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      await expect(revokeTempRole('g1', 'u1', 'r1')).rejects.toThrow('Failed to revoke temp role');

      expect(logError).toHaveBeenCalledWith(
        'Failed to revoke temp role',
        expect.objectContaining({ error: 'DB error' }),
      );
    });
  });

  // ── revokeTempRoleById ────────────────────────────────────────────────────

  describe('revokeTempRoleById', () => {
    it('revokes by record id and returns the row', async () => {
      const fakeRow = { id: 42, guild_id: 'g1', user_id: 'u1', role_id: 'r1', removed: true };
      mockPool.query.mockResolvedValueOnce({ rows: [fakeRow] });

      const result = await revokeTempRoleById(42, 'g1');

      expect(result).toEqual(fakeRow);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND guild_id = $2'),
        [42, 'g1'],
      );
      expect(info).toHaveBeenCalledWith('Temp role revoked by ID', expect.any(Object));
    });

    it('returns null when record not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await revokeTempRoleById(999, 'g1');
      expect(result).toBeNull();
    });

    it('throws on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      await expect(revokeTempRoleById(42, 'g1')).rejects.toThrow('Failed to revoke temp role');

      expect(logError).toHaveBeenCalledWith(
        'Failed to revoke temp role by ID',
        expect.objectContaining({ error: 'DB error' }),
      );
    });
  });

  // ── listTempRoles ─────────────────────────────────────────────────────────

  describe('listTempRoles', () => {
    it('returns rows and total count', async () => {
      const fakeRows = [{ id: 1 }, { id: 2 }];
      mockPool.query
        .mockResolvedValueOnce({ rows: fakeRows })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] });

      const result = await listTempRoles('g1');

      expect(result.rows).toEqual(fakeRows);
      expect(result.total).toBe(2);
    });

    it('adds userId filter when provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      await listTempRoles('g1', { userId: 'u1' });

      const selectCall = mockPool.query.mock.calls[0][0];
      expect(selectCall).toContain('user_id');
    });

    it('returns empty when no results', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const result = await listTempRoles('g1');
      expect(result.rows).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('throws on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      await expect(listTempRoles('g1')).rejects.toThrow('Failed to list temp roles');

      expect(logError).toHaveBeenCalledWith(
        'Failed to list temp roles',
        expect.objectContaining({ error: 'DB error' }),
      );
    });
  });

  // ── scheduler ─────────────────────────────────────────────────────────────

  describe('startTempRoleScheduler / stopTempRoleScheduler', () => {
    it('starts and stops without error', () => {
      // Pool query for initial poll (no expired rows)
      mockPool.query.mockResolvedValue({ rows: [] });

      const mockClient = { guilds: { fetch: vi.fn() } };
      startTempRoleScheduler(mockClient);
      stopTempRoleScheduler();

      expect(info).toHaveBeenCalledWith('Temp role scheduler started');
      expect(info).toHaveBeenCalledWith('Temp role scheduler stopped');
    });

    it('does not start a second interval if already running', () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const mockClient = { guilds: { fetch: vi.fn() } };
      startTempRoleScheduler(mockClient);
      startTempRoleScheduler(mockClient); // second call should be a no-op

      // info called once (not twice for "started")
      const startedCalls = info.mock.calls.filter(([msg]) => msg === 'Temp role scheduler started');
      expect(startedCalls).toHaveLength(1);
    });

    it('logs error when initial poll rejects', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('initial boom'));

      const mockClient = { guilds: { fetch: vi.fn() } };
      startTempRoleScheduler(mockClient);

      // Flush the microtask queue so the .catch() handler runs
      await vi.advanceTimersByTimeAsync(0);

      expect(logError).toHaveBeenCalledWith(
        'Temp role scheduler poll error',
        expect.objectContaining({ error: 'initial boom' }),
      );
    });

    it('interval fires and calls pollExpiredTempRoles', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const mockClient = { guilds: { fetch: vi.fn() } };
      startTempRoleScheduler(mockClient);

      // Flush the initial poll
      await vi.advanceTimersByTimeAsync(0);
      mockPool.query.mockClear();
      mockPool.query.mockResolvedValue({ rows: [] });

      // Advance by 60s to fire the interval callback
      await vi.advanceTimersByTimeAsync(60_000);

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('interval catch logs error from poll', async () => {
      // First call (initial poll) succeeds
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const mockClient = { guilds: { fetch: vi.fn() } };
      startTempRoleScheduler(mockClient);

      await vi.advanceTimersByTimeAsync(0);

      // Next poll (interval) rejects
      mockPool.query.mockRejectedValueOnce(new Error('interval boom'));
      await vi.advanceTimersByTimeAsync(60_000);

      expect(logError).toHaveBeenCalledWith(
        'Temp role scheduler poll error',
        expect.objectContaining({ error: 'interval boom' }),
      );
    });
  });

  // ── stopTempRoleScheduler ───────────────────────────────────────────────

  describe('stopTempRoleScheduler', () => {
    it('is a no-op when scheduler is not running', () => {
      // Call stop without start — should not throw or log
      stopTempRoleScheduler();

      const stoppedCalls = info.mock.calls.filter(([msg]) => msg === 'Temp role scheduler stopped');
      expect(stoppedCalls).toHaveLength(0);
    });
  });

  // ── pollExpiredTempRoles (via scheduler) ─────────────────────────────────

  describe('pollExpiredTempRoles', () => {
    const expiredRow = {
      id: 10,
      guild_id: 'g1',
      user_id: 'u1',
      role_id: 'r1',
      role_name: 'VIP',
    };

    function startAndFlushInitialPoll(client) {
      // Initial poll returns no rows so it completes quickly
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      startTempRoleScheduler(client);
      return vi.advanceTimersByTimeAsync(0);
    }

    it('removes role from member when temp role expires', async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined);
      const mockMember = { roles: { remove: mockRemove } };
      const mockGuild = { members: { fetch: vi.fn().mockResolvedValue(mockMember) } };
      const mockClient = { guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) } };

      await startAndFlushInitialPoll(mockClient);
      mockPool.query.mockClear();

      // Interval poll: SELECT expired rows, then claim UPDATE
      mockPool.query
        .mockResolvedValueOnce({ rows: [expiredRow] })
        .mockResolvedValueOnce({ rows: [{ id: expiredRow.id }] });

      await vi.advanceTimersByTimeAsync(60_000);

      expect(mockClient.guilds.fetch).toHaveBeenCalledWith('g1');
      expect(mockGuild.members.fetch).toHaveBeenCalledWith('u1');
      expect(mockRemove).toHaveBeenCalledWith('r1', 'Temp role expired');
      expect(info).toHaveBeenCalledWith(
        'Temp role expired and removed',
        expect.objectContaining({ userId: 'u1', roleId: 'r1' }),
      );
    });

    it('logs info when member is no longer in guild', async () => {
      const mockGuild = {
        members: { fetch: vi.fn().mockRejectedValue(new Error('Unknown Member')) },
      };
      const mockClient = { guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) } };

      await startAndFlushInitialPoll(mockClient);
      mockPool.query.mockClear();

      mockPool.query
        .mockResolvedValueOnce({ rows: [expiredRow] })
        .mockResolvedValueOnce({ rows: [{ id: expiredRow.id }] });

      await vi.advanceTimersByTimeAsync(60_000);

      expect(info).toHaveBeenCalledWith(
        'Temp role expired — member no longer in guild',
        expect.objectContaining({ userId: 'u1', roleId: 'r1' }),
      );
    });

    it('skips row when claim returns empty (already processed)', async () => {
      const mockClient = {
        guilds: { fetch: vi.fn() },
      };

      await startAndFlushInitialPoll(mockClient);
      mockPool.query.mockClear();

      // SELECT returns row, but claim UPDATE returns empty
      mockPool.query
        .mockResolvedValueOnce({ rows: [expiredRow] })
        .mockResolvedValueOnce({ rows: [] });

      await vi.advanceTimersByTimeAsync(60_000);

      // guilds.fetch should NOT be called because claim failed
      expect(mockClient.guilds.fetch).not.toHaveBeenCalled();
    });

    it('logs error when guild.fetch throws', async () => {
      const mockClient = {
        guilds: { fetch: vi.fn().mockRejectedValue(new Error('Unknown Guild')) },
      };

      await startAndFlushInitialPoll(mockClient);
      mockPool.query.mockClear();

      mockPool.query
        .mockResolvedValueOnce({ rows: [expiredRow] })
        .mockResolvedValueOnce({ rows: [{ id: expiredRow.id }] });

      await vi.advanceTimersByTimeAsync(60_000);

      expect(logError).toHaveBeenCalledWith(
        'Failed to remove expired temp role',
        expect.objectContaining({ id: 10, error: 'Unknown Guild' }),
      );
    });

    it('logs error when roles.remove throws', async () => {
      const mockMember = {
        roles: { remove: vi.fn().mockRejectedValue(new Error('Missing Permissions')) },
      };
      const mockGuild = { members: { fetch: vi.fn().mockResolvedValue(mockMember) } };
      const mockClient = { guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) } };

      await startAndFlushInitialPoll(mockClient);
      mockPool.query.mockClear();

      mockPool.query
        .mockResolvedValueOnce({ rows: [expiredRow] })
        .mockResolvedValueOnce({ rows: [{ id: expiredRow.id }] });

      await vi.advanceTimersByTimeAsync(60_000);

      expect(logError).toHaveBeenCalledWith(
        'Failed to remove expired temp role',
        expect.objectContaining({ error: 'Missing Permissions', id: 10 }),
      );
    });

    it('handles top-level DB error in poll gracefully', async () => {
      const mockClient = { guilds: { fetch: vi.fn() } };

      await startAndFlushInitialPoll(mockClient);
      mockPool.query.mockClear();

      mockPool.query.mockRejectedValueOnce(new Error('connection lost'));

      await vi.advanceTimersByTimeAsync(60_000);

      expect(logError).toHaveBeenCalledWith(
        'Temp role scheduler poll error',
        expect.objectContaining({ error: 'connection lost' }),
      );
    });
  });
});
