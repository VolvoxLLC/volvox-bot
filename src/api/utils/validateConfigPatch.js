import { isMasked, SENSITIVE_FIELDS } from './configAllowlist.js';
import { validateSingleValue } from './configValidation.js';

/**
 * Keys that must never appear as path segments — prototype pollution vectors.
 * Mirrors the same constant in src/modules/config.js (validatePathSegments).
 * Defined here so the API boundary validates independently of inner-layer defenses.
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validate and normalize a config PATCH request body containing a dotted config path and its value.
 *
 * Ensures `body.path` is a non-empty string with at least one dot, contains no empty segments,
 * does not exceed 200 characters, and is no deeper than 10 segments. Ensures `body.value` is present
 * and delegates semantic validation of the value to shared validators. Verifies the top-level key
 * (first path segment) is included in `SAFE_CONFIG_KEYS`. Rejects any path segment that is a
 * prototype pollution vector (`__proto__`, `constructor`, `prototype`).
 *
 * @param {Object} body - Request body expected to contain `path` (string) and `value`.
 * @param {Set<string>} SAFE_CONFIG_KEYS - Allowlist of writable top-level config keys.
 * @returns {{ error: string, status: number, details?: string[] } | { path: string, value: *, topLevelKey: string }}
 *   On error: an object with `error` and `status`, and `details` when value validation produced messages.
 *   On success: an object containing the validated `path`, the provided `value`, and the resolved `topLevelKey`.
 */
export function validateConfigPatchBody(body, SAFE_CONFIG_KEYS) {
  const { path, value } = body || {};

  if (!path || typeof path !== 'string') {
    return { error: 'Missing or invalid "path" in request body', status: 400 };
  }

  if (value === undefined) {
    return { error: 'Missing "value" in request body', status: 400 };
  }

  // Check path format FIRST (before allowlist) for consistent 400 responses
  if (!path.includes('.')) {
    return {
      error: 'Config path must include at least one dot separator (e.g., "ai.model")',
      status: 400,
    };
  }

  const segments = path.split('.');

  // Check for empty segments (handles leading/trailing dots like ".ai.key")
  if (segments.some((s) => s === '')) {
    return { error: 'Config path contains empty segments', status: 400 };
  }

  // Defense-in-depth: reject prototype pollution vectors at the API boundary.
  // The inner layer (setConfigValue → validatePathSegments) also catches these,
  // but the API surface should be the primary gatekeeping point.
  for (const segment of segments) {
    if (DANGEROUS_KEYS.has(segment)) {
      return {
        error: `Invalid config path: '${segment}' is a reserved key`,
        status: 400,
      };
    }
  }

  const topLevelKey = segments[0];

  if (!SAFE_CONFIG_KEYS.has(topLevelKey)) {
    return { error: 'Modifying this config key is not allowed', status: 403 };
  }

  if (path.length > 200) {
    return { error: 'Config path exceeds maximum length of 200 characters', status: 400 };
  }

  if (segments.length > 10) {
    return { error: 'Config path exceeds maximum depth of 10 segments', status: 400 };
  }

  // Reject mask sentinel write-backs — clients must not re-submit the placeholder
  // that GET responses use to hide sensitive values (e.g. '••••••••').
  if (SENSITIVE_FIELDS.has(path) && isMasked(value)) {
    return { error: 'Cannot write mask sentinel back to a sensitive config field', status: 400 };
  }

  const valErrors = validateSingleValue(path, value);
  if (valErrors.length > 0) {
    return { error: 'Value validation failed', status: 400, details: valErrors };
  }

  return { path, value, topLevelKey };
}
