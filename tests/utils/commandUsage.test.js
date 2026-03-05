import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (before imports) ───────────────────────────────────────────────────

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };
const mockGetPool = vi.fn(() => mockPool);

vi.mock('../../src/db.js', () => ({
  getPool: () => mockGetPool(),
}));

vi.mock('../../src/logger.js', () => ({
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

import { error as logError } from '../../src/logger.js';
import {
  buildCommandUsageStatsQuery,
  getCommandUsageStats,
  logCommandUsage,
  normalizeCommandUsageLimit,
} from '../../src/utils/commandUsage.js';
import {
  COMMAND_USAGE_COLUMNS,
  COMMAND_USAGE_DEFAULT_LIMIT,
  COMMAND_USAGE_INDEXES,
  COMMAND_USAGE_MAX_LIMIT,
  COMMAND_USAGE_TABLE,
} from '../../src/utils/commandUsageContract.js';

function setupPool() {
  mockGetPool.mockReturnValue(mockPool);
  mockQuery.mockReset();
}

describe('command usage contract', () => {
  it('defines stable command_usage indexes expected by migration and queries', () => {
    expect(COMMAND_USAGE_TABLE).toBe('command_usage');
    expect(COMMAND_USAGE_COLUMNS.commandName).toBe('command_name');
    expect(COMMAND_USAGE_COLUMNS.usedAt).toBe('used_at');
    expect(COMMAND_USAGE_INDEXES).toEqual([
      'idx_command_usage_guild_time',
      'idx_command_usage_command',
      'idx_command_usage_user',
      'idx_command_usage_guild_channel_used_at',
    ]);
  });
});

describe('normalizeCommandUsageLimit', () => {
  it('uses default limit for invalid values', () => {
    expect(normalizeCommandUsageLimit(undefined)).toBe(COMMAND_USAGE_DEFAULT_LIMIT);
    expect(normalizeCommandUsageLimit(0)).toBe(COMMAND_USAGE_DEFAULT_LIMIT);
    expect(normalizeCommandUsageLimit(-5)).toBe(COMMAND_USAGE_DEFAULT_LIMIT);
    expect(normalizeCommandUsageLimit('wat')).toBe(COMMAND_USAGE_DEFAULT_LIMIT);
  });

  it('caps values at max limit', () => {
    expect(normalizeCommandUsageLimit(500)).toBe(COMMAND_USAGE_MAX_LIMIT);
    expect(normalizeCommandUsageLimit(COMMAND_USAGE_MAX_LIMIT)).toBe(COMMAND_USAGE_MAX_LIMIT);
  });
});

describe('buildCommandUsageStatsQuery', () => {
  it('builds guild + date scoped query contract', () => {
    const query = buildCommandUsageStatsQuery({
      guildId: 'guild-123',
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-05T23:59:59.999Z',
      limit: 15,
    });

    expect(query.text).toContain('FROM command_usage');
    expect(query.text).toContain('command_name AS "commandName"');
    expect(query.text).toContain('used_at >= $2');
    expect(query.text).toContain('used_at <= $3');
    expect(query.text).toContain('LIMIT $4');
    expect(query.values).toEqual([
      'guild-123',
      '2026-03-01T00:00:00.000Z',
      '2026-03-05T23:59:59.999Z',
      15,
    ]);
  });

  it('adds channel filter when provided', () => {
    const query = buildCommandUsageStatsQuery({
      guildId: 'guild-123',
      startDate: new Date('2026-03-01T00:00:00.000Z'),
      endDate: new Date('2026-03-05T23:59:59.999Z'),
      channelId: 'channel-1',
      limit: 7,
    });

    expect(query.text).toContain('channel_id = $4');
    expect(query.text).toContain('LIMIT $5');
    expect(query.values[3]).toBe('channel-1');
    expect(query.values[4]).toBe(7);
  });
});

// ── logCommandUsage ──────────────────────────────────────────────────────────

describe('logCommandUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPool();
  });

  describe('parameter validation', () => {
    it('returns early when guildId is missing', async () => {
      await logCommandUsage({ userId: 'user-123', commandName: 'ping' });
      expect(mockQuery).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith(
        'logCommandUsage called with missing required parameters',
        expect.objectContaining({ guildId: undefined }),
      );
    });

    it('returns early when userId is missing', async () => {
      await logCommandUsage({ guildId: 'guild-123', commandName: 'ping' });
      expect(mockQuery).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith(
        'logCommandUsage called with missing required parameters',
        expect.objectContaining({ userId: undefined }),
      );
    });

    it('returns early when commandName is missing', async () => {
      await logCommandUsage({ guildId: 'guild-123', userId: 'user-123' });
      expect(mockQuery).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith(
        'logCommandUsage called with missing required parameters',
        expect.objectContaining({ commandName: undefined }),
      );
    });
  });

  describe('successful insert', () => {
    it('inserts with all parameters', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await logCommandUsage({
        guildId: 'guild-123',
        userId: 'user-456',
        commandName: 'ping',
        channelId: 'channel-789',
      });

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO command_usage/);
      expect(params).toEqual(['guild-123', 'user-456', 'ping', 'channel-789']);
    });

    it('inserts with optional channelId null', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await logCommandUsage({
        guildId: 'guild-123',
        userId: 'user-456',
        commandName: 'ping',
      });

      expect(mockQuery).toHaveBeenCalledOnce();
      const [, params] = mockQuery.mock.calls[0];
      expect(params[3]).toBeNull();
    });
  });

  describe('error handling', () => {
    it('catches DB errors, logs them, does not throw', async () => {
      mockQuery.mockRejectedValue(new Error('connection failed'));

      // Should not throw
      await expect(
        logCommandUsage({
          guildId: 'guild-123',
          userId: 'user-456',
          commandName: 'ping',
        }),
      ).resolves.toBeUndefined();

      expect(logError).toHaveBeenCalledWith(
        'Failed to log command usage',
        expect.objectContaining({
          guildId: 'guild-123',
          userId: 'user-456',
          commandName: 'ping',
          error: 'connection failed',
        }),
      );
    });
  });
});

