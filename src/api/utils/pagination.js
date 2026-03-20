/**
 * Pagination query-parameter parsing helpers.
 * Provides consistent, bounds-checked parsing of `page` and `limit` query
 * parameters across all API list endpoints.
 */

/**
 * Parse a page number from a raw query string value.
 * Returns a positive integer, defaulting to `defaultPage` when the value is
 * absent, non-numeric, or less than 1.
 *
 * @param {string | undefined} raw - Raw value from `req.query.page`.
 * @param {number} [defaultPage=1] - Default page number.
 * @returns {number} Parsed page number (>= 1).
 */
export function parsePage(raw, defaultPage = 1) {
  return Math.max(1, parseInt(raw, 10) || defaultPage);
}

/**
 * Parse a per-page limit from a raw query string value.
 * Returns a positive integer clamped to `[1, maxLimit]`, defaulting to
 * `defaultLimit` when the value is absent or non-numeric.
 *
 * @param {string | undefined} raw - Raw value from `req.query.limit`.
 * @param {number} [defaultLimit=25] - Default number of results per page.
 * @param {number} [maxLimit=100] - Maximum allowed results per page.
 * @returns {number} Parsed limit (1 <= limit <= maxLimit).
 */
export function parseLimit(raw, defaultLimit = 25, maxLimit = 100) {
  return Math.min(maxLimit, Math.max(1, parseInt(raw, 10) || defaultLimit));
}
