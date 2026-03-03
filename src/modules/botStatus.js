/**
 * Bot Status Module
 * Manages configurable bot presence: status and activity messages.
 *
 * Features:
 * - Configurable status (online, idle, dnd, invisible)
 * - Custom activity text with variable interpolation
 * - Rotating activities (cycles through a list on configurable interval)
 *
 * Config shape (config.botStatus):
 * {
 *   enabled: true,
 *   status: "online",           // online | idle | dnd | invisible
 *   activityType: "Playing",    // Playing | Watching | Listening | Competing | Streaming | Custom
 *   activities: [               // Rotated in order; single entry = static
 *     "with {memberCount} members",
 *     "in {guildCount} servers"
 *   ],
 *   rotateIntervalMs: 30000     // How often to rotate (ms), default 30s
 * }
 *
 * Variables available in activity text:
 *   {memberCount}   Total member count across all guilds
 *   {guildCount}    Number of guilds the bot is in
 *   {botName}       The bot's username
 */

import { ActivityType } from 'discord.js';
import { info, warn } from '../logger.js';
import { getConfig } from './config.js';

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

/** @type {ReturnType<typeof setInterval> | null} */
let rotateInterval = null;

/** @type {number} Current activity index in the rotation */
let currentActivityIndex = 0;

/** @type {import('discord.js').Client | null} */
let _client = null;

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

  return text
    .replace(/\{memberCount\}/g, String(memberCount))
    .replace(/\{guildCount\}/g, String(guildCount))
    .replace(/\{botName\}/g, botName);
}

/**
 * Resolve status and activity type from config with safe fallbacks.
 *
 * @param {Object} cfg - botStatus config section
 * @returns {{ status: string, activityType: ActivityType }} Resolved values
 */
export function resolvePresenceConfig(cfg) {
  const status = VALID_STATUSES.has(cfg?.status) ? cfg.status : 'online';

  const typeStr = cfg?.activityType ?? 'Playing';
  const activityType =
    ACTIVITY_TYPE_MAP[typeStr] !== undefined ? ACTIVITY_TYPE_MAP[typeStr] : ActivityType.Playing;

  return { status, activityType };
}

/**
 * Get the active activities list from config.
 * Falls back to a sensible default if none configured.
 *
 * @param {Object} cfg - botStatus config section
 * @returns {string[]} Non-empty array of activity strings
 */
export function getActivities(cfg) {
  const list = cfg?.activities;
  if (Array.isArray(list) && list.length > 0) {
    return list.filter((a) => typeof a === 'string' && a.trim().length > 0);
  }
  return ['with Discord'];
}

/**
 * Apply the current activity to the Discord client's presence.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
export function applyPresence(client) {
  const globalCfg = getConfig();
  const cfg = globalCfg?.botStatus;

  if (!cfg?.enabled) return;

  const { status, activityType } = resolvePresenceConfig(cfg);
  const activities = getActivities(cfg);

  // Guard against empty list after filter
  if (activities.length === 0) return;

  // Clamp index to list length
  currentActivityIndex = currentActivityIndex % activities.length;
  const rawText = activities[currentActivityIndex];
  const name = interpolateActivity(rawText, client);

  try {
    client.user.setPresence({
      status,
      activities: [{ name, type: activityType }],
    });

    info('Bot presence updated', {
      status,
      activityType: cfg.activityType ?? 'Playing',
      activity: name,
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
  const activities = getActivities(cfg);
  currentActivityIndex = (currentActivityIndex + 1) % Math.max(activities.length, 1);
  applyPresence(client);
}

/**
 * Start the bot status rotation.
 * Immediately applies the first activity, then rotates on interval.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
export function startBotStatus(client) {
  _client = client;

  const cfg = getConfig()?.botStatus;
  if (!cfg?.enabled) {
    info('Bot status module disabled — skipping');
    return;
  }

  // Apply immediately
  currentActivityIndex = 0;
  applyPresence(client);

  const activities = getActivities(cfg);
  const intervalMs =
    typeof cfg.rotateIntervalMs === 'number' && cfg.rotateIntervalMs > 0
      ? cfg.rotateIntervalMs
      : 30_000;

  // Only start rotation interval if there are multiple activities to rotate through
  if (activities.length > 1) {
    rotateInterval = setInterval(() => rotate(client), intervalMs);
    info('Bot status rotation started', {
      activitiesCount: activities.length,
      intervalMs,
    });
  } else {
    info('Bot status set (single activity — no rotation)', {
      activity: activities[0],
    });
  }
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
 * Reload bot status — called when config changes.
 * Stops any running rotation and restarts with new config.
 *
 * @param {import('discord.js').Client} [client] - Discord client (uses cached if omitted)
 */
export function reloadBotStatus(client) {
  // Capture cached client BEFORE stopBotStatus() nulls it out
  const target = client ?? _client;
  stopBotStatus();
  if (target) {
    startBotStatus(target);
  }
}
