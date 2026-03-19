/**
 * Bot Status Module
 * Manages configurable bot presence with optional rotation and template variables.
 *
 * Supported config formats:
 * 1) New format:
 * {
 *   enabled: true,
 *   status: 'online',
 *   rotation: {
 *     enabled: true,
 *     intervalMinutes: 5,
 *     messages: [
 *       { type: 'Watching', text: '{guildCount} servers' },
 *       { type: 'Playing', text: 'with /help' }
 *     ]
 *   }
 * }
 *
 * 2) Legacy format (kept for compatibility):
 * {
 *   enabled: true,
 *   status: 'online',
 *   activityType: 'Playing',
 *   activities: ['with Discord', 'in {guildCount} servers'],
 *   rotateIntervalMs: 30000
 * }
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActivityType } from 'discord.js';
import { info, warn } from '../logger.js';
import { getConfig } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Map Discord activity type strings to ActivityType enum values */
const ACTIVITY_TYPE_MAP = {
  Playing: ActivityType.Playing,
  Watching: ActivityType.Watching,
  Listening: ActivityType.Listening,
  Competing: ActivityType.Competing,
  Streaming: ActivityType.Streaming,
  Custom: ActivityType.Custom,
};

/** Valid Discord presence status strings */
const VALID_STATUSES = new Set(['online', 'idle', 'dnd', 'invisible']);

const DEFAULT_LEGACY_ROTATE_INTERVAL_MS = 30_000;
const DEFAULT_ROTATE_INTERVAL_MINUTES = 5;
const DEFAULT_ACTIVITY_TYPE = 'Playing';
const DEFAULT_ACTIVITY_TEXT = 'with Discord';

/** @type {ReturnType<typeof setInterval> | null} */
let rotateInterval = null;

/** @type {number} Current activity index in the rotation */
let currentActivityIndex = 0;

/** @type {import('discord.js').Client | null} */
let _client = null;

/** @type {string | null} */
let cachedVersion = null;

/**
 * Format milliseconds into a compact uptime string (e.g. '2d 3h 15m').
 *
 * @param {number} uptimeMs
 * @returns {string}
 */
export function formatUptime(uptimeMs) {
  if (!Number.isFinite(uptimeMs) || uptimeMs <= 0) return '0m';

  const totalMinutes = Math.floor(uptimeMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

/**
 * Resolve package version from root package.json.
 *
 * @returns {string}
 */
function getPackageVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
    cachedVersion = typeof pkg?.version === 'string' ? pkg.version : 'unknown';
  } catch {
    cachedVersion = 'unknown';
  }
  return cachedVersion;
}

/**
 * Check whether an activity type string is supported by Discord presence handling.
 *
 * @param {string | undefined} typeStr
 * @returns {boolean}
 */
function isSupportedActivityType(typeStr) {
  return typeof typeStr === 'string' && Object.hasOwn(ACTIVITY_TYPE_MAP, typeStr);
}

/**
 * Resolve a fallback activity type string for normalization paths.
 *
 * @param {string | undefined} typeStr
 * @param {string} source
 * @returns {string}
 */
function resolveFallbackType(typeStr, source) {
  if (!typeStr) return DEFAULT_ACTIVITY_TYPE;

  if (isSupportedActivityType(typeStr)) {
    return typeStr;
  }

  warn('Invalid bot status activity type, falling back to Playing', {
    source,
    invalidType: typeStr,
  });
  return DEFAULT_ACTIVITY_TYPE;
}

/**
 * Interpolate variables in an activity text string.
 *
 * @param {string} text - Activity template string
 * @param {import('discord.js').Client} client - Discord client
 * @returns {string} Interpolated activity string
 */
export function interpolateActivity(text, client) {
  if (!client || typeof text !== 'string') return text;

  const memberCount = client.guilds?.cache?.reduce((sum, g) => sum + (g.memberCount ?? 0), 0) ?? 0;
  const guildCount = client.guilds?.cache?.size ?? 0;
  const botName = client.user?.username ?? 'Bot';
  const commandCount = client.commands?.size ?? 0;
  const uptime = formatUptime(client.uptime ?? 0);
  const version = getPackageVersion();

  return text
    .replace(/\{memberCount\}/g, String(memberCount))
    .replace(/\{guildCount\}/g, String(guildCount))
    .replace(/\{botName\}/g, botName)
    .replace(/\{commandCount\}/g, String(commandCount))
    .replace(/\{uptime\}/g, uptime)
    .replace(/\{version\}/g, version);
}

