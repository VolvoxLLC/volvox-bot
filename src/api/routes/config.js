/**
 * Config Routes
 * Endpoints for reading and updating global bot configuration
 */

import { Router } from 'express';
import { error, info, warn } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';
import { getBotOwnerIds } from '../../utils/permissions.js';
import {
  maskSensitiveFields,
  READABLE_CONFIG_KEYS,
  SAFE_CONFIG_KEYS,
} from '../utils/configAllowlist.js';
import {
  CONFIG_SCHEMA,
  validateSingleValue,
  validateValue,
} from '../utils/configValidation.js';
import { fireAndForgetWebhook } from '../utils/webhook.js';

const router = Router();

// validateSingleValue is re-exported here so existing callers that import
// it from this module continue to work without changes.
export { validateSingleValue } from '../utils/configValidation.js';


/**
 * Validate a config object against the schema.
 * Checks that only writable sections are included and that value types match.
 *
 * @param {Object} config - Config object to validate
 * @returns {string[]} Array of validation error messages (empty if valid)
 */
export function validateConfigSchema(config) {
  const errors = [];

  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return ['Config must be a JSON object'];
  }

  for (const [key, value] of Object.entries(config)) {
    if (!SAFE_CONFIG_KEYS.includes(key)) {
      errors.push(
        `"${key}" is not a writable config section. Writable sections: ${SAFE_CONFIG_KEYS.join(', ')}`,
      );
      continue;
    }

    const schema = CONFIG_SCHEMA[key];
    if (schema) {
      errors.push(...validateValue(value, schema, key));
    }
  }

  return errors;
}

/**
 * Flatten a nested object into dot-notation [path, value] pairs.
 * Plain objects are recursed into; arrays and primitives are leaf values.
 *
 * @param {Object} obj - Object to flatten
 * @param {string} prefix - Current path prefix
 * @returns {Array<[string, *]>} Array of [dotPath, leafValue] tuples
 */
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

/**
 * Middleware: restrict to API-secret callers or bot-owner OAuth users.
 * Global config changes affect all guilds, so only trusted callers are allowed.
 */
function requireGlobalAdmin(req, res, next) {
  if (req.authMethod === 'api-secret') return next();

  if (req.authMethod === 'oauth') {
    const botOwners = getBotOwnerIds(getConfig());
    if (botOwners.includes(req.user?.userId)) return next();

    return res.status(403).json({ error: 'Global config access requires bot owner permissions' });
  }

  warn('Unknown authMethod in global config check', {
    authMethod: req.authMethod,
    path: req.path,
  });
  return res.status(401).json({ error: 'Unauthorized' });
}

/**
 * GET / — Retrieve current global config (readable sections only)
 */
router.get('/', requireGlobalAdmin, (_req, res) => {
  const config = getConfig();
  const safeConfig = {};

  for (const key of READABLE_CONFIG_KEYS) {
    if (key in config) {
      safeConfig[key] = config[key];
    }
  }

  res.json(maskSensitiveFields(safeConfig));
});

/**
 * PUT / — Update global config with schema validation
 * Body: { "ai": { ... }, "welcome": { ... } }
 * Only writable sections (ai, welcome, spam, moderation, triage) are accepted.
 * Values are merged into existing config via setConfigValue.
 */
router.put('/', requireGlobalAdmin, async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }

  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Request body must not be empty' });
  }

  const validationErrors = validateConfigSchema(req.body);
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: 'Config validation failed', details: validationErrors });
  }

  // Collect all leaf writes first
  const allWrites = [];
  for (const [section, sectionValue] of Object.entries(req.body)) {
    if (!SAFE_CONFIG_KEYS.includes(section)) continue;
    const paths = flattenToLeafPaths(sectionValue, section);
    for (const [path, value] of paths) {
      allWrites.push({ path, value });
    }
  }

  // Apply all writes, tracking successes and failures individually
  const results = [];
  for (const { path, value } of allWrites) {
    try {
      await setConfigValue(path, value);
      results.push({ path, status: 'success' });
    } catch (err) {
      results.push({ path, status: 'failed', error: err.message });
    }
  }

  const succeeded = results.filter((r) => r.status === 'success');
  const failed = results.filter((r) => r.status === 'failed');

  const updated = getConfig();
  const safeConfig = {};
  for (const key of READABLE_CONFIG_KEYS) {
    if (key in updated) {
      safeConfig[key] = updated[key];
    }
  }
  const maskedConfig = maskSensitiveFields(safeConfig);

  const updatedSections = Object.keys(req.body).filter((k) => SAFE_CONFIG_KEYS.includes(k));

  if (failed.length === 0) {
    // All writes succeeded
    info('Global config updated via config API', { sections: updatedSections });
    fireAndForgetWebhook('CONFIG_CHANGE_WEBHOOK_URL', {
      event: 'config.updated',
      sections: updatedSections,
      timestamp: Date.now(),
    });
    return res.json(maskedConfig);
  }

  if (succeeded.length === 0) {
    // All writes failed
    error('Failed to update global config via API — all writes failed', {
      failed: failed.map((f) => f.path),
    });
    return res.status(500).json({
      error: 'Failed to update config — all writes failed',
      results,
    });
  }

  // Partial success
  warn('Global config partially updated via config API', {
    succeeded: succeeded.map((s) => s.path),
    failed: failed.map((f) => f.path),
  });
  fireAndForgetWebhook('CONFIG_CHANGE_WEBHOOK_URL', {
    event: 'config.updated',
    sections: updatedSections,
    timestamp: Date.now(),
  });
  return res.status(207).json({
    error: 'Partial config update — some writes failed',
    results,
    config: maskedConfig,
  });
});

export default router;
