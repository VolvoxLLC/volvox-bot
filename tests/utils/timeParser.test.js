/**
 * Tests for src/utils/timeParser.js
 * Comprehensive natural language time parsing tests.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parseTime, parseTimeAndMessage } from '../../src/utils/timeParser.js';

describe('timeParser', () => {
  /** Fixed reference time: 2026-03-01 10:00:00 (Sunday) */
  let now;

  beforeEach(() => {
    now = new Date(2026, 2, 1, 10, 0, 0, 0); // March 1, 2026 10:00 AM (Sunday)
  });

  describe('parseTime', () => {
    describe('shorthand format', () => {
      it('should parse "5m"', () => {
        const result = parseTime('5m', now);
        expect(result).not.toBeNull();
        expect(result.date.getTime()).toBe(now.getTime() + 5 * 60_000);
        expect(result.consumed).toBe('5m');
      });

      it('should parse "2h"', () => {
        const result = parseTime('2h', now);
        expect(result.date.getTime()).toBe(now.getTime() + 2 * 3_600_000);
      });

      it('should parse "1d"', () => {
        const result = parseTime('1d', now);
        expect(result.date.getTime()).toBe(now.getTime() + 86_400_000);
      });

      it('should parse "30s"', () => {
        const result = parseTime('30s', now);
        expect(result.date.getTime()).toBe(now.getTime() + 30_000);
      });

      it('should parse "3w"', () => {
        const result = parseTime('3w', now);
        expect(result.date.getTime()).toBe(now.getTime() + 3 * 604_800_000);
      });

      it('should parse shorthand with space before unit: "5 m"', () => {
        const result = parseTime('5 m', now);
        // May or may not match depending on parser — shorthand is tight
        // The parser uses \s* between number and unit in the regex
        expect(result).not.toBeNull();
      });

      it('should return null for "0m"', () => {
        expect(parseTime('0m', now)).toBeNull();
      });
    });

    describe('"in N unit" format', () => {
      it('should parse "in 5 minutes"', () => {
        const result = parseTime('in 5 minutes', now);
        expect(result).not.toBeNull();
        expect(result.date.getTime()).toBe(now.getTime() + 5 * 60_000);
      });

      it('should parse "in 2 hours"', () => {
        const result = parseTime('in 2 hours', now);
        expect(result.date.getTime()).toBe(now.getTime() + 2 * 3_600_000);
      });

      it('should parse "in 1 day"', () => {
        const result = parseTime('in 1 day', now);
        expect(result.date.getTime()).toBe(now.getTime() + 86_400_000);
      });

      it('should parse "in 3 weeks"', () => {
        const result = parseTime('in 3 weeks', now);
        expect(result.date.getTime()).toBe(now.getTime() + 3 * 604_800_000);
      });

      it('should parse "in 1 minute"', () => {
        const result = parseTime('in 1 minute', now);
        expect(result.date.getTime()).toBe(now.getTime() + 60_000);
      });

      it('should parse "in 1 hour"', () => {
        const result = parseTime('in 1 hour', now);
        expect(result.date.getTime()).toBe(now.getTime() + 3_600_000);
      });

      it('should return null for unknown unit "in 5 fortnights"', () => {
        expect(parseTime('in 5 fortnights', now)).toBeNull();
      });

      it('should return null for "in 0 minutes"', () => {
        expect(parseTime('in 0 minutes', now)).toBeNull();
      });
    });

    describe('"tomorrow" format', () => {
      it('should parse "tomorrow" with default 9am', () => {
        const result = parseTime('tomorrow', now);
        expect(result).not.toBeNull();
        const expected = new Date(2026, 2, 2, 9, 0, 0, 0);
        expect(result.date.getTime()).toBe(expected.getTime());
      });

      it('should parse "tomorrow at 3pm"', () => {
        const result = parseTime('tomorrow at 3pm', now);
        expect(result).not.toBeNull();
        const expected = new Date(2026, 2, 2, 15, 0, 0, 0);
        expect(result.date.getTime()).toBe(expected.getTime());
      });

      it('should parse "tomorrow at 9:30am"', () => {
        const result = parseTime('tomorrow at 9:30am', now);
        expect(result).not.toBeNull();
        const expected = new Date(2026, 2, 2, 9, 30, 0, 0);
        expect(result.date.getTime()).toBe(expected.getTime());
      });

      it('should parse "tomorrow at 15:00"', () => {
        const result = parseTime('tomorrow at 15:00', now);
        expect(result).not.toBeNull();
        const expected = new Date(2026, 2, 2, 15, 0, 0, 0);
        expect(result.date.getTime()).toBe(expected.getTime());
      });

      it('should parse "tomorrow at 12pm" as noon', () => {
        const result = parseTime('tomorrow at 12pm', now);
        expect(result).not.toBeNull();
        const expected = new Date(2026, 2, 2, 12, 0, 0, 0);
        expect(result.date.getTime()).toBe(expected.getTime());
      });

      it('should parse "tomorrow at 12am" as midnight', () => {
        const result = parseTime('tomorrow at 12am', now);
        expect(result).not.toBeNull();
        const expected = new Date(2026, 2, 2, 0, 0, 0, 0);
        expect(result.date.getTime()).toBe(expected.getTime());
      });
    });

    describe('"next <day>" format', () => {
      it('should parse "next monday" (now is Sunday)', () => {
        const result = parseTime('next monday', now);
        expect(result).not.toBeNull();
        expect(result.date.getDay()).toBe(1); // Monday
        expect(result.date.getHours()).toBe(9); // Default 9am
        // Should be tomorrow (March 2)
        expect(result.date.getDate()).toBe(2);
      });

      it('should parse "next friday at 9am"', () => {
        const result = parseTime('next friday at 9am', now);
        expect(result).not.toBeNull();
        expect(result.date.getDay()).toBe(5); // Friday
        expect(result.date.getHours()).toBe(9);
        expect(result.date.getMinutes()).toBe(0);
      });

      it('should parse "next sunday" (wraps to next week)', () => {
        const result = parseTime('next sunday', now);
        expect(result).not.toBeNull();
        expect(result.date.getDay()).toBe(0); // Sunday
        // Should be 7 days ahead (March 8)
        expect(result.date.getDate()).toBe(8);
      });

      it('should parse "next wed at 2:30pm"', () => {
        const result = parseTime('next wed at 2:30pm', now);
        expect(result).not.toBeNull();
        expect(result.date.getDay()).toBe(3); // Wednesday
        expect(result.date.getHours()).toBe(14);
        expect(result.date.getMinutes()).toBe(30);
      });

      it('should parse "next sat"', () => {
        const result = parseTime('next sat', now);
        expect(result).not.toBeNull();
        expect(result.date.getDay()).toBe(6); // Saturday
      });

      it('should return null for "next invalid"', () => {
        expect(parseTime('next invalid', now)).toBeNull();
      });
    });

    describe('edge cases', () => {
      it('should return null for empty string', () => {
        expect(parseTime('', now)).toBeNull();
      });

      it('should return null for null', () => {
        expect(parseTime(null, now)).toBeNull();
      });

      it('should return null for undefined', () => {
        expect(parseTime(undefined, now)).toBeNull();
      });

      it('should return null for random text', () => {
        expect(parseTime('hello world', now)).toBeNull();
      });

      it('should return null for non-string', () => {
        expect(parseTime(42, now)).toBeNull();
      });

      it('should handle leading/trailing whitespace', () => {
        const result = parseTime('  5m  ', now);
        expect(result).not.toBeNull();
      });

      it('should be case-insensitive', () => {
        const result = parseTime('IN 5 MINUTES', now);
        expect(result).not.toBeNull();
      });

      it('should work without providing now (uses current time)', () => {
        const before = Date.now();
        const result = parseTime('5m');
        const after = Date.now();
        expect(result).not.toBeNull();
        expect(result.date.getTime()).toBeGreaterThanOrEqual(before + 5 * 60_000);
        expect(result.date.getTime()).toBeLessThanOrEqual(after + 5 * 60_000);
      });
    });
  });

  describe('parseTimeAndMessage', () => {
    it('should split "5m check the build" into time and message', () => {
      const result = parseTimeAndMessage('5m check the build', now);
      expect(result).not.toBeNull();
      expect(result.date.getTime()).toBe(now.getTime() + 5 * 60_000);
      expect(result.message).toBe('check the build');
    });

    it('should split "in 2 hours review PR" into time and message', () => {
      const result = parseTimeAndMessage('in 2 hours review PR', now);
      expect(result).not.toBeNull();
      expect(result.date.getTime()).toBe(now.getTime() + 2 * 3_600_000);
      expect(result.message).toBe('review PR');
    });

    it('should handle time-only input with empty message', () => {
      const result = parseTimeAndMessage('tomorrow', now);
      expect(result).not.toBeNull();
      expect(result.message).toBe('');
    });

    it('should split "tomorrow at 3pm deploy" into time and message', () => {
      const result = parseTimeAndMessage('tomorrow at 3pm deploy', now);
      expect(result).not.toBeNull();
      expect(result.date.getHours()).toBe(15);
      expect(result.message).toBe('deploy');
    });

    it('should return null for unparseable input', () => {
      expect(parseTimeAndMessage('gibberish stuff', now)).toBeNull();
    });

    it('should return null for empty/null input', () => {
      expect(parseTimeAndMessage('', now)).toBeNull();
      expect(parseTimeAndMessage(null, now)).toBeNull();
    });
  });
});
