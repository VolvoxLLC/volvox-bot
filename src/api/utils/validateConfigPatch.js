import { validateSingleValue } from '../routes/config.js';

/**
 * Validate a config PATCH request body (path + value).
 * Shared between the PATCH /:id/config route and the POST /config-update webhook route.
 *
 * @param {Object} body - Request body
 * @param {string[]} SAFE_CONFIG_KEYS - Allowlist of writable top-level config keys
 * @returns {{ error: string, status: number, details?: string[] } | { path: string, value: *, topLevelKey: string }}
 */
export function validateConfigPatchBody(body, SAFE_CONFIG_KEYS) {
  const { path, value } = body || {};

  if (!path || typeof path !== 'string') {
    return { error: 'Missing or invalid "path" in request body', status: 400 };
  }

  if (value === undefined) {
    return { error: 'Missing "value" in request body', status: 400 };
  }

  const topLevelKey = path.split('.')[0];
  if (!SAFE_CONFIG_KEYS.includes(topLevelKey)) {
    return { error: 'Modifying this config key is not allowed', status: 403 };
  }

  if (!path.includes('.')) {
    return {
      error: 'Config path must include at least one dot separator (e.g., "ai.model")',
      status: 400,
    };
  }

  const segments = path.split('.');
  if (segments.some((s) => s === '')) {
    return { error: 'Config path contains empty segments', status: 400 };
  }

  if (path.length > 200) {
    return { error: 'Config path exceeds maximum length of 200 characters', status: 400 };
  }

  if (segments.length > 10) {
    return { error: 'Config path exceeds maximum depth of 10 segments', status: 400 };
  }

  const valErrors = validateSingleValue(path, value);
  if (valErrors.length > 0) {
    return { error: 'Value validation failed', status: 400, details: valErrors };
  }

  return { path, value, topLevelKey };
}
