/**
 * Config Routes
 * Endpoints for reading and updating global bot configuration
 */

import { Router } from 'express';
import { error, info, warn } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';
import { getBotOwnerIds } from '../../utils/permissions.js';
import { READABLE_CONFIG_KEYS, SAFE_CONFIG_KEYS } from '../utils/configAllowlist.js';
import { fireAndForgetWebhook } from '../utils/webhook.js';

const router = Router();

/**
 * Schema definitions for writable config sections.
 * Used to validate types before persisting changes.
 */
const CONFIG_SCHEMA = {
  ai: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      systemPrompt: { type: 'string' },
      channels: { type: 'array' },
      historyLength: { type: 'number' },
      historyTTLDays: { type: 'number' },
      threadMode: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          autoArchiveMinutes: { type: 'number' },
          reuseWindowMinutes: { type: 'number' },
        },
      },
    },
  },
  welcome: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      channelId: { type: 'string', nullable: true },
      message: { type: 'string' },
      dynamic: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          timezone: { type: 'string' },
          activityWindowMinutes: { type: 'number' },
          milestoneInterval: { type: 'number' },
          highlightChannels: { type: 'array' },
          excludeChannels: { type: 'array' },
        },
      },
    },
  },
  spam: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
    },
  },
  moderation: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      alertChannelId: { type: 'string' },
      autoDelete: { type: 'boolean' },
      dmNotifications: {
        type: 'object',
        properties: {
          warn: { type: 'boolean' },
          timeout: { type: 'boolean' },
          kick: { type: 'boolean' },
          ban: { type: 'boolean' },
        },
      },
      escalation: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          thresholds: { type: 'array' },
        },
      },
      logging: {
        type: 'object',
        properties: {
          channels: {
            type: 'object',
            properties: {
              default: { type: 'string', nullable: true },
              warns: { type: 'string', nullable: true },
              bans: { type: 'string', nullable: true },
              kicks: { type: 'string', nullable: true },
              timeouts: { type: 'string', nullable: true },
              purges: { type: 'string', nullable: true },
              locks: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  },
  triage: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      defaultInterval: { type: 'number' },
      maxBufferSize: { type: 'number' },
      triggerWords: { type: 'array' },
      moderationKeywords: { type: 'array' },
      classifyModel: { type: 'string' },
      classifyBudget: { type: 'number' },
      respondModel: { type: 'string' },
      respondBudget: { type: 'number' },
      thinkingTokens: { type: 'number' },
      classifyBaseUrl: { type: 'string', nullable: true },
      classifyApiKey: { type: 'string', nullable: true },
      respondBaseUrl: { type: 'string', nullable: true },
      respondApiKey: { type: 'string', nullable: true },
      streaming: { type: 'boolean' },
      tokenRecycleLimit: { type: 'number' },
      contextMessages: { type: 'number' },
      timeout: { type: 'number' },
      moderationResponse: { type: 'boolean' },
      channels: { type: 'array' },
      excludeChannels: { type: 'array' },
      debugFooter: { type: 'boolean' },
      debugFooterLevel: { type: 'string' },
      moderationLogChannel: { type: 'string' },
    },
  },
};

/**
 * Validate a single value against its schema definition.
 *
 * @param {*} value - Value to validate
 * @param {Object} schema - Schema definition with type, properties, and nullable
 * @param {string} path - Dot-notation path for error messages
 * @returns {string[]} Array of validation error messages
 */
function validateValue(value, schema, path) {
  const errors = [];

  if (value === null) {
    if (!schema.nullable) {
      errors.push(`${path}: must not be null`);
    }
    return errors;
  }

  if (value === undefined) {
    return errors;
  }

  switch (schema.type) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`${path}: expected boolean, got ${typeof value}`);
      }
      break;
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`${path}: expected string, got ${typeof value}`);
      }
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${path}: expected finite number, got ${typeof value}`);
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${typeof value}`);
      }
      break;
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push(
          `${path}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`,
        );
      } else if (schema.properties) {
        for (const [key, val] of Object.entries(value)) {
          if (schema.properties[key]) {
            errors.push(...validateValue(val, schema.properties[key], `${path}.${key}`));
          }
        }
      }
      break;
  }

  return errors;
}

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
 * Validate a single config path + value against the schema.
 * Used by PATCH endpoints and webhook config-update to validate individual writes.
 *
 * @param {string} path - Dot-notation path (e.g. "ai.enabled")
 * @param {*} value - The value to validate
 * @returns {string[]} Array of validation error messages (empty if valid)
 */
export function validateSingleValue(path, value) {
  const segments = path.split('.');
  const section = segments[0];

  const schema = CONFIG_SCHEMA[section];
  if (!schema) return []; // unknown section — let SAFE_CONFIG_KEYS guard handle it

  // Walk the schema tree to find the leaf schema for this path
  let currentSchema = schema;
  for (let i = 1; i < segments.length; i++) {
    if (!currentSchema.properties || !currentSchema.properties[segments[i]]) {
      // Path targets an unknown/extensible property — no schema to validate against
      return [];
    }
    currentSchema = currentSchema.properties[segments[i]];
  }

  return validateValue(value, currentSchema, path);
}

/**
 * Flatten a nested object into dot-notation [path, value] pairs.
 * Plain objects are recursed into; arrays and primitives are leaf values.
 *
 * @param {Object} obj - Object to flatten
 * @param {string} prefix - Current path prefix
 * @returns {Array<[string, *]>} Array of [dotPath, leafValue] tuples
 */
export function flattenToLeafPaths(obj, prefix) {
  const results = [];

  for (const [key, value] of Object.entries(obj)) {
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

  res.json(safeConfig);
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

  const updatedSections = Object.keys(req.body).filter((k) => SAFE_CONFIG_KEYS.includes(k));

  if (failed.length === 0) {
    // All writes succeeded
    info('Global config updated via config API', { sections: updatedSections });
    fireAndForgetWebhook('CONFIG_CHANGE_WEBHOOK_URL', {
      event: 'config.updated',
      sections: updatedSections,
      timestamp: Date.now(),
    });
    return res.json(safeConfig);
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
    config: safeConfig,
  });
});

export default router;