// ── getCommandUsageStats ─────────────────────────────────────────────────────

describe('getCommandUsageStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPool();
  });

  it('returns rows with commandName and uses', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { commandName: 'ping', uses: 10 },
        { commandName: 'help', uses: 5 },
      ],
    });

    const result = await getCommandUsageStats('guild-123');

    expect(result).toEqual([
      { commandName: 'ping', uses: 10 },
      { commandName: 'help', uses: 5 },
    ]);
    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/command_name AS "commandName"/);
    expect(sql).toMatch(/COUNT\(\*\)::int AS uses/);
  });

  it('throws if guildId is missing', async () => {
    await expect(getCommandUsageStats(null)).rejects.toThrow('guildId is required');
    await expect(getCommandUsageStats(undefined)).rejects.toThrow('guildId is required');
    await expect(getCommandUsageStats('')).rejects.toThrow('guildId is required');
  });

  describe('startDate filter', () => {
    it('applies startDate filter correctly', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const startDate = new Date('2024-01-01');

      await getCommandUsageStats('guild-123', { startDate });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/used_at >= \$2/);
      expect(params[1]).toBe(startDate);
    });
  });

  describe('endDate filter', () => {
    it('applies endDate filter correctly', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const endDate = new Date('2024-12-31');

      await getCommandUsageStats('guild-123', { endDate });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/used_at <= \$2/);
      expect(params[1]).toBe(endDate);
    });

    it('applies both startDate and endDate filters', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await getCommandUsageStats('guild-123', { startDate, endDate });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/used_at >= \$2/);
      expect(sql).toMatch(/used_at <= \$3/);
      expect(params[1]).toBe(startDate);
      expect(params[2]).toBe(endDate);
    });
  });

  describe('limit parameter', () => {
    it('applies limit correctly', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getCommandUsageStats('guild-123', { limit: 25 });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/LIMIT \$2/);
      expect(params[1]).toBe(25);
    });

    it('defaults limit to 15', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getCommandUsageStats('guild-123');

      const [, params] = mockQuery.mock.calls[0];
      expect(params[params.length - 1]).toBe(15);
    });

    it('validates and resets invalid limit to 15', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getCommandUsageStats('guild-123', { limit: -5 });

      const [, params] = mockQuery.mock.calls[0];
      expect(params[params.length - 1]).toBe(15);
    });

    it('validates and resets non-integer limit to 15', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getCommandUsageStats('guild-123', { limit: 'invalid' });

      const [, params] = mockQuery.mock.calls[0];
      expect(params[params.length - 1]).toBe(15);
    });

    it('caps limit at 100', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getCommandUsageStats('guild-123', { limit: 500 });

      const [, params] = mockQuery.mock.calls[0];
      expect(params[params.length - 1]).toBe(100);
    });

    it('accepts limit at exactly 100', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getCommandUsageStats('guild-123', { limit: 100 });

      const [, params] = mockQuery.mock.calls[0];
      expect(params[params.length - 1]).toBe(100);
    });
  });
});
