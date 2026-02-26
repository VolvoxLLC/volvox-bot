/**
 * Duration Parser Utility
 *
 * Provides functions to parse human-readable duration strings
 * into milliseconds and format milliseconds back into readable strings.
 */

const UNITS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

const DURATION_RE = /^\s*(\d+)\s*([smhdw])\s*$/i;

/** Maximum allowed duration: 1 year in milliseconds. */
const MAX_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Parse a duration string into milliseconds.
 * Returns null if the parsed duration exceeds 1 year.
 * @param {string} str - Duration string (e.g. "30s", "5m", "1h", "7d", "2w")
 * @returns {number|null} Duration in milliseconds, or null if invalid or exceeds max
 */
export function parseDuration(str) {
  if (typeof str !== 'string') return null;

  const match = str.match(DURATION_RE);
  if (!match) return null;

  const value = Number(match[1]);
  if (value <= 0 || !Number.isSafeInteger(value)) return null;

  const unit = match[2].toLowerCase();
  const ms = value * UNITS[unit];
  if (!Number.isFinite(ms)) return null;
  if (ms > MAX_DURATION_MS) return null;
  return ms;
}

const UNIT_LIST = [
  { ms: UNITS.w, singular: 'week', plural: 'weeks' },
  { ms: UNITS.d, singular: 'day', plural: 'days' },
  { ms: UNITS.h, singular: 'hour', plural: 'hours' },
  { ms: UNITS.m, singular: 'minute', plural: 'minutes' },
  { ms: UNITS.s, singular: 'second', plural: 'seconds' },
];

/**
 * Format milliseconds into a human-readable duration string.
 * Contract:
 * - Accepts a number of milliseconds.
 * - Only returns exact single-unit values from UNIT_LIST (weeks/days/hours/minutes/seconds).
 * - For exact matches, returns singular/plural form (e.g. "1 hour", "2 days").
 * - For non-exact or invalid inputs, returns "0 seconds".
 *
 * This pairs cleanly with parseDuration(): values produced by parseDuration() round-trip
 * through formatDuration() as long as they remain unchanged.
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Human-readable string (e.g. "1 hour", "2 days")
 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '0 seconds';

  const parts = [];
  let remaining = ms;

  for (const unit of UNIT_LIST) {
    if (remaining >= unit.ms) {
      const count = Math.floor(remaining / unit.ms);
      remaining -= count * unit.ms;
      parts.push(`${count} ${count === 1 ? unit.singular : unit.plural}`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : '0 seconds';
}
