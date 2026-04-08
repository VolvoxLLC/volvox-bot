/**
 * Shared config validation utilities.
 *
 * Centralises CONFIG_SCHEMA, validateValue, and validateSingleValue so that
 * both route handlers and util modules can import from a single source of
 * truth without creating an inverted dependency (utils → routes).
 */

/** Module-level cache for compiled regex patterns used during validation. */
const _compiledPatterns = new Map();

/** Maximum number of distinct patterns to keep in the cache. */
const _MAX_PATTERN_CACHE = 100;

/**
 * Return a cached compiled RegExp for the given pattern string.
 * Avoids re-compiling the same pattern on every config validation call.
 * The cache is capped at _MAX_PATTERN_CACHE entries to prevent unbounded growth
 * in environments with dynamic schema patterns.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
function getCompiledPattern(pattern) {
  let re = _compiledPatterns.get(pattern);
  if (!re) {
    if (_compiledPatterns.size >= _MAX_PATTERN_CACHE) {
      // Evict the oldest entry (Map preserves insertion order).
      _compiledPatterns.delete(_compiledPatterns.keys().next().value);
    }
    re = new RegExp(pattern);
    _compiledPatterns.set(pattern, re);
  }
  return re;
}

const XP_ACTION_TYPES = [
  'grantRole',
  'removeRole',
  'sendDm',
  'announce',
  'xpBonus',
  'addReaction',
  'nickPrefix',
  'nickSuffix',
  'webhook',
];

const XP_EMBED_FIELD_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true },
    name: { type: 'string', nullable: true },
    value: { type: 'string', nullable: true },
    inline: { type: 'boolean', nullable: true },
  },
};

const XP_EMBED_FOOTER_SCHEMA = {
  nullable: true,
  anyOf: [
    { type: 'string' },
    {
      type: 'object',
      properties: {
        text: { type: 'string', nullable: true },
        iconURL: { type: 'string', nullable: true },
      },
    },
  ],
};

const XP_EMBED_SCHEMA = {
  type: 'object',
  nullable: true,
  properties: {
    title: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    color: { type: 'string', nullable: true },
    thumbnail: { type: 'string', nullable: true },
    thumbnailType: {
      type: 'string',
      enum: ['none', 'user_avatar', 'server_icon', 'custom'],
      nullable: true,
    },
    thumbnailUrl: { type: 'string', nullable: true },
    fields: { type: 'array', items: XP_EMBED_FIELD_SCHEMA, nullable: true },
    footer: XP_EMBED_FOOTER_SCHEMA,
    footerText: { type: 'string', nullable: true },
    footerIconUrl: { type: 'string', nullable: true },
    image: { type: 'string', nullable: true },
    imageUrl: { type: 'string', nullable: true },
    timestamp: { type: 'boolean', nullable: true },
    showTimestamp: { type: 'boolean', nullable: true },
  },
};

const XP_ACTION_ITEM_SCHEMA = {
  type: 'object',
  required: ['type'],
  properties: {
    id: { type: 'string', nullable: true },
    type: {
      type: 'string',
      enum: XP_ACTION_TYPES,
    },
    roleId: { type: 'string', nullable: true },
    message: { type: 'string', nullable: true },
    template: { type: 'string', nullable: true },
    format: { type: 'string', enum: ['text', 'embed', 'both'], nullable: true },
    channelMode: {
      type: 'string',
      enum: ['current', 'specific', 'none'],
      nullable: true,
    },
    channelId: { type: 'string', nullable: true },
    emoji: { type: 'string', nullable: true },
    amount: { type: 'number', nullable: true },
    prefix: { type: 'string', nullable: true },
    suffix: { type: 'string', nullable: true },
    url: { type: 'string', nullable: true },
    payload: { type: 'string', nullable: true },
    embed: XP_EMBED_SCHEMA,
  },
  openProperties: true,
};

const XP_LEVEL_ACTION_ENTRY_SCHEMA = {
  type: 'object',
  required: ['level', 'actions'],
  properties: {
    id: { type: 'string', nullable: true },
    level: { type: 'number', min: 1, max: 1000 },
    actions: {
      type: 'array',
      items: XP_ACTION_ITEM_SCHEMA,
    },
  },
};

/**
 * Schema definitions for writable config sections.
 * Used to validate types before persisting changes.
 */
