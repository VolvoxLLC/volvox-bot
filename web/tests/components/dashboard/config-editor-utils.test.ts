import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a string matching UUID v4 format', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('uses crypto.randomUUID when available', () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '11111111-2222-4333-8444-555555555555'),
    });

    expect(generateId()).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('formats a UUID v4 from crypto.getRandomValues when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.set([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x06, 0x77, 0x08, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
        return bytes;
      }),
    });

    expect(generateId()).toBe('00112233-4455-4677-8899-aabbccddeeff');
  });

  it('throws when secure randomness is unavailable', () => {
    vi.stubGlobal('crypto', {});

    expect(() => generateId()).toThrow('Secure random number generation is unavailable.');
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
