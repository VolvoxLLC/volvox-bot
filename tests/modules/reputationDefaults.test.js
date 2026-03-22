import { describe, expect, it } from 'vitest';
import { REPUTATION_DEFAULTS } from '../../src/modules/reputationDefaults.js';

describe('reputationDefaults', () => {
  it('should export REPUTATION_DEFAULTS object', () => {
    expect(REPUTATION_DEFAULTS).toBeDefined();
    expect(typeof REPUTATION_DEFAULTS).toBe('object');
  });

  it('should have enabled set to false by default', () => {
    expect(REPUTATION_DEFAULTS.enabled).toBe(false);
  });

  it('should have xpPerMessage as a two-element array [min, max]', () => {
    expect(Array.isArray(REPUTATION_DEFAULTS.xpPerMessage)).toBe(true);
    expect(REPUTATION_DEFAULTS.xpPerMessage).toHaveLength(2);
    expect(REPUTATION_DEFAULTS.xpPerMessage[0]).toBeLessThan(REPUTATION_DEFAULTS.xpPerMessage[1]);
  });

  it('should have a positive xpCooldownSeconds', () => {
    expect(REPUTATION_DEFAULTS.xpCooldownSeconds).toBeGreaterThan(0);
  });

  it('should have null announceChannelId', () => {
    expect(REPUTATION_DEFAULTS.announceChannelId).toBeNull();
  });

  it('should have levelThresholds as a sorted ascending array', () => {
    const thresholds = REPUTATION_DEFAULTS.levelThresholds;
    expect(Array.isArray(thresholds)).toBe(true);
    expect(thresholds.length).toBeGreaterThan(0);
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).toBeGreaterThan(thresholds[i - 1]);
    }
  });

  it('should have roleRewards as an empty object', () => {
    expect(REPUTATION_DEFAULTS.roleRewards).toEqual({});
  });
});
