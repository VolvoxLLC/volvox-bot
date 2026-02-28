/**
 * Escape special ILIKE wildcard characters in a search string.
 *
 * PostgreSQL ILIKE treats `%`, `_`, and `\` as special characters.
 * This utility escapes them so they are matched literally.
 *
 * @param {string} str - Raw search input from the user
 * @returns {string} Escaped string safe for use inside an ILIKE pattern
 */
export function escapeIlike(str) {
  return str.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
