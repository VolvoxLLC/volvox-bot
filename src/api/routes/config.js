/**
 * Config Routes
 * Endpoints for reading and updating global bot configuration
 */

import { Router } from 'express';
import { error, info, warn } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';
import { flattenToLeafPaths } from '../../utils/flattenToLeafPaths.js';
import {
  maskSensitiveFields,
  READABLE_CONFIG_KEYS,
  SAFE_CONFIG_KEYS,
  stripMaskedWrites,
} from '../utils/configAllowlist.js';
import { CONFIG_SCHEMA, validateValue } from '../utils/configValidation.js';
import { DANGEROUS_KEYS } from '../utils/dangerousKeys.js';
import { fireAndForgetWebhook } from '../utils/webhook.js';

// Re-export flattenToLeafPaths for backward compatibility
export { flattenToLeafPaths };

import { requireGlobalAdmin } from '../middleware/requireGlobalAdmin.js';

// Re-export validateSingleValue so existing callers that import it from this
// module continue to work without changes.
export { validateSingleValue } from '../utils/configValidation.js';

const router = Router();

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
    if (!SAFE_CONFIG_KEYS.has(key)) {
      errors.push(
        `"${key}" is not a writable config section. Writable sections: ${[...SAFE_CONFIG_KEYS].join(', ')}`,
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
 * @openapi
 * /config:
 *   get:
 *     tags:
 *       - Config
 *     summary: Get global config
 *     description: Returns the current global bot configuration. Restricted to API-secret callers or bot-owner OAuth users. Sensitive fields are masked.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       "200":
 *         description: Current global config (readable sections, sensitive fields masked)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Config object with section keys (ai, welcome, spam, moderation, etc.)
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 */
router.get('/', requireGlobalAdmin, (req, res) => {
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
 * @openapi
 * /config:
 *   put:
 *     tags:
 *       - Config
 *     summary: Update global config
 *     description: >
 *       Replace writable config sections. Only writable sections (ai, welcome, spam,
 *       moderation, triage) are accepted. Values are merged leaf-by-leaf into the
 *       existing config. Restricted to API-secret callers or bot-owner OAuth users.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Config sections to update
 *             example:
 *               ai:
 *                 model: claude-3
 *     responses:
 *       "200":
 *         description: Updated config (all writes succeeded)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       "207":
 *         description: Partial success — some writes failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       path:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [success, failed]
 *                       error:
 *                         type: string
 *                 config:
 *                   type: object
 *       "400":
 *         description: Invalid request body or validation failure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ValidationError"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
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
  const rawWrites = [];
  for (const [section, sectionValue] of Object.entries(req.body)) {
    if (!SAFE_CONFIG_KEYS.has(section)) continue;
    const paths = flattenToLeafPaths(sectionValue, section);
    for (const [path, value] of paths) {
      rawWrites.push({ path, value });
    }
  }

  // Strip any writes where the value is the mask sentinel — prevents
  // accidentally overwriting real secrets with the placeholder text.
  const allWrites = stripMaskedWrites(rawWrites);

  if (allWrites.length === 0) {
    return res.status(400).json({ error: 'No valid config values to write' });
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

  const updatedSections = Object.keys(req.body).filter((k) => SAFE_CONFIG_KEYS.has(k));

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
  // Report successfully-written sections, not requested ones
  const writtenSections = [...new Set(succeeded.map((s) => s.path.split('.')[0]))];
  fireAndForgetWebhook('CONFIG_CHANGE_WEBHOOK_URL', {
    event: 'config.updated',
    sections: writtenSections,
    timestamp: Date.now(),
  });
  return res.status(207).json({
    error: 'Partial config update — some writes failed',
    results,
    config: maskedConfig,
  });
});

export default router;
