/**
 * Time Duration Constants
 * Centralized time constants to eliminate magic numbers throughout the codebase.
 */

// Base units in milliseconds
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const MS_PER_WEEK = 7 * MS_PER_DAY;
export const MS_PER_YEAR = 365 * MS_PER_DAY;

/**
 * Common duration values for convenience
 */
export const DURATION = {
  SECOND: MS_PER_SECOND,
  MINUTE: MS_PER_MINUTE,
  HOUR: MS_PER_HOUR,
  DAY: MS_PER_DAY,
  WEEK: MS_PER_WEEK,
  YEAR: MS_PER_YEAR,
};

/**
 * Rate limit window presets
 */
export const RATE_LIMIT_WINDOW = {
  SHORT: 15 * MS_PER_MINUTE, // 15 minutes
  MEDIUM: MS_PER_HOUR, // 1 hour
  LONG: MS_PER_DAY, // 24 hours
};
