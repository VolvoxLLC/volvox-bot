import { describe, expect, it } from 'vitest';
import { formatDuration, parseDuration } from '../../src/utils/duration.js';

describe('parseDuration', () => {
  describe('valid inputs', () => {
    it('parses seconds', () => {
      expect(parseDuration('30s')).toBe(30000);
      expect(parseDuration('1s')).toBe(1000);
    });

    it('parses minutes', () => {
      expect(parseDuration('5m')).toBe(300000);
      expect(parseDuration('1m')).toBe(60000);
    });

    it('parses hours', () => {
      expect(parseDuration('1h')).toBe(3600000);
      expect(parseDuration('24h')).toBe(86400000);
    });

    it('parses days', () => {
      expect(parseDuration('7d')).toBe(604800000);
      expect(parseDuration('1d')).toBe(86400000);
    });

    it('parses weeks', () => {
      expect(parseDuration('2w')).toBe(1209600000);
      expect(parseDuration('1w')).toBe(604800000);
    });
  });

  describe('invalid inputs', () => {
    it('returns null for null', () => {
      expect(parseDuration(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(parseDuration(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseDuration('')).toBeNull();
    });

    it('returns null for non-string types', () => {
      expect(parseDuration(123)).toBeNull();
      expect(parseDuration(true)).toBeNull();
      expect(parseDuration({})).toBeNull();
    });

    it('returns null for string without unit', () => {
      expect(parseDuration('abc')).toBeNull();
      expect(parseDuration('123')).toBeNull();
    });

    it('returns null for zero duration', () => {
      expect(parseDuration('0s')).toBeNull();
      expect(parseDuration('0m')).toBeNull();
    });

    it('returns null for negative duration', () => {
      expect(parseDuration('-1h')).toBeNull();
      expect(parseDuration('-5m')).toBeNull();
    });

    it('returns null for unsupported units', () => {
      expect(parseDuration('5y')).toBeNull();
      expect(parseDuration('3x')).toBeNull();
    });
  });

  describe('case insensitivity', () => {
    it('handles uppercase units', () => {
      expect(parseDuration('1H')).toBe(3600000);
      expect(parseDuration('7D')).toBe(604800000);
      expect(parseDuration('5M')).toBe(300000);
      expect(parseDuration('30S')).toBe(30000);
      expect(parseDuration('2W')).toBe(1209600000);
    });
  });

  describe('whitespace handling', () => {
    it('trims leading and trailing whitespace', () => {
      expect(parseDuration(' 1h ')).toBe(3600000);
      expect(parseDuration('  5m  ')).toBe(300000);
    });

    it('handles whitespace between number and unit', () => {
      expect(parseDuration('1 h')).toBe(3600000);
      expect(parseDuration('5  m')).toBe(300000);
    });
  });
});

describe('formatDuration', () => {
  it('formats weeks', () => {
    expect(formatDuration(604800000)).toBe('1 week');
    expect(formatDuration(1209600000)).toBe('2 weeks');
  });

  it('formats days', () => {
    expect(formatDuration(86400000)).toBe('1 day');
    expect(formatDuration(172800000)).toBe('2 days');
  });

  it('formats hours', () => {
    expect(formatDuration(3600000)).toBe('1 hour');
    expect(formatDuration(7200000)).toBe('2 hours');
  });

  it('formats minutes', () => {
    expect(formatDuration(60000)).toBe('1 minute');
    expect(formatDuration(300000)).toBe('5 minutes');
  });

  it('formats seconds', () => {
    expect(formatDuration(1000)).toBe('1 second');
    expect(formatDuration(30000)).toBe('30 seconds');
  });

  it('returns "0 seconds" for zero', () => {
    expect(formatDuration(0)).toBe('0 seconds');
  });

  it('returns "0 seconds" for negative values', () => {
    expect(formatDuration(-1000)).toBe('0 seconds');
  });

  it('returns "0 seconds" for non-number input', () => {
    expect(formatDuration('abc')).toBe('0 seconds');
    expect(formatDuration(null)).toBe('0 seconds');
  });

  it('uses the largest fitting unit', () => {
    expect(formatDuration(604800000)).toBe('1 week');
    expect(formatDuration(86400000)).toBe('1 day');
  });
});

describe('round-trip', () => {
  it('parseDuration then formatDuration returns readable string', () => {
    expect(formatDuration(parseDuration('1h'))).toBe('1 hour');
    expect(formatDuration(parseDuration('7d'))).toBe('1 week');
    expect(formatDuration(parseDuration('30s'))).toBe('30 seconds');
    expect(formatDuration(parseDuration('5m'))).toBe('5 minutes');
    expect(formatDuration(parseDuration('2w'))).toBe('2 weeks');
  });
});
