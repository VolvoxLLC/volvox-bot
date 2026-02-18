import { describe, expect, it } from 'vitest';
import { needsSplitting, splitMessage } from '../../src/utils/splitMessage.js';

describe('splitMessage', () => {
  it('should return empty array for empty/null input', () => {
    expect(splitMessage('')).toEqual([]);
    expect(splitMessage(null)).toEqual([]);
    expect(splitMessage(undefined)).toEqual([]);
  });

  it('should return single-element array for short messages', () => {
    expect(splitMessage('hello')).toEqual(['hello']);
  });

  it('should not split messages at exactly the limit', () => {
    const msg = 'a'.repeat(1990);
    expect(splitMessage(msg)).toEqual([msg]);
  });

  it('should split messages longer than the limit', () => {
    const msg = 'a'.repeat(2000);
    const chunks = splitMessage(msg, 1000);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(1000);
    expect(chunks[1].length).toBe(1000);
  });

  it('should split on word boundaries when possible', () => {
    // Create a message with spaces — split should happen at a space
    const msg = 'hello world foo bar baz qux';
    const chunks = splitMessage(msg, 11);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be <= maxLength
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(11);
    }
  });

  it('should force split when no space found', () => {
    const msg = 'a'.repeat(3000);
    const chunks = splitMessage(msg, 1000);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(1000);
    expect(chunks[1].length).toBe(1000);
    expect(chunks[2].length).toBe(1000);
  });

  it('should handle custom maxLength', () => {
    const msg = 'hello world foo bar';
    const chunks = splitMessage(msg, 11);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(11);
    }
  });

  it('should trim leading whitespace on subsequent chunks', () => {
    const msg = 'aaaa bbbb cccc';
    const chunks = splitMessage(msg, 5);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/^\s/);
    }
  });

  it('should handle messages with only spaces gracefully', () => {
    const msg = ' '.repeat(3000);
    const chunks = splitMessage(msg, 1000);
    // After trim, remaining chunks may be empty; just ensure no crash
    expect(Array.isArray(chunks)).toBe(true);
  });
});

describe('needsSplitting', () => {
  it('should return false for short messages', () => {
    expect(needsSplitting('hello')).toBe(false);
  });

  it('should return false for exactly 2000 chars', () => {
    expect(needsSplitting('a'.repeat(2000))).toBe(false);
  });

  it('should return true for messages over 2000 chars', () => {
    expect(needsSplitting('a'.repeat(2001))).toBe(true);
  });

  it('should return falsy for null/empty', () => {
    expect(needsSplitting('')).toBeFalsy();
    expect(needsSplitting(null)).toBeFalsy();
    expect(needsSplitting(undefined)).toBeFalsy();
  });
});
