import { describe, expect, it } from 'vitest';
import { getNextCronRun, parseCron } from '../../src/utils/cronParser.js';

describe('parseCron', () => {
  describe('wildcards', () => {
    it('should expand * to full range for minute (0-59)', () => {
      const result = parseCron('* * * * *');
      expect(result.minute).toHaveLength(60);
      expect(result.minute[0]).toBe(0);
      expect(result.minute[59]).toBe(59);
    });

    it('should expand * to full range for hour (0-23)', () => {
      const result = parseCron('* * * * *');
      expect(result.hour).toHaveLength(24);
      expect(result.hour[0]).toBe(0);
      expect(result.hour[23]).toBe(23);
    });
  });

  describe('single values', () => {
    it('should parse single values for all fields', () => {
      const result = parseCron('30 14 15 6 3');
      expect(result.minute).toEqual([30]);
      expect(result.hour).toEqual([14]);
      expect(result.day).toEqual([15]);
      expect(result.month).toEqual([6]);
      expect(result.weekday).toEqual([3]);
    });
  });

  describe('lists', () => {
    it('should parse comma-separated values', () => {
      const result = parseCron('0,15,30,45 * * * *');
      expect(result.minute).toEqual([0, 15, 30, 45]);
    });
  });

  describe('ranges', () => {
    it('should parse range expressions', () => {
      const result = parseCron('0-5 * * * *');
      expect(result.minute).toEqual([0, 1, 2, 3, 4, 5]);
    });
  });

  describe('steps', () => {
    it('should parse step expressions with wildcard base', () => {
      const result = parseCron('*/15 * * * *');
      expect(result.minute).toEqual([0, 15, 30, 45]);
    });

    it('should parse step expressions with numeric base', () => {
      const result = parseCron('10/5 * * * *');
      expect(result.minute).toEqual([10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    });
  });

  describe('validation', () => {
    it('should reject expressions with wrong number of fields', () => {
      expect(() => parseCron('* * * *')).toThrow('expected 5 fields');
      expect(() => parseCron('* * * * * *')).toThrow('expected 5 fields');
    });

    it('should reject out-of-range values', () => {
      expect(() => parseCron('60 * * * *')).toThrow('Invalid cron value');
      expect(() => parseCron('24 * * * *')).toThrow('Invalid cron value');
      expect(() => parseCron('* 25 * * *')).toThrow('Invalid cron value');
    });

    it('should reject invalid range (start > end)', () => {
      expect(() => parseCron('30-20 * * * *')).toThrow('Invalid cron range');
    });

    it('should reject invalid step values', () => {
      expect(() => parseCron('*/0 * * * *')).toThrow('Invalid cron step');
    });
  });
});

describe('getNextCronRun', () => {
  it('should find next occurrence of daily cron', () => {
    const cron = '0 12 * * *'; // Every day at noon
    const from = new Date('2024-06-15T10:00:00Z');
    const next = getNextCronRun(cron, from);

    expect(next.getHours()).toBe(12);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(15);
  });

  it('should advance to next day if time has passed', () => {
    const cron = '0 12 * * *'; // Every day at noon
    const from = new Date('2024-06-15T14:00:00Z');
    const next = getNextCronRun(cron, from);

    expect(next.getDate()).toBe(16);
    expect(next.getHours()).toBe(12);
  });

  it('should handle hourly cron', () => {
    const cron = '30 * * * *'; // Every hour at minute 30
    const from = new Date('2024-06-15T10:00:00Z');
    const next = getNextCronRun(cron, from);

    expect(next.getMinutes()).toBe(30);
    expect(next.getHours()).toBe(10);
  });

  it('should throw if no match within 2 years', () => {
    // Impossible cron: Feb 30th
    const cron = '0 0 30 2 *';
    const from = new Date('2024-01-01T00:00:00Z');

    expect(() => getNextCronRun(cron, from)).toThrow('No matching cron time found');
  });
});
