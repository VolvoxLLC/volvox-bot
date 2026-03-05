import { describe, expect, it } from 'vitest';
import {
  parseCommaSeparatedList,
  formatRoleIdsForDisplay,
  parseNewlineSeparatedList,
  parseNumberInput,
  percentToDecimal,
  decimalToPercent,
  normalizeOptionalString,
} from '@/lib/config-normalization';

describe('config-normalization', () => {
  describe('parseCommaSeparatedList', () => {
    it('parses comma-separated values into trimmed array', () => {
      const result = parseCommaSeparatedList('a, b, c');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('handles extra whitespace', () => {
      const result = parseCommaSeparatedList('  a  ,  b  ,  c  ');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('filters empty values', () => {
      const result = parseCommaSeparatedList('a,,b,,c,');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for empty string', () => {
      const result = parseCommaSeparatedList('');
      expect(result).toEqual([]);
    });

    it('handles single value', () => {
      const result = parseCommaSeparatedList('123456789');
      expect(result).toEqual(['123456789']);
    });
  });

  describe('formatRoleIdsForDisplay', () => {
    it('joins role IDs with comma and space', () => {
      const result = formatRoleIdsForDisplay(['123', '456', '789']);
      expect(result).toBe('123, 456, 789');
    });

    it('returns empty string for empty array', () => {
      const result = formatRoleIdsForDisplay([]);
      expect(result).toBe('');
    });

    it('handles single role ID', () => {
      const result = formatRoleIdsForDisplay(['123']);
      expect(result).toBe('123');
    });
  });

  describe('parseNewlineSeparatedList', () => {
    it('parses newline-separated values', () => {
      const result = parseNewlineSeparatedList('line1\nline2\nline3');
      expect(result).toEqual(['line1', 'line2', 'line3']);
    });

    it('trims whitespace from each line', () => {
      const result = parseNewlineSeparatedList('  line1  \n  line2  ');
      expect(result).toEqual(['line1', 'line2']);
    });

    it('filters empty lines', () => {
      const result = parseNewlineSeparatedList('line1\n\nline2\n\n');
      expect(result).toEqual(['line1', 'line2']);
    });

    it('returns empty array for empty string', () => {
      const result = parseNewlineSeparatedList('');
      expect(result).toEqual([]);
    });
  });

  describe('parseNumberInput', () => {
    it('parses valid number string', () => {
      const result = parseNumberInput('42');
      expect(result).toBe(42);
    });

    it('returns undefined for empty string', () => {
      const result = parseNumberInput('');
      expect(result).toBeUndefined();
    });

    it('returns undefined for non-numeric string', () => {
      const result = parseNumberInput('abc');
      expect(result).toBeUndefined();
    });

    it('returns undefined for NaN', () => {
      const result = parseNumberInput('NaN');
      expect(result).toBeUndefined();
    });

    it('clamps to minimum value', () => {
      const result = parseNumberInput('5', 10);
      expect(result).toBe(10);
    });

    it('clamps to maximum value', () => {
      const result = parseNumberInput('100', 0, 50);
      expect(result).toBe(50);
    });

    it('handles decimal numbers', () => {
      const result = parseNumberInput('3.14');
      expect(result).toBe(3.14);
    });

    it('handles negative numbers', () => {
      const result = parseNumberInput('-10');
      expect(result).toBe(-10);
    });

    it('clamps negative to min', () => {
      const result = parseNumberInput('-10', 0);
      expect(result).toBe(0);
    });
  });

  describe('percentToDecimal', () => {
    it('converts 100% to 1.0', () => {
      expect(percentToDecimal(100)).toBe(1);
    });

    it('converts 50% to 0.5', () => {
      expect(percentToDecimal(50)).toBe(0.5);
    });

    it('converts 0% to 0.0', () => {
      expect(percentToDecimal(0)).toBe(0);
    });

    it('clamps values above 100', () => {
      expect(percentToDecimal(150)).toBe(1);
    });

    it('clamps negative values', () => {
      expect(percentToDecimal(-50)).toBe(0);
    });

    it('handles NaN as 0', () => {
      expect(percentToDecimal(NaN)).toBe(0);
    });
  });

  describe('decimalToPercent', () => {
    it('converts 1.0 to 100%', () => {
      expect(decimalToPercent(1)).toBe(100);
    });

    it('converts 0.5 to 50%', () => {
      expect(decimalToPercent(0.5)).toBe(50);
    });

    it('converts 0.0 to 0%', () => {
      expect(decimalToPercent(0)).toBe(0);
    });

    it('rounds to nearest integer', () => {
      expect(decimalToPercent(0.333)).toBe(33);
      expect(decimalToPercent(0.666)).toBe(67);
    });
  });

  describe('normalizeOptionalString', () => {
    it('trims whitespace', () => {
      expect(normalizeOptionalString('  hello  ')).toBe('hello');
    });

    it('returns null for empty string', () => {
      expect(normalizeOptionalString('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(normalizeOptionalString('   ')).toBeNull();
    });

    it('preserves non-empty strings', () => {
      expect(normalizeOptionalString('channel-id-123')).toBe('channel-id-123');
    });
  });
});
