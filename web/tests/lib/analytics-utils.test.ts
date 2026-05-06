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
  it('formats local dates for date inputs', () => {
    expect(formatDateInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('converts valid date inputs to local day ISO boundaries', () => {
    expect(startOfDayIso('2026-01-05')).toBe(new Date(2026, 0, 5, 0, 0, 0, 0).toISOString());
    expect(endOfDayIso('2026-01-05')).toBe(new Date(2026, 0, 5, 23, 59, 59, 999).toISOString());
  });

  it('handles invalid and rollover date inputs explicitly', () => {
    expect(startOfDayIso('not-a-date')).toBe('not-a-dateT00:00:00.000Z');
    expect(endOfDayIso('2026-13-99')).toBe(new Date(2026, 12, 99, 23, 59, 59, 999).toISOString());
  });

  it('formats currency with extra precision for sub-dollar values', () => {
    expect(formatUsd(12)).toBe('$12.00');
    expect(formatUsd(2)).toBe('$2.00');
    expect(formatUsd(1)).toBe('$1.00');
    expect(formatUsd(0)).toBe('$0.0000');
    expect(formatUsd(0.1234)).toBe('$0.1234');
  });

  it('formats numbers and update times for dashboard display', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatLastUpdatedTime(new Date(2026, 0, 5, 13, 2, 3))).toMatch(/1:02:03\sPM/);
  });
});
