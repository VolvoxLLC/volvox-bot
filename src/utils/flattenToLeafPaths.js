/** Keys that must be skipped during object traversal to prevent prototype pollution. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Flattens a nested object into dot-notated leaf path/value pairs, using the provided prefix as the root path.
 * @param {Object} obj - The object to flatten.
 * @param {string} prefix - The starting dot-notated prefix (for example, "section").
 * @returns {Array<[string, any]>} An array of [path, value] pairs where path is the dot-notated key and value is the leaf value. Arrays and primitive values are treated as leaves; dangerous keys ('__proto__', 'constructor', 'prototype') are skipped.
 */
export function flattenToLeafPaths(obj, prefix) {
  const results = [];

  for (const [key, value] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const path = `${prefix}.${key}`;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      results.push(...flattenToLeafPaths(value, path));
    } else {
      results.push([path, value]);
    }
  }

  return results;
}
