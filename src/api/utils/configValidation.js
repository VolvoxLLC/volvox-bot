/**
 * Shared config validation utilities.
 *
 * Centralises CONFIG_SCHEMA, validateValue, and validateSingleValue so that
 * both route handlers and util modules can import from a single source of
 * truth without creating an inverted dependency (utils → routes).
 */

/**
 * Schema definitions for writable config sections.
 * Used to validate types before persisting changes.
 */
export const CONFIG_SCHEMA = {
  ai: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      systemPrompt: { type: 'string' },
      channels: { type: 'array' },
      blockedChannelIds: { type: 'array' },
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
      rulesChannel: { type: 'string', nullable: true },
      verifiedRole: { type: 'string', nullable: true },
      introChannel: { type: 'string', nullable: true },
      roleMenu: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          options: { type: 'array', items: { type: 'object', required: ['label', 'roleId'] } },
        },
      },
      dmSequence: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          steps: { type: 'array', items: { type: 'string' } },
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
      alertChannelId: { type: 'string', nullable: true },
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
      debugFooterLevel: { type: 'string', nullable: true },
      moderationLogChannel: { type: 'string', nullable: true },
    },
  },
  auditLog: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      retentionDays: { type: 'number' },
    },
  },
  reminders: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      maxPerUser: { type: 'number' },
    },
  },
};

/**
 * Validate a value against a schema fragment and collect any validation errors.
 *
 * @param {*} value - The value to validate.
 * @param {Object} schema - Schema fragment describing the expected shape; may include `type` (boolean|string|number|array|object), `nullable`, and `properties` for object children.
 * @param {string} path - Dot-notation path used to prefix validation error messages.
 * @returns {string[]} Array of validation error messages; empty if the value is valid for the provided schema.
 */
export function validateValue(value, schema, path) {
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
      } else if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (schema.items.type === 'string') {
            if (typeof item !== 'string') {
              errors.push(`${path}[${i}]: expected string, got ${typeof item}`);
            }
          } else if (schema.items.type === 'object') {
            if (typeof item !== 'object' || item === null || Array.isArray(item)) {
              errors.push(
                `${path}[${i}]: expected object, got ${Array.isArray(item) ? 'array' : item === null ? 'null' : typeof item}`,
              );
            } else if (schema.items.required) {
              for (const key of schema.items.required) {
                if (!(key in item)) {
                  errors.push(`${path}[${i}]: missing required key "${key}"`);
                }
              }
            }
          }
        }
      }
      break;
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push(
          `${path}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`,
        );
      } else if (schema.properties) {
        for (const [key, val] of Object.entries(value)) {
          if (Object.hasOwn(schema.properties, key)) {
            errors.push(...validateValue(val, schema.properties[key], `${path}.${key}`));
          } else {
            errors.push(`${path}.${key}: unknown config key`);
          }
        }
      }
      break;
  }

  return errors;
}

/**
 * Validate a single configuration path and its value against the writable config schema.
 *
 * @param {string} path - Dot-notation config path (e.g. "ai.enabled").
 * @param {*} value - The value to validate for the given path.
 * @returns {string[]} Array of validation error messages (empty if valid).
 */
export function validateSingleValue(path, value) {
  const segments = path.split('.');
  const section = segments[0];

  const schema = CONFIG_SCHEMA[section];
  if (!schema) return []; // unknown section — let SAFE_CONFIG_KEYS guard handle it

  // Walk the schema tree to find the leaf schema for this path
  let currentSchema = schema;
  for (let i = 1; i < segments.length; i++) {
    if (!currentSchema.properties || !Object.hasOwn(currentSchema.properties, segments[i])) {
      return [`Unknown config path: ${path}`];
    }
    currentSchema = currentSchema.properties[segments[i]];
  }

  return validateValue(value, currentSchema, path);
}
