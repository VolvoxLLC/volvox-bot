import { describe, expect, it } from 'vitest';
import { escapeIlike } from '../../src/utils/escapeIlike.js';

describe('escapeIlike', () => {
  describe('no special characters', () => {
    it('returns plain strings unchanged', () => {
      expect(escapeIlike('hello')).toBe('hello');
      expect(escapeIlike('foo bar')).toBe('foo bar');
      expect(escapeIlike('')).toBe('');
    });

    it('leaves alphanumeric and punctuation untouched', () => {
      expect(escapeIlike('abc123')).toBe('abc123');
      expect(escapeIlike('hello.world!')).toBe('hello.world!');
      expect(escapeIlike('user@example.com')).toBe('user@example.com');
    });
  });

  describe('percent sign (%)', () => {
    it('escapes a single percent', () => {
      expect(escapeIlike('%')).toBe('\\%');
    });

    it('escapes percent at the start', () => {
      expect(escapeIlike('%foo')).toBe('\\%foo');
    });

    it('escapes percent at the end', () => {
      expect(escapeIlike('foo%')).toBe('foo\\%');
    });

    it('escapes multiple percents', () => {
      expect(escapeIlike('100%% done')).toBe('100\\%\\% done');
    });
  });

  describe('underscore (_)', () => {
    it('escapes a single underscore', () => {
      expect(escapeIlike('_')).toBe('\\_');
    });

    it('escapes underscore in a word', () => {
      expect(escapeIlike('snake_case')).toBe('snake\\_case');
    });

    it('escapes multiple underscores', () => {
      expect(escapeIlike('__private__')).toBe('\\_\\_private\\_\\_');
    });
  });

  describe('backslash (\\)', () => {
    it('escapes a single backslash', () => {
      expect(escapeIlike('\\')).toBe('\\\\');
    });

    it('escapes backslash in a path', () => {
      expect(escapeIlike('C:\\Users')).toBe('C:\\\\Users');
    });

    it('escapes multiple backslashes', () => {
      expect(escapeIlike('\\\\')).toBe('\\\\\\\\');
    });
  });

  describe('combinations', () => {
    it('escapes all three special characters together', () => {
      expect(escapeIlike('%_\\')).toBe('\\%\\_\\\\');
    });

    it('escapes a realistic search pattern', () => {
      expect(escapeIlike('50% off_sale\\')).toBe('50\\% off\\_sale\\\\');
    });

    it('escapes repeated mixed specials', () => {
      expect(escapeIlike('%%__\\\\')).toBe('\\%\\%\\_\\_\\\\\\\\');
    });

    it('handles adjacent special chars with regular chars', () => {
      expect(escapeIlike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    });
  });
});