/**
 * Resolve the configured global online status with safe fallback.
 *
 * @param {Object} cfg
 * @returns {string}
 */
export function resolvePresenceStatus(cfg) {
  return VALID_STATUSES.has(cfg?.status) ? cfg.status : 'online';
}

/**
 * Resolve a configured activity type string into Discord enum.
 *
 * @param {string | undefined} typeStr
 * @returns {ActivityType}
 */
export function resolveActivityType(typeStr) {
  if (!typeStr) return ActivityType.Playing;
  if (isSupportedActivityType(typeStr)) {
    return ACTIVITY_TYPE_MAP[typeStr];
  }

  warn('Invalid bot status activity type, falling back to Playing', {
    source: 'botStatus',
    invalidType: typeStr,
  });
  return ActivityType.Playing;
}

/**
 * Legacy helper kept for backward compatibility with existing call sites/tests.
 *
 * @param {Object} cfg
 * @returns {{ status: string, activityType: ActivityType }}
 */
export function resolvePresenceConfig(cfg) {
  return {
    status: resolvePresenceStatus(cfg),
    activityType: resolveActivityType(cfg?.activityType),
  };
}

/**
 * Normalize a configured status message entry.
 *
 * @param {unknown} entry
 * @param {string | undefined} fallbackType
 * @param {string} source
 * @returns {{type: string, text: string} | null}
 */
function normalizeMessage(entry, fallbackType, source) {
  const resolvedFallbackType = resolveFallbackType(fallbackType, `${source}.fallbackType`);

  if (typeof entry === 'string') {
    const text = entry.trim();
    if (!text) {
      warn('Ignoring empty bot status message entry', { source });
      return null;
    }
    return { type: resolvedFallbackType, text };
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    warn('Ignoring invalid bot status message entry', {
      source,
      entryType: Array.isArray(entry) ? 'array' : entry === null ? 'null' : typeof entry,
    });
    return null;
  }

  const rawText = typeof entry.text === 'string' ? entry.text.trim() : '';
  if (!rawText) {
    warn('Ignoring bot status message without valid text', { source });
    return null;
  }

  let type = resolvedFallbackType;
  if (typeof entry.type === 'string' && entry.type.trim()) {
    if (isSupportedActivityType(entry.type)) {
      type = entry.type;
    } else {
      warn('Invalid bot status message type, falling back to configured/default type', {
        source,
        invalidType: entry.type,
        fallbackType: resolvedFallbackType,
      });
    }
  }

  return { type, text: rawText };
}

/**
 * Return normalized rotation messages from new or legacy config fields.
 *
 * @param {Object} cfg - botStatus config section
 * @returns {{type: string, text: string}[]}
 */
export function getRotationMessages(cfg) {
  const rotationMessages = cfg?.rotation?.messages;
  if (Array.isArray(rotationMessages)) {
    const normalized = rotationMessages
      .map((entry, index) =>
        normalizeMessage(entry, cfg?.activityType, `botStatus.rotation.messages[${index}]`),
      )
      .filter((entry) => entry !== null);
    if (normalized.length > 0) {
      return normalized;
    }

    if (rotationMessages.length > 0) {
      warn('Configured botStatus.rotation.messages had no usable entries; falling back', {
        fallback: Array.isArray(cfg?.activities) && cfg.activities.length > 0
          ? 'botStatus.activities'
          : 'default',
      });
    }
  }

  const legacyActivities = cfg?.activities;
  if (Array.isArray(legacyActivities)) {
    const normalized = legacyActivities
      .map((entry, index) =>
        normalizeMessage(entry, cfg?.activityType, `botStatus.activities[${index}]`),
      )
      .filter((entry) => entry !== null);
    if (normalized.length > 0) {
      return normalized;
    }

    if (legacyActivities.length > 0) {
      warn('Configured botStatus.activities had no usable entries; using default activity', {});
    }
  }

  return [{ type: DEFAULT_ACTIVITY_TYPE, text: DEFAULT_ACTIVITY_TEXT }];
}

/**
 * Legacy helper kept for backward compatibility with existing call sites/tests.
 *
 * @param {Object} cfg
 * @returns {string[]}
 */
export function getActivities(cfg) {
  return getRotationMessages(cfg).map((entry) => entry.text);
}

