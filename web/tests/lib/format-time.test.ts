import { describe, expect, it } from 'vitest';
import { formatDate, formatUptime } from '@/lib/format-time';

describe('format-time', () => {
  describe('formatDate', () => {
    it('should format a valid ISO string into a localized date+time', () => {
      const result = formatDate('2024-01-15T10:30:00.000Z');
      // Intl output varies by locale, but should contain a date and time
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle different ISO formats', () => {
      const result = formatDate('2023-12-31T23:59:59.999Z');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('formatUptime', () => {
    it('should format seconds under 60 as Xs', () => {
      expect(formatUptime(30)).toBe('30s');
      expect(formatUptime(0)).toBe('0s');
      expect(formatUptime(59)).toBe('59s');
    });

    it('should format minutes', () => {
      expect(formatUptime(120)).toBe('2m');
      expect(formatUptime(90)).toBe('1m');
    });

    it('should format hours and minutes', () => {
      expect(formatUptime(3661)).toBe('1h 1m');
    });

    it('should format days, hours, and minutes', () => {
      expect(formatUptime(90061)).toBe('1d 1h 1m');
    });

    it('should omit zero hours and minutes when exactly on day boundary', () => {
      expect(formatUptime(86400)).toBe('1d');
    });
  });
});
