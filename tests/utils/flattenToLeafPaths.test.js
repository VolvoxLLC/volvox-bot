import { describe, expect, it } from 'vitest';
import { flattenToLeafPaths } from '../../src/utils/flattenToLeafPaths.js';

describe('flattenToLeafPaths', () => {
  describe('basic flattening', () => {
    it('should flatten a simple object with primitive values', () => {
      const obj = { a: 1, b: 'test', c: true };
      const result = flattenToLeafPaths(obj, 'root');

      expect(result).toHaveLength(3);
      expect(result).toContainEqual(['root.a', 1]);
      expect(result).toContainEqual(['root.b', 'test']);
      expect(result).toContainEqual(['root.c', true]);
    });

    it('should flatten nested objects with dot notation', () => {
      const obj = { level1: { level2: { level3: 'deep' } } };
      const result = flattenToLeafPaths(obj, 'config');

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(['config.level1.level2.level3', 'deep']);
    });

    it('should handle mixed nesting depths', () => {
      const obj = {
        shallow: 'value',
        nested: { child: 'childValue' },
        deep: { a: { b: { c: 'deepest' } } },
      };
      const result = flattenToLeafPaths(obj, 'obj');

      expect(result).toHaveLength(3);
      expect(result).toContainEqual(['obj.shallow', 'value']);
      expect(result).toContainEqual(['obj.nested.child', 'childValue']);
      expect(result).toContainEqual(['obj.deep.a.b.c', 'deepest']);
    });
  });

  describe('arrays', () => {
    it('should treat arrays as leaf values', () => {
      const obj = { items: [1, 2, 3] };
      const result = flattenToLeafPaths(obj, 'data');

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(['data.items', [1, 2, 3]]);
    });

    it('should not recurse into array elements', () => {
      const obj = { nested: { arr: [{ a: 1 }, { b: 2 }] } };
      const result = flattenToLeafPaths(obj, 'x');

      expect(result).toHaveLength(1);
      expect(result[0][0]).toBe('x.nested.arr');
      expect(Array.isArray(result[0][1])).toBe(true);
    });
  });

  describe('dangerous keys', () => {
    it('should skip __proto__', () => {
      // Use JSON.parse to reliably create enumerable __proto__ property
      const obj = JSON.parse('{"safe": "value", "__proto__": "malicious"}');
      expect(Object.prototype.hasOwnProperty.call(obj, '__proto__')).toBe(true);
      const result = flattenToLeafPaths(obj, 'test');

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(['test.safe', 'value']);
    });

    it('should skip constructor', () => {
      const obj = { data: 'ok', constructor: 'bad' };
      const result = flattenToLeafPaths(obj, 'cfg');

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(['cfg.data', 'ok']);
    });

    it('should skip prototype', () => {
      const obj = { value: 123, prototype: 'ignore' };
      const result = flattenToLeafPaths(obj, 'root');

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(['root.value', 123]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty objects', () => {
      const obj = {};
      const result = flattenToLeafPaths(obj, 'empty');

      expect(result).toHaveLength(0);
    });

    it('should handle null values', () => {
      const obj = { a: null, b: { c: null } };
      const result = flattenToLeafPaths(obj, 'x');

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(['x.a', null]);
      expect(result).toContainEqual(['x.b.c', null]);
    });

    it('should handle empty prefix', () => {
      const obj = { key: 'value' };
      const result = flattenToLeafPaths(obj, '');

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(['.key', 'value']);
    });
  });
});
