import { describe, expect, it } from 'vitest';
import {
  endOfDayIso,
  formatDateInput,
  formatLastUpdatedTime,
  formatNumber,
  formatUsd,
  startOfDayIso,
} from '@/lib/analytics-utils';

describe('analytics utils', () => {
  it('formats local date inputs', () => {
    expect(formatDateInput(new Date(2026, 3, 7))).toBe('2026-04-07');
  });

  it('returns local day ISO bounds for valid date input', () => {
    expect(startOfDayIso('2026-04-07')).toBe(new Date(2026, 3, 7, 0, 0, 0, 0).toISOString());
    expect(endOfDayIso('2026-04-07')).toBe(new Date(2026, 3, 7, 23, 59, 59, 999).toISOString());
  });

  it('falls back to UTC suffixes for invalid date input', () => {
    expect(startOfDayIso('not-a-date')).toBe('not-a-dateT00:00:00.000Z');
    expect(endOfDayIso('not-a-date')).toBe('not-a-dateT23:59:59.999Z');
  });

  it('formats money, numbers, and timestamps', () => {
    expect(formatUsd(2)).toBe('$2.00');
    expect(formatUsd(1)).toBe('$1.00');
    expect(formatUsd(0)).toBe('$0.0000');
    expect(formatUsd(0.1234)).toBe('$0.1234');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatLastUpdatedTime(new Date(2026, 3, 7, 9, 5, 6))).toMatch(/9:05:06/);
  });
});
