import { describe, expect, it } from 'vitest';
import {
  endOfDayIso,
  formatDateInput,
  formatLastUpdatedTime,
  formatNumber,
  formatUsd,
  startOfDayIso,
} from '@/lib/analytics-utils';

describe('analytics-utils', () => {
  it('formats local date inputs for form controls', () => {
    expect(formatDateInput(new Date(2026, 3, 5, 14, 30))).toBe('2026-04-05');
  });

  it('builds local start and end of day ISO bounds', () => {
    expect(startOfDayIso('2026-04-05')).toBe(new Date(2026, 3, 5, 0, 0, 0, 0).toISOString());
    expect(endOfDayIso('2026-04-05')).toBe(new Date(2026, 3, 5, 23, 59, 59, 999).toISOString());
  });

  it('falls back predictably for malformed date input', () => {
    expect(startOfDayIso('not-a-date')).toBe('not-a-dateT00:00:00.000Z');
    expect(endOfDayIso('not-a-date')).toBe('not-a-dateT23:59:59.999Z');
  });

  it('formats dashboard numeric labels', () => {
    expect(formatUsd(12)).toBe('$12.00');
    expect(formatUsd(0.1234)).toBe('$0.1234');
    expect(formatNumber(123_456)).toBe('123,456');
    expect(formatLastUpdatedTime(new Date(2026, 3, 5, 9, 8, 7))).toMatch(/9:08:07\s?(AM|a\.m\.)/i);
  });
});
