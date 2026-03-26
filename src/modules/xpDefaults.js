/**
 * Default XP / leveling configuration — single source of truth.
 * Imported by levelUpActions.js, reputation.js, rank.js, and API routes.
 */

export const XP_DEFAULTS = {
  enabled: false,
  levelThresholds: [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000],
  levelActions: [],
  defaultActions: [],
  roleRewards: {
    stackRoles: true,
    removeOnLevelDown: false,
  },
};