export const CONFIG_SCHEMA = {
  ai: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      systemPrompt: { type: 'string', maxLength: 4000 },
      channels: { type: 'array' },
      blockedChannelIds: { type: 'array' },
      historyLength: { type: 'number', min: 1, max: 100 },
      historyTTLDays: { type: 'number', min: 1, max: 365 },
      threadMode: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          autoArchiveMinutes: { type: 'number', min: 60, max: 10080 },
          reuseWindowMinutes: { type: 'number', min: 1, max: 1440 },
        },
      },
      channelModes: { type: 'object', openProperties: true },
      defaultChannelMode: { type: 'string', enum: ['off', 'mention', 'vibe'] },
    },
  },
  welcome: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      channelId: { type: 'string', nullable: true },
      message: { type: 'string' },
      variants: {
        type: 'array',
        items: { type: 'string' },
      },
      channels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            channelId: { type: 'string' },
            message: { type: 'string' },
            variants: { type: 'array', items: { type: 'string' } },
          },
          required: ['channelId'],
        },
      },
      dynamic: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          timezone: { type: 'string' },
          activityWindowMinutes: { type: 'number', min: 1, max: 10080 },
          milestoneInterval: { type: 'number', min: 1, max: 10000 },
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
      protectRoles: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          roleIds: { type: 'array', items: { type: 'string' } },
          includeAdmins: { type: 'boolean' },
          includeModerators: { type: 'boolean' },
          includeServerOwner: { type: 'boolean' },
        },
      },
    },
  },
  triage: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      defaultInterval: { type: 'number', min: 1, max: 3600 },
      maxBufferSize: { type: 'number', min: 1, max: 1000 },
      triggerWords: { type: 'array' },
      moderationKeywords: { type: 'array' },
      classifyModel: { type: 'string' },
      classifyBudget: { type: 'number', min: 0, max: 100000 },
      respondModel: { type: 'string' },
      respondBudget: { type: 'number', min: 0, max: 100000 },
      thinkingTokens: { type: 'number', min: 0, max: 100000 },
      classifyBaseUrl: { type: 'string', nullable: true },
      classifyApiKey: { type: 'string', nullable: true },
      respondBaseUrl: { type: 'string', nullable: true },
      respondApiKey: { type: 'string', nullable: true },
      streaming: { type: 'boolean' },
      tokenRecycleLimit: { type: 'number', min: 0, max: 1000000 },
      contextMessages: { type: 'number', min: 0, max: 100 },
      timeout: { type: 'number', min: 1000, max: 300000 },
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
      retentionDays: { type: 'number', min: 1, max: 365 },
    },
  },
  botStatus: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      status: { type: 'string', enum: ['online', 'idle', 'dnd', 'invisible'] },
      activityType: {
        type: 'string',
        enum: ['Playing', 'Watching', 'Listening', 'Competing', 'Streaming', 'Custom'],
      },
      activities: { type: 'array', items: { type: 'string' } },
      rotateIntervalMs: { type: 'number' },
      rotation: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          intervalMinutes: { type: 'number' },
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['Playing', 'Watching', 'Listening', 'Competing', 'Streaming', 'Custom'],
                },
                text: { type: 'string', minLength: 1, pattern: '\\S' },
              },
              required: ['text'],
            },
          },
        },
      },
    },
  },
  reminders: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      maxPerUser: { type: 'number', min: 1, max: 100 },
    },
  },
  quietMode: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      maxDurationMinutes: { type: 'number', min: 1, max: 10080 },
      allowedRoles: { type: 'array' },
    },
  },
  voice: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      xpPerMinute: { type: 'number', min: 0, max: 1000 },
      dailyXpCap: { type: 'number', min: 0, max: 1000000 },
      logChannel: { type: 'string', nullable: true },
    },
  },
  permissions: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      usePermissions: { type: 'boolean' },
      adminRoleIds: { type: 'array', items: { type: 'string' } },
      moderatorRoleIds: { type: 'array', items: { type: 'string' } },
      // Legacy singular fields — kept for backward compat during migration
      adminRoleId: { type: 'string', nullable: true },
      moderatorRoleId: { type: 'string', nullable: true },
      modRoles: { type: 'array', items: { type: 'string' } },
      botOwners: { type: 'array', items: { type: 'string' } },
      // allowedCommands is a freeform map of command → permission level — no fixed property list
      allowedCommands: { type: 'object', openProperties: true },
    },
  },
  tldr: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      systemPrompt: { type: 'string', maxLength: 4000 },
      defaultMessages: { type: 'number', min: 1, max: 200 },
      maxMessages: { type: 'number', min: 1, max: 200 },
      cooldownSeconds: { type: 'number', min: 0, max: 3600 },
    },
  },
  xp: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      levelThresholds: {
        type: 'array',
        items: { type: 'number', min: 0 },
      },
      levelActions: {
        type: 'array',
        items: XP_LEVEL_ACTION_ENTRY_SCHEMA,
      },
      defaultActions: {
        type: 'array',
        items: XP_ACTION_ITEM_SCHEMA,
      },
      levelUpDm: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          sendOnEveryLevel: { type: 'boolean' },
          defaultMessage: { type: 'string', minLength: 1, maxLength: 2000, pattern: '\\S' },
          messages: {
            type: 'array',
            uniqueBy: 'level',
            items: {
              type: 'object',
              required: ['level', 'message'],
              properties: {
                level: { type: 'number', min: 1, max: 1000 },
                message: { type: 'string', minLength: 1, maxLength: 2000, pattern: '\\S' },
              },
            },
          },
        },
      },
      roleRewards: {
        type: 'object',
        properties: {
          stackRoles: { type: 'boolean' },
          removeOnLevelDown: { type: 'boolean' },
        },
      },
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

  if (schema.anyOf) {
    const results = schema.anyOf.map((candidate) => validateValue(value, candidate, path));
    const success = results.find((candidateErrors) => candidateErrors.length === 0);
    if (success) {
      return success;
    }
    return results.flat();
  }

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
      } else {
        if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
          errors.push(`${path}: must be at least ${schema.minLength} characters`);
        }
        if (schema.enum && !schema.enum.includes(value)) {
          errors.push(`${path}: must be one of [${schema.enum.join(', ')}], got "${value}"`);
        }
        if (schema.maxLength != null && value.length > schema.maxLength) {
          errors.push(`${path}: exceeds max length of ${schema.maxLength}`);
        }
        if (schema.pattern && !getCompiledPattern(schema.pattern).test(value)) {
          errors.push(`${path}: does not match required pattern`);
        }
      }
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${path}: expected finite number, got ${typeof value}`);
      } else {
        if (schema.min != null && value < schema.min) {
          errors.push(`${path}: must be >= ${schema.min}`);
        }
        if (schema.max != null && value > schema.max) {
          errors.push(`${path}: must be <= ${schema.max}`);
        }
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${typeof value}`);
      } else if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          errors.push(...validateValue(value[i], schema.items, `${path}[${i}]`));
        }

        if (schema.uniqueBy) {
          const seen = new Map();
          for (let i = 0; i < value.length; i++) {
            const item = value[i];
            const uniqueValue =
              item && typeof item === 'object' && !Array.isArray(item)
                ? item[schema.uniqueBy]
                : undefined;
            if (uniqueValue === undefined) continue;
            if (seen.has(uniqueValue)) {
              errors.push(
                `${path}[${i}].${schema.uniqueBy}: duplicate value "${uniqueValue}" also used at index ${seen.get(uniqueValue)}`,
              );
            } else {
              seen.set(uniqueValue, i);
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
      } else {
        if (schema.required) {
          for (const key of schema.required) {
            if (!Object.hasOwn(value, key)) {
              errors.push(`${path}: missing required key "${key}"`);
            }
          }
        }

        if (schema.properties) {
          for (const [key, val] of Object.entries(value)) {
            if (Object.hasOwn(schema.properties, key)) {
              errors.push(...validateValue(val, schema.properties[key], `${path}.${key}`));
            } else if (!schema.openProperties) {
              errors.push(`${path}.${key}: unknown config key`);
            }
            // openProperties: true — freeform map, unknown keys are allowed
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
    if (currentSchema.properties && Object.hasOwn(currentSchema.properties, segments[i])) {
      currentSchema = currentSchema.properties[segments[i]];
    } else if (currentSchema.openProperties) {
      // Dynamic keys (e.g. channelModes.<channelId>) — validate as leaf value
      break;
    } else {
      return [`Unknown config path: ${path}`];
    }
  }

  return validateValue(value, currentSchema, path);
}
