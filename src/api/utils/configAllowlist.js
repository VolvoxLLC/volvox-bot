/**
 * Shared config key allowlists.
 * Used by config, guilds, and webhooks routes to restrict which sections
 * can be read or written via the API.
 */

export const SAFE_CONFIG_KEYS = new Set([
  'ai',
  'welcome',
  'spam',
  'moderation',
  'triage',
  'starboard',
  'permissions',
  'memory',
  'help',
  'announce',
  'snippet',
  'poll',
  'showcase',
  'tldr',
  'afk',
  'reputation',
  'engagement',
  'github',
  'challenges',
  'review',
]);

export const READABLE_CONFIG_KEYS = [...SAFE_CONFIG_KEYS, 'logging'];

/**
 * Dot-notation paths to config values that contain secrets (e.g. API keys).
 * These are masked in GET responses but still writable via PATCH/PUT.
 */
export const SENSITIVE_FIELDS = new Set(['triage.classifyApiKey', 'triage.respondApiKey']);

/**
 * Mask sentinel used to hide sensitive field values in GET responses.
 * Exported for test assertions.
 */
export const MASK = '••••••••';

/**
 * Check whether a value is the mask sentinel used to hide sensitive fields.
 *
 * @param {*} value - The value to check.
 * @returns {boolean} `true` when `value` is the mask placeholder.
 */
export function isMasked(value) {
  return value === MASK;
}

/**
 * Remove entries from a flat list of [dotPath, value] writes where the value
 * matches the mask sentinel for a sensitive field.  This prevents clients from
 * accidentally (or maliciously) overwriting a real secret with the placeholder
 * text returned by `maskSensitiveFields`.
 *
 * @param {Array<{path: string, value: *}>} writes - Leaf writes to filter.
 * @returns {Array<{path: string, value: *}>} Writes with masked-sentinel entries removed.
 */
export function stripMaskedWrites(writes) {
  return writes.filter(({ path, value }) => {
    if (SENSITIVE_FIELDS.has(path) && isMasked(value)) {
      return false;
    }
    return true;
  });
}

/**
 * Produce a deep-cloned config object with sensitive fields replaced by a mask.
 *
 * Sensitive fields listed in SENSITIVE_FIELDS are replaced with the MASK value when present and non-empty.
 *
 * @param {Object} config - Configuration object whose top-level keys are config sections.
 * @returns {Object} A deep clone of `config` with sensitive values replaced by `MASK`.
 */
export function maskSensitiveFields(config) {
  if (config == null) {
    return {};
  }
  const cloned = structuredClone(config);

  for (const field of SENSITIVE_FIELDS) {
    const segments = field.split('.');
    let obj = cloned;
    for (let i = 0; i < segments.length - 1; i++) {
      obj = obj?.[segments[i]];
      if (!obj || typeof obj !== 'object') break;
    }
    if (obj && typeof obj === 'object') {
      const leaf = segments[segments.length - 1];
      if (leaf in obj && obj[leaf] != null && obj[leaf] !== '') {
        obj[leaf] = MASK;
      }
    }
  }

  return cloned;
}
