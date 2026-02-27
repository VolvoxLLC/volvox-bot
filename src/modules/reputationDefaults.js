/**
 * Default reputation configuration — single source of truth.
 * Imported by reputation.js, rank.js, and leaderboard.js.
 */

export const REPUTATION_DEFAULTS = {
  enabled: false,
  xpPerMessage: [5, 15],
  xpCooldownSeconds: 60,
  announceChannelId: null,
  levelThresholds: [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000],
  roleRewards: {},
};
