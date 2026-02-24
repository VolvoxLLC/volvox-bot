/**
 * Shared config key allowlists.
 * Used by config, guilds, and webhooks routes to restrict which sections
 * can be read or written via the API.
 */

export const SAFE_CONFIG_KEYS = ['ai', 'welcome', 'spam', 'moderation', 'triage'];

export const READABLE_CONFIG_KEYS = [...SAFE_CONFIG_KEYS, 'logging', 'memory', 'permissions'];

/**
 * Dot-notation paths to config values that contain secrets (e.g. API keys).
 * These are masked in GET responses but still writable via PATCH/PUT.
 */
export const SENSITIVE_FIELDS = new Set(['triage.classifyApiKey', 'triage.respondApiKey']);

const MASK = '••••••••';

/**
 * Return a deep clone of `config` with sensitive field values replaced by a mask.
 *
 * @param {Object} config - Config object (top-level sections as keys)
 * @returns {Object} Cloned config with sensitive values masked
 */
export function maskSensitiveFields(config) {
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
