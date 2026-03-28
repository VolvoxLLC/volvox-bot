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

  it('should not contain XP-specific fields moved to xpDefaults', () => {
    expect(REPUTATION_DEFAULTS).not.toHaveProperty('announceChannelId');
    expect(REPUTATION_DEFAULTS).not.toHaveProperty('levelThresholds');
    expect(REPUTATION_DEFAULTS).not.toHaveProperty('roleRewards');
  });
});
