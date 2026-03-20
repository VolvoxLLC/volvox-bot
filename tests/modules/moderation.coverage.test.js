/**
 * Coverage tests for moderation.js — DB failure paths, transaction rollback,
 * and error handling edge cases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/discordCache.js', () => ({
  fetchChannelCached: vi.fn().mockResolvedValue(null),
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
      dmNotifications: { warn: true },
      escalation: { enabled: true, thresholds: [{ count: 3, action: 'timeout', duration: '1h' }] },
      logging: { channels: { default: '123' } },
    },
  }),
}));

vi.mock('../../src/utils/duration.js', () => ({
  parseDuration: vi.fn().mockReturnValue(3600000),
  formatDuration: vi.fn().mockReturnValue('1 hour'),
}));

vi.mock('../../src/modules/webhookNotifier.js', () => ({
  fireEvent: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn(),
}));

vi.mock('../../src/utils/permissions.js', () => ({
  mergeRoleIds: vi.fn().mockReturnValue([]),
}));

import { getPool } from '../../src/db.js';
import { error as logError } from '../../src/logger.js';
import {
  checkEscalation,
  createCase,
  startTempbanScheduler,
  stopTempbanScheduler,
} from '../../src/modules/moderation.js';

describe('moderation — DB failure coverage', () => {
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

  // ── createCase DB failures ────────────────────────────────────────────

  describe('createCase transaction failure', () => {
    it('should rollback and rethrow when INSERT fails', async () => {
      mockConnection.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // advisory lock
        .mockRejectedValueOnce(new Error('INSERT failed')) // INSERT
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        createCase('g1', {
          action: 'warn',
          targetId: 't1',
          targetTag: 'target#0001',
          moderatorId: 'm1',
          moderatorTag: 'mod#0001',
          reason: 'test',
        }),
      ).rejects.toThrow('INSERT failed');

      expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should rollback when advisory lock fails', async () => {
      mockConnection.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('lock timeout')) // advisory lock
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        createCase('g1', {
          action: 'ban',
          targetId: 't1',
          targetTag: 'target',
          moderatorId: 'm1',
          moderatorTag: 'mod',
        }),
      ).rejects.toThrow('lock timeout');

      expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should release connection when pool.connect() fails', async () => {
      mockPool.connect.mockRejectedValue(new Error('no connections'));

      await expect(
        createCase('g1', {
          action: 'kick',
          targetId: 't1',
          targetTag: 'target',
          moderatorId: 'm1',
          moderatorTag: 'mod',
        }),
      ).rejects.toThrow('no connections');
    });
  });

  // ── checkEscalation DB failure ────────────────────────────────────────

  describe('checkEscalation DB failure', () => {
    it('should fall back to mod_cases when warnings table does not exist (42P01)', async () => {
      const err = new Error('relation "warnings" does not exist');
      err.code = '42P01';
      mockPool.query
        .mockRejectedValueOnce(err) // warnings query fails with 42P01
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }); // mod_cases fallback

      const config = {
        moderation: {
          escalation: {
            enabled: true,
            thresholds: [{ warns: 3, withinDays: 7, action: 'timeout', duration: '1h' }],
          },
          logging: { channels: {} },
        },
      };

      const mockClient = {
        guilds: { fetch: vi.fn() },
      };

      const result = await checkEscalation(mockClient, 'g1', 't1', 'bot1', 'Bot#0001', config);
      // Count is 0, below threshold, so no escalation
      expect(result).toBeNull();
      // Should have attempted mod_cases fallback
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should rethrow non-42P01 DB errors', async () => {
      mockPool.query.mockRejectedValue(new Error('connection lost'));

      const config = {
        moderation: {
          escalation: {
            enabled: true,
            thresholds: [{ warns: 3, withinDays: 7, action: 'timeout', duration: '1h' }],
          },
          logging: { channels: {} },
        },
      };

      const mockClient = { guilds: { fetch: vi.fn() } };

      await expect(
        checkEscalation(mockClient, 'g1', 't1', 'bot1', 'Bot#0001', config),
      ).rejects.toThrow('connection lost');

      expect(logError).toHaveBeenCalledWith(
        'Failed to count active warnings for escalation',
        expect.objectContaining({ guildId: 'g1' }),
      );
    });

    it('should return null when escalation is disabled', async () => {
      const config = { moderation: { escalation: { enabled: false } } };
      const result = await checkEscalation({}, 'g1', 't1', 'bot1', 'Bot', config);
      expect(result).toBeNull();
    });
  });

  // ── tempban scheduler DB failure ──────────────────────────────────────

  describe('tempban scheduler DB failure', () => {
    it('should handle query failure during initial poll', async () => {
      vi.useFakeTimers();
      mockPool.query.mockRejectedValue(new Error('pool exhausted'));

      // startTempbanScheduler takes only client
      startTempbanScheduler({});

      await Promise.resolve();
      await Promise.resolve();

      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Tempban'), expect.any(Object));

      stopTempbanScheduler();
    });
  });
});
