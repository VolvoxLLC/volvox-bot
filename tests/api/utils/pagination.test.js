import { describe, expect, it } from 'vitest';
import { parseLimit, parsePage } from '../../../src/api/utils/pagination.js';

describe('pagination utils', () => {
  describe('parsePage', () => {
    it('returns 1 for an undefined value', () => {
      expect(parsePage(undefined)).toBe(1);
    });

    it('returns 1 for an empty string', () => {
      expect(parsePage('')).toBe(1);
    });

    it('returns 1 for a non-numeric string', () => {
      expect(parsePage('abc')).toBe(1);
    });

    it('parses a valid page number', () => {
      expect(parsePage('3')).toBe(3);
    });

    it('clamps values below 1 up to 1', () => {
      expect(parsePage('0')).toBe(1);
      expect(parsePage('-5')).toBe(1);
    });

    it('uses the provided default when value is absent', () => {
      expect(parsePage(undefined, 2)).toBe(2);
    });
  });

  describe('parseLimit', () => {
    it('returns 25 for an undefined value', () => {
      expect(parseLimit(undefined)).toBe(25);
    });

    it('returns 25 for an empty string', () => {
      expect(parseLimit('')).toBe(25);
    });

    it('returns 25 for a non-numeric string', () => {
      expect(parseLimit('abc')).toBe(25);
    });

    it('parses a valid limit', () => {
      expect(parseLimit('50')).toBe(50);
    });

    it('clamps values below 1 up to 1', () => {
      expect(parseLimit('-10')).toBe(1);
    });

    it('clamps values above maxLimit down to maxLimit', () => {
      expect(parseLimit('200')).toBe(100);
      expect(parseLimit('9999')).toBe(100);
    });

    it('respects a custom defaultLimit', () => {
      expect(parseLimit(undefined, 50)).toBe(50);
    });

    it('respects a custom maxLimit', () => {
      expect(parseLimit('5000', 1000, 10000)).toBe(5000);
      expect(parseLimit('99999', 1000, 10000)).toBe(10000);
    });

    it('uses defaultLimit when raw is absent and a custom default is given', () => {
      expect(parseLimit('', 10)).toBe(10);
    });
  });
});
