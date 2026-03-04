import { describe, expect, it } from 'vitest';
import { DANGEROUS_KEYS } from '../../src/api/utils/dangerousKeys.js';

describe('dangerousKeys', () => {
  it('should contain __proto__', () => {
    expect(DANGEROUS_KEYS.has('__proto__')).toBe(true);
  });

  it('should contain constructor', () => {
    expect(DANGEROUS_KEYS.has('constructor')).toBe(true);
  });

  it('should contain prototype', () => {
    expect(DANGEROUS_KEYS.has('prototype')).toBe(true);
  });

  it('should not contain safe keys', () => {
    expect(DANGEROUS_KEYS.has('safeKey')).toBe(false);
    expect(DANGEROUS_KEYS.has('name')).toBe(false);
    expect(DANGEROUS_KEYS.has('id')).toBe(false);
  });

  it('should be a Set', () => {
    expect(DANGEROUS_KEYS).toBeInstanceOf(Set);
    expect(DANGEROUS_KEYS.size).toBe(3);
  });
});
