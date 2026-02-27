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

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue({}),
  safeReply: (t, opts) => t.reply(opts),
  safeEditReply: (t, opts) => t.editReply(opts),
}));

import { getPool } from '../../src/db.js';
import {
  getNextCronRun,
  parseCron,
  startScheduler,
  stopScheduler,
} from '../../src/modules/scheduler.js';
import { safeSend } from '../../src/utils/safeSend.js';

describe('scheduler module', () => {
  let mockPool;
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(mockPool);

    mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          id: 'ch-789',
          send: vi.fn().mockResolvedValue({}),
        }),
      },
    };
  });

  afterEach(() => {
    stopScheduler();
    vi.useRealTimers();
  });

  describe('parseCron', () => {
    it('should parse "* * * * *" (every minute)', () => {
      const result = parseCron('* * * * *');
      expect(result.minute).toHaveLength(60);
      expect(result.hour).toHaveLength(24);
      expect(result.day).toHaveLength(31);
      expect(result.month).toHaveLength(12);
      expect(result.weekday).toHaveLength(7);
    });

    it('should parse "0 * * * *" (every hour)', () => {
      const result = parseCron('0 * * * *');
      expect(result.minute).toEqual([0]);
      expect(result.hour).toHaveLength(24);
    });

    it('should parse "0 9 * * *" (daily at 9am)', () => {
      const result = parseCron('0 9 * * *');
      expect(result.minute).toEqual([0]);
      expect(result.hour).toEqual([9]);
    });

    it('should parse "0 9 * * 1" (weekly Monday 9am)', () => {
      const result = parseCron('0 9 * * 1');
      expect(result.minute).toEqual([0]);
      expect(result.hour).toEqual([9]);
      expect(result.weekday).toEqual([1]);
    });

    it('should parse "30 14 1 * *" (monthly 1st at 2:30pm)', () => {
      const result = parseCron('30 14 1 * *');
      expect(result.minute).toEqual([30]);
      expect(result.hour).toEqual([14]);
      expect(result.day).toEqual([1]);
    });

    it('should throw on invalid field count', () => {
      expect(() => parseCron('* * *')).toThrow('expected 5 fields');
      expect(() => parseCron('* * * * * *')).toThrow('expected 5 fields');
    });

    it('should throw on invalid values', () => {
      expect(() => parseCron('60 * * * *')).toThrow('Invalid cron value');
      expect(() => parseCron('* 25 * * *')).toThrow('Invalid cron value');
    });

    it('should parse comma-separated values', () => {
      const result = parseCron('0,30 9,17 * * *');
      expect(result.minute).toEqual([0, 30]);
      expect(result.hour).toEqual([9, 17]);
    });

    it('should parse range values with -', () => {
      const result = parseCron('0 9-17 * * 1-5');
      expect(result.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
      expect(result.weekday).toEqual([1, 2, 3, 4, 5]);
    });

    it('should parse step values with /', () => {
      const result = parseCron('*/15 * * * *');
      expect(result.minute).toEqual([0, 15, 30, 45]);
    });

    it('should parse step values with a base other than *', () => {
      const result = parseCron('0/20 * * * *');
      expect(result.minute).toEqual([0, 20, 40]);
    });

    it('should throw on invalid comma values (out of range)', () => {
      expect(() => parseCron('0,60 * * * *')).toThrow('Invalid cron value');
    });

    it('should throw on invalid range (start > end)', () => {
      expect(() => parseCron('0 17-9 * * *')).toThrow('Invalid cron range');
    });

    it('should throw on invalid range (out of bounds)', () => {
      expect(() => parseCron('0 * * * 0-7')).toThrow('Invalid cron range');
    });

    it('should throw on invalid step (step <= 0)', () => {
      expect(() => parseCron('*/0 * * * *')).toThrow('Invalid cron step');
    });

    it('should throw on invalid step (NaN step)', () => {
      expect(() => parseCron('*/abc * * * *')).toThrow('Invalid cron step');
    });
  });

  describe('getNextCronRun', () => {
    it('should find next minute for "* * * * *"', () => {
      const from = new Date('2026-03-01T10:00:00Z');
      const next = getNextCronRun('* * * * *', from);
      expect(next.getTime()).toBe(new Date('2026-03-01T10:01:00Z').getTime());
    });

    it('should find next hour for "0 * * * *"', () => {
      const from = new Date('2026-03-01T10:30:00Z');
      const next = getNextCronRun('0 * * * *', from);
      expect(next.getTime()).toBe(new Date('2026-03-01T11:00:00Z').getTime());
    });

    it('should find next 9am for "0 9 * * *"', () => {
      // Use a local time that's already past 9am so next is tomorrow 9am
      const from = new Date(2026, 2, 1, 10, 0, 0); // Mar 1 10:00 local
      const next = getNextCronRun('0 9 * * *', from);
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
      expect(next.getDate()).toBe(2); // next day
    });

    it('should find next Monday for "0 9 * * 1"', () => {
      // 2026-03-01 is a Sunday in local time
      const from = new Date(2026, 2, 1, 10, 0, 0); // Sunday Mar 1 10:00 local
      const next = getNextCronRun('0 9 * * 1', from);
      expect(next.getDay()).toBe(1); // Monday
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
    });

    it('should find 1st of month for "30 14 1 * *"', () => {
      const from = new Date(2026, 2, 2, 0, 0, 0); // Mar 2 local
      const next = getNextCronRun('30 14 1 * *', from);
      expect(next.getDate()).toBe(1);
      expect(next.getHours()).toBe(14);
      expect(next.getMinutes()).toBe(30);
      expect(next.getMonth()).toBe(3); // April (0-indexed)
    });
  });

  describe('startScheduler / stopScheduler', () => {
    it('should fire due messages on poll', async () => {
      const dueMessage = {
        id: 1,
        channel_id: 'ch-789',
        content: 'Scheduled hello!',
        one_time: true,
        cron_expression: null,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [dueMessage] }) // SELECT due messages
        .mockResolvedValueOnce({ rows: [] }); // UPDATE set enabled = false

      startScheduler(mockClient);

      // Let the immediate poll run
      await vi.advanceTimersByTimeAsync(0);
      // Allow microtasks to settle
      await vi.advanceTimersByTimeAsync(0);

      expect(mockClient.channels.fetch).toHaveBeenCalledWith('ch-789');
      expect(safeSend).toHaveBeenCalledWith(expect.objectContaining({ id: 'ch-789' }), {
        content: 'Scheduled hello!',
      });
    });

    it('should disable one-time messages after sending', async () => {
      const dueMessage = {
        id: 1,
        channel_id: 'ch-789',
        content: 'Once!',
        one_time: true,
        cron_expression: null,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [dueMessage] })
        .mockResolvedValueOnce({ rows: [] });

      startScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scheduled_messages SET enabled = false'),
        [1],
      );
    });

    it('should update next_run for recurring messages', async () => {
      const dueMessage = {
        id: 2,
        channel_id: 'ch-789',
        content: 'Recurring!',
        one_time: false,
        cron_expression: '0 9 * * *',
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [dueMessage] })
        .mockResolvedValueOnce({ rows: [] });

      startScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scheduled_messages SET next_run'),
        expect.arrayContaining([2]),
      );
    });

    it('should skip disabled messages (only queries enabled=true)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      startScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      // The query should only select enabled messages
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('enabled = true'));
      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should stop cleanly', () => {
      startScheduler(mockClient);
      stopScheduler();
      // No error thrown, and subsequent calls are no-ops
      stopScheduler();
    });

    it('should poll again after 60 seconds', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      startScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(0);

      // First poll ran; reset to check second
      mockPool.query.mockClear();
      mockPool.query.mockResolvedValue({ rows: [] });

      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('enabled = true'));
    });

    it('should skip channel when fetch returns null', async () => {
      const dueMessage = {
        id: 3,
        channel_id: 'missing-channel',
        content: 'Hi',
        one_time: false,
        cron_expression: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [dueMessage] });
      mockClient.channels.fetch.mockResolvedValueOnce(null);

      startScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      expect(safeSend).not.toHaveBeenCalled();
    });

    it('should disable message when cron_expression is invalid', async () => {
      const dueMessage = {
        id: 4,
        channel_id: 'ch-789',
        content: 'Bad cron',
        one_time: false,
        cron_expression: 'not-a-valid-cron',
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [dueMessage] }) // SELECT
        .mockResolvedValueOnce({ rows: [] }); // UPDATE disable

      startScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scheduled_messages SET enabled = false'),
        [4],
      );
    });

    it('should not update DB when message is not one_time and has no cron_expression', async () => {
      const dueMessage = {
        id: 5,
        channel_id: 'ch-789',
        content: 'No cron, not one_time',
        one_time: false,
        cron_expression: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [dueMessage] });

      startScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      // Only the initial SELECT query is made, no UPDATE
      const updateCalls = mockPool.query.mock.calls.filter((c) =>
        c[0].includes('UPDATE scheduled_messages'),
      );
      expect(updateCalls).toHaveLength(0);
    });

    it('should not start again when already running', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      startScheduler(mockClient);
      startScheduler(mockClient); // second call — no-op

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      // Only one initial poll (second startScheduler is a no-op)
      const selectCalls = mockPool.query.mock.calls.filter((c) =>
        c[0].includes('SELECT * FROM scheduled_messages'),
      );
      expect(selectCalls.length).toBe(1);
    });

    it('should handle safeSend error gracefully', async () => {
      const { safeSend: mockSafeSend } = await import('../../src/utils/safeSend.js');
      mockSafeSend.mockRejectedValueOnce(new Error('send failed'));

      const dueMessage = {
        id: 6,
        channel_id: 'ch-789',
        content: 'Will fail',
        one_time: false,
        cron_expression: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [dueMessage] });

      startScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      // Should not throw - error is caught internally
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should handle DB query failure gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB down'));

      startScheduler(mockClient);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      // Should not throw
      expect(getPool).toHaveBeenCalled();
    });
  });
});
