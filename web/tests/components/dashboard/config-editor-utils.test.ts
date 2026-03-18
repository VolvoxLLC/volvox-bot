import { describe, expect, it } from 'vitest';
import { parseNumberInput, inputClasses, generateId, isGuildConfig, DEFAULT_ACTIVITY_BADGES } from '@/components/dashboard/config-editor-utils';

describe('parseNumberInput', () => {
  it('returns undefined for empty string', () => {
    expect(parseNumberInput('')).toBeUndefined();
  });

  it('returns undefined for non-finite input', () => {
    expect(parseNumberInput('abc')).toBeUndefined();
    expect(parseNumberInput('NaN')).toBeUndefined();
    expect(parseNumberInput('Infinity')).toBeUndefined();
  });

  it('parses valid number', () => {
    expect(parseNumberInput('42')).toBe(42);
    expect(parseNumberInput('3.14')).toBe(3.14);
  });

  it('clamps to min', () => {
    expect(parseNumberInput('-5', 0)).toBe(0);
  });

  it('clamps to max', () => {
    expect(parseNumberInput('999', undefined, 100)).toBe(100);
  });

  it('clamps to both min and max', () => {
    expect(parseNumberInput('150', 0, 100)).toBe(100);
    expect(parseNumberInput('-10', 0, 100)).toBe(0);
  });
});

describe('generateId', () => {
  it('returns a string matching UUID v4 format', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('isGuildConfig', () => {
  it('rejects null and arrays', () => {
    expect(isGuildConfig(null)).toBe(false);
    expect(isGuildConfig([])).toBe(false);
  });

  it('rejects object with no known sections', () => {
    expect(isGuildConfig({ unknown: 'value' })).toBe(false);
  });

  it('accepts object with known section as object', () => {
    expect(isGuildConfig({ ai: { enabled: true } })).toBe(true);
    expect(isGuildConfig({ moderation: {} })).toBe(true);
  });

  it('rejects known section that is array or null', () => {
    expect(isGuildConfig({ ai: null })).toBe(false);
    expect(isGuildConfig({ ai: [1, 2] })).toBe(false);
  });
});

describe('inputClasses', () => {
  it('is a non-empty string', () => {
    expect(typeof inputClasses).toBe('string');
    expect(inputClasses.length).toBeGreaterThan(0);
  });
});

describe('DEFAULT_ACTIVITY_BADGES', () => {
  it('has 4 tiers with days and labels', () => {
    expect(DEFAULT_ACTIVITY_BADGES).toHaveLength(4);
    for (const badge of DEFAULT_ACTIVITY_BADGES) {
      expect(typeof badge.days).toBe('number');
      expect(typeof badge.label).toBe('string');
    }
  });
});