/**
 * Resolve rotation interval in milliseconds with Discord-safe minimum.
 *
 * @param {Object} cfg - botStatus config section
 * @returns {number}
 */
export function resolveRotationIntervalMs(cfg) {
  if (typeof cfg?.rotation?.intervalMinutes === 'number' && cfg.rotation.intervalMinutes > 0) {
    return Math.round(cfg.rotation.intervalMinutes * 60_000);
  }

  if (typeof cfg?.rotateIntervalMs === 'number' && cfg.rotateIntervalMs > 0) {
    return cfg.rotateIntervalMs;
  }

  if (cfg?.rotation) {
    return DEFAULT_ROTATE_INTERVAL_MINUTES * 60_000;
  }

  return DEFAULT_LEGACY_ROTATE_INTERVAL_MS;
}

/**
 * Determine whether rotation should be active.
 * New format obeys rotation.enabled. Legacy format rotates when multiple activities exist.
 *
 * @param {Object} cfg - botStatus config section
 * @param {number} messageCount
 * @returns {boolean}
 */
export function isRotationEnabled(cfg, messageCount) {
  if (cfg?.rotation && typeof cfg.rotation.enabled === 'boolean') {
    return cfg.rotation.enabled && messageCount > 1;
  }
  return messageCount > 1;
}

/**
 * Build Discord activity payload for presence update.
 *
 * @param {string} text
 * @param {ActivityType} type
 * @returns {{name: string, type: ActivityType, state?: string}}
 */
function buildActivityPayload(text, type) {
  if (type === ActivityType.Custom) {
    return { name: 'Custom Status', state: text, type };
  }
  return { name: text, type };
}

/**
 * Apply the current activity to the Discord client's presence.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
export function applyPresence(client) {
  const cfg = getConfig()?.botStatus;

  if (!cfg?.enabled || !client?.user) return;

  const status = resolvePresenceStatus(cfg);
  const messages = getRotationMessages(cfg);
  if (messages.length === 0) return;

  currentActivityIndex = currentActivityIndex % messages.length;
  const activeMessage = messages[currentActivityIndex];
  const activityType = resolveActivityType(activeMessage.type);
  const text = interpolateActivity(activeMessage.text, client);
  const activity = buildActivityPayload(text, activityType);

  try {
    client.user.setPresence({
      status,
      activities: [activity],
    });

    info('Bot presence updated', {
      status,
      activityType: activeMessage.type,
      activity: text,
      index: currentActivityIndex,
    });
  } catch (err) {
    warn('Failed to set bot presence', { error: err.message });
  }
}

/**
 * Advance the rotation index and apply presence.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
function rotate(client) {
  const cfg = getConfig()?.botStatus;
  const messages = getRotationMessages(cfg);
  currentActivityIndex = (currentActivityIndex + 1) % Math.max(messages.length, 1);
  applyPresence(client);
}

/**
 * Start the bot status rotation.
 * Immediately applies the first activity, then rotates on interval.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
export function startBotStatus(client) {
  if (rotateInterval) {
    clearInterval(rotateInterval);
    rotateInterval = null;
  }
  _client = client;

  const cfg = getConfig()?.botStatus;
  if (!cfg?.enabled) {
    info('Bot status module disabled - skipping');
    return;
  }

  currentActivityIndex = 0;
  applyPresence(client);

  const messages = getRotationMessages(cfg);
  if (!isRotationEnabled(cfg, messages.length)) {
    info('Bot status set (rotation disabled or single message)', {
      activity: messages[0]?.text ?? '',
    });
    return;
  }

  const intervalMs = resolveRotationIntervalMs(cfg);
  rotateInterval = setInterval(() => rotate(client), intervalMs);
  info('Bot status rotation started', {
    messagesCount: messages.length,
    intervalMs,
  });
}

/**
 * Stop the bot status rotation interval.
 */
export function stopBotStatus() {
  if (rotateInterval) {
    clearInterval(rotateInterval);
    rotateInterval = null;
    info('Bot status rotation stopped');
  }
  _client = null;
}

/**
 * Reload bot status - called when config changes.
 * Stops any running rotation and restarts with new config.
 *
 * @param {import('discord.js').Client} [client] - Discord client (uses cached if omitted)
 */
export function reloadBotStatus(client) {
  const target = client ?? _client;
  stopBotStatus();
  if (target) {
    startBotStatus(target);
  }
}
