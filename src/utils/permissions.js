/**
 * Permission checking utilities for Volvox.Bot
 *
 * Provides centralized permission checks for commands and features.
 */

import { PermissionFlagsBits } from 'discord.js';

/**
 * Merge the new plural role IDs array with the legacy singular field.
 *
 * After defaults are merged, old guild configs will have BOTH `roleIds: []`
 * (from defaults) AND `roleId: 'abc'` (from their stored override). Using `??`
 * alone misses this case because the empty array is truthy. We always combine
 * both so no configured role is ever silently dropped.
 *
 * @param {string[]} [roleIds=[]] - New plural field (may be empty from defaults)
 * @param {string|null} [roleId=null] - Legacy singular field
 * @returns {string[]} Deduplicated merged list
 */
export function mergeRoleIds(roleIds, roleId) {
  // Normalize roleIds defensively — persisted config may contain a string instead of an array
  let base;
  if (Array.isArray(roleIds)) {
    base = roleIds;
  } else if (typeof roleIds === 'string' && roleIds.length > 0) {
    base = [roleIds];
  } else {
    base = [];
  }
  const merged = new Set(base);
  if (typeof roleId === 'string' && roleId.length > 0) {
    merged.add(roleId);
  }
  return [...merged];
}

/**
 * Retrieve the configured bot owner user IDs.
 *
 * Reads the BOT_OWNER_IDS environment variable (comma-separated) and returns the parsed IDs;
 * if that variable is not set, falls back to config.permissions.botOwners.
 * @param {Object} [config] - Fallback configuration object; expected to include permissions.botOwners as an array.
 * @returns {string[]} Array of bot owner user IDs.
 */
export function getBotOwnerIds(config) {
  const envValue = process.env.BOT_OWNER_IDS;
  if (envValue) {
    return envValue
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  const owners = config?.permissions?.botOwners;
  return Array.isArray(owners) ? owners : [];
}

/**
 * Check if a member is a bot owner
 *
 * @param {GuildMember} member - Discord guild member
 * @param {Object} config - Bot configuration
 * @returns {boolean} True if member is a bot owner
 */
export function isBotOwner(member, config) {
  const owners = getBotOwnerIds(config);
  if (owners.length === 0) {
    return false;
  }
  const userId = member?.id || member?.user?.id;
  return userId != null && owners.includes(userId);
}

/**
 * Determine whether a guild member has administrative privileges.
 *
 * @param {GuildMember} member - The guild member to check.
 * @param {Object} config - Bot configuration containing permission role IDs.
 * @returns {boolean} `true` if the member is an admin, `false` otherwise.
 */
export function isAdmin(member, config) {
  if (!member) return false;

  // Bot owner always bypasses permission checks
  if (isBotOwner(member, config)) return true;

  if (!config) return false;

  // Check if member has Discord Administrator permission
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  // Check if member has any of the configured admin roles
  // mergeRoleIds handles the case where defaults inject adminRoleIds:[] alongside a legacy adminRoleId value
  const adminRoleIds = mergeRoleIds(
    config.permissions?.adminRoleIds,
    config.permissions?.adminRoleId,
  );
  if (adminRoleIds.length > 0) {
    return adminRoleIds.some((id) => member.roles.cache.has(id));
  }

  return false;
}

/**
 * Check if a member has permission to use a command
 *
 * @param {GuildMember} member - Discord guild member
 * @param {string} commandName - Name of the command
 * @param {Object} config - Bot configuration
 * @returns {boolean} True if member has permission
 */
export function hasPermission(member, commandName, config) {
  if (!member || !commandName) return false;

  // Bot owner always bypasses permission checks
  if (isBotOwner(member, config)) return true;

  if (!config) return false;

  // If permissions are disabled, allow everything
  if (!config.permissions?.enabled || !config.permissions?.usePermissions) {
    return true;
  }

  // Get permission level for this command
  const permissionLevel = config.permissions?.allowedCommands?.[commandName];

  // If command not in config, default to admin-only for safety
  if (!permissionLevel) {
    return isGuildAdmin(member, config);
  }

  // Check permission level
  if (permissionLevel === 'everyone') {
    return true;
  }

  if (permissionLevel === 'moderator') {
    return isModerator(member, config);
  }

  if (permissionLevel === 'admin') {
    return isGuildAdmin(member, config);
  }

  // Unknown permission level - deny for safety
  return false;
}

/**
 * Check if a member is a guild admin (has ADMINISTRATOR permission or bot admin role).
 *
 * Currently delegates to {@link isAdmin}. This is an intentional alias to establish
 * a separate semantic entry-point for per-guild admin checks. When per-guild config
 * lands (Issue #71), this function will diverge to check guild-scoped admin roles
 * instead of the global bot admin role.
 *
 * @param {GuildMember} member - Discord guild member
 * @param {Object} config - Bot configuration
 * @returns {boolean} True if member is a guild admin
 */
export function isGuildAdmin(member, config) {
  // TODO(#71): check guild-scoped admin roles once per-guild config is implemented
  return isAdmin(member, config);
}

/**
 * Determine whether a guild member is considered a moderator.
 *
 * Considers bot owners, members with the Administrator or Manage Guild permission, and members with any configured admin or moderator role IDs (supports legacy singular role ID fields).
 * @param {GuildMember} member - Discord guild member to check.
 * @param {Object} config - Bot configuration containing permission role settings (e.g., permissions.adminRoleIds, permissions.moderatorRoleIds or legacy adminRoleId/moderatorRoleId).
 * @returns {boolean} `true` if the member is a moderator, `false` otherwise.
 */
export function isModerator(member, config) {
  if (!member) return false;

  // Bot owner always returns true
  if (isBotOwner(member, config)) return true;

  if (!config) return false;

  // Administrator is strictly higher privilege — always implies moderator
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  // Check Discord Manage Guild permission
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  // Check bot admin roles from config
  const adminRoleIds = mergeRoleIds(
    config.permissions?.adminRoleIds,
    config.permissions?.adminRoleId,
  );
  if (adminRoleIds.some((id) => member.roles.cache.has(id))) {
    return true;
  }

  // Check bot moderator roles from config
  const moderatorRoleIds = mergeRoleIds(
    config.permissions?.moderatorRoleIds,
    config.permissions?.moderatorRoleId,
  );
  if (moderatorRoleIds.some((id) => member.roles.cache.has(id))) {
    return true;
  }

  return false;
}

/**
 * Get a helpful error message for permission denied
 *
 * @param {string} commandName - Name of the command
 * @param {string} [level='administrator'] - Required permission level
 * @returns {string} User-friendly error message
 */
export function getPermissionError(commandName, level = 'administrator') {
  return `❌ You don't have permission to use \`/${commandName}\`.\n\nThis command requires ${level} access.`;
}
