import { describe, expect, it } from 'vitest';
import { needsSplitting, splitMessage } from '../../src/utils/splitMessage.js';

describe('needsSplitting', () => {
  it('should return false for short messages', () => {
    expect(needsSplitting('Hello world')).toBe(false);
    expect(needsSplitting('A'.repeat(2000))).toBe(false);
  });

  it('should return true for messages over 2000 characters', () => {
    expect(needsSplitting('A'.repeat(2001))).toBe(true);
    expect(needsSplitting('A'.repeat(3000))).toBe(true);
  });

  it('should return false for empty or null messages', () => {
    expect(needsSplitting('')).toBe(false);
    expect(needsSplitting(null)).toBe(false);
    expect(needsSplitting(undefined)).toBe(false);
  });
});

describe('splitMessage', () => {
  it('should return single chunk for short messages', () => {
    const text = 'Hello world';
    const chunks = splitMessage(text);
    expect(chunks).toEqual([text]);
  });

  it('should return empty array for empty input', () => {
    expect(splitMessage('')).toEqual([]);
    expect(splitMessage(null)).toEqual([]);
    expect(splitMessage(undefined)).toEqual([]);
  });

  it('should split long messages into multiple chunks', () => {
    const text = 'A'.repeat(3000);
    const chunks = splitMessage(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1990);
    }
  });

  it('should split on word boundaries when possible', () => {
    const text = 'word '.repeat(500); // 2500 characters
    const chunks = splitMessage(text);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should end with a complete word (or be the last chunk)
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].trim()).not.toMatch(/ $/);
    }
  });

  it('should handle text with no spaces', () => {
    const text = 'A'.repeat(3000);
    const chunks = splitMessage(text);
    expect(chunks.length).toBeGreaterThan(1);
    const totalLength = chunks.join('').length;
    expect(totalLength).toBe(3000);
  });

  it('should respect custom maxLength parameter', () => {
    const text = 'A'.repeat(500);
    const chunks = splitMessage(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('should preserve content integrity', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
    const chunks = splitMessage(text);
    const rejoined = chunks.join('');
    // Account for trimmed spaces
    expect(rejoined.replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
  });

  it('should handle multiline text', () => {
    const text = 'Line one\nLine two\nLine three\n'.repeat(200);
    const chunks = splitMessage(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1990);
    }
  });

  it('should handle text at exactly the limit', () => {
    const text = 'A'.repeat(1990);
    const chunks = splitMessage(text);
    expect(chunks).toEqual([text]);
  });

  it('should split text just over the limit', () => {
    const text = 'A'.repeat(1991);
    const chunks = splitMessage(text);
    expect(chunks.length).toBe(2);
  });

  it('should trim leading spaces after split', () => {
    const text = 'word '.repeat(500);
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/^ /);
    }
  });
});