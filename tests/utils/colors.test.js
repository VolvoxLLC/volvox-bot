import { describe, expect, it } from 'vitest';
import { BLURPLE, GREEN, RED, YELLOW } from '../../src/utils/colors.js';

describe('colors', () => {
  it('exports BLURPLE as Discord brand color', () => {
    expect(BLURPLE).toBe(0x5865f2);
  });

  it('exports YELLOW as caution/warning color', () => {
    expect(YELLOW).toBe(0xfee75c);
  });

  it('exports RED as danger/negative color', () => {
    expect(RED).toBe(0xed4245);
  });

  it('exports GREEN as success/positive color', () => {
    expect(GREEN).toBe(0x57f287);
  });

  it('all exports are valid 24-bit integers', () => {
    for (const color of [BLURPLE, YELLOW, RED, GREEN]) {
      expect(Number.isInteger(color)).toBe(true);
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThanOrEqual(0xffffff);
    }
  });
});
