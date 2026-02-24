/**
 * Config Routes
 * Endpoints for reading and updating global bot configuration
 */

import { Router } from 'express';
import { error, info, warn } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';

const router = Router();

const WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Config sections that can be written via the PUT endpoint.
 * Mirrors SAFE_CONFIG_KEYS in guilds.js.
 */
const SAFE_CONFIG_KEYS = ['ai', 'welcome', 'spam', 'moderation', 'triage'];

/**
 * Config sections that can be read via the GET endpoint.
 * Includes everything in SAFE_CONFIG_KEYS plus read-only sections.
 */
const READABLE_CONFIG_KEYS = [...SAFE_CONFIG_KEYS, 'logging', 'memory', 'permissions'];

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
 * Fire-and-forget webhook notification for config changes.
 * Uses CONFIG_CHANGE_WEBHOOK_URL env var. Logs failure but never blocks the response.
 *
 * @param {string[]} sections - Config sections that were updated
 */
function notifyWebhook(sections) {
  const url = process.env.CONFIG_CHANGE_WEBHOOK_URL;
  if (!url) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'config.updated', sections, timestamp: Date.now() }),
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) {
        warn('Config change webhook returned non-OK status', { status: response.status, url });
      }
    })
    .catch((err) => {
      warn('Config change webhook failed', { error: err.message, url });
    })
    .finally(() => clearTimeout(timer));
}

/**
 * Middleware: restrict to API-secret callers or bot-owner OAuth users.
 * Global config changes affect all guilds, so only trusted callers are allowed.
 */
function requireGlobalAdmin(req, res, next) {
  if (req.authMethod === 'api-secret') return next();

  if (req.authMethod === 'oauth') {
    const botOwners = getBotOwnerIds();
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
 * Get bot owner IDs from environment variable, falling back to config.
 * @returns {string[]}
 */
function getBotOwnerIds() {
  const envValue = process.env.BOT_OWNER_IDS;
  if (envValue) {
    return envValue
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  const owners = getConfig()?.permissions?.botOwners;
  return Array.isArray(owners) ? owners : [];
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

  try {
    for (const [section, sectionValue] of Object.entries(req.body)) {
      if (!SAFE_CONFIG_KEYS.includes(section)) continue;

      const paths = flattenToLeafPaths(sectionValue, section);

      for (const [path, value] of paths) {
        await setConfigValue(path, value);
      }
    }

    const updated = getConfig();
    const safeConfig = {};

    for (const key of READABLE_CONFIG_KEYS) {
      if (key in updated) {
        safeConfig[key] = updated[key];
      }
    }

    const updatedSections = Object.keys(req.body).filter((k) => SAFE_CONFIG_KEYS.includes(k));
    info('Global config updated via config API', { sections: updatedSections });
    notifyWebhook(updatedSections);
    res.json(safeConfig);
  } catch (err) {
    error('Failed to update global config via API', { error: err.message });
    res.status(500).json({ error: 'Failed to update config' });
  }
});

export default router;
