/**
 * Permission checking utilities for Bill Bot
 *
 * Provides centralized permission checks for commands and features.
 */

import { PermissionFlagsBits } from 'discord.js';

/** Bot owner ID — always bypasses all permission checks */
export const BOT_OWNER_ID = '191633014441115648';

/**
 * Check if a member is the bot owner
 *
 * @param {GuildMember} member - Discord guild member
 * @returns {boolean} True if member is the bot owner
 */
function isBotOwner(member) {
  return member?.id === BOT_OWNER_ID || member?.user?.id === BOT_OWNER_ID;
}

/**
 * Check if a member is an admin
 *
 * @param {GuildMember} member - Discord guild member
 * @param {Object} config - Bot configuration
 * @returns {boolean} True if member is admin
 */
export function isAdmin(member, config) {
  if (!member || !config) return false;

  // Bot owner always bypasses permission checks
  if (isBotOwner(member)) return true;

  // Check if member has Discord Administrator permission
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  // Check if member has the configured admin role
  if (config.permissions?.adminRoleId) {
    return member.roles.cache.has(config.permissions.adminRoleId);
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
  if (!member || !commandName || !config) return false;

  // Bot owner always bypasses permission checks
  if (isBotOwner(member)) return true;

  // If permissions are disabled, allow everything
  if (!config.permissions?.enabled || !config.permissions?.usePermissions) {
    return true;
  }

  // Get permission level for this command
  const permissionLevel = config.permissions?.allowedCommands?.[commandName];

  // If command not in config, default to admin-only for safety
  if (!permissionLevel) {
    return isAdmin(member, config);
  }

  // Check permission level
  if (permissionLevel === 'everyone') {
    return true;
  }

  if (permissionLevel === 'admin') {
    return isAdmin(member, config);
  }

  // Unknown permission level - deny for safety
  return false;
}

/**
 * Check if a member is a guild admin (has ADMINISTRATOR permission or bot admin role)
 *
 * @param {GuildMember} member - Discord guild member
 * @param {Object} config - Bot configuration
 * @returns {boolean} True if member is a guild admin
 */
export function isGuildAdmin(member, config) {
  if (!member) return false;

  // Bot owner always returns true
  if (isBotOwner(member)) return true;

  // Check Discord Administrator permission
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  // Check bot admin role from config
  if (config?.permissions?.adminRoleId) {
    return member.roles.cache.has(config.permissions.adminRoleId);
  }

  return false;
}

/**
 * Check if a member is a moderator (has MANAGE_GUILD permission or bot admin role)
 *
 * @param {GuildMember} member - Discord guild member
 * @param {Object} config - Bot configuration
 * @returns {boolean} True if member is a moderator
 */
export function isModerator(member, config) {
  if (!member) return false;

  // Bot owner always returns true
  if (isBotOwner(member)) return true;

  // Check Discord Manage Guild permission
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  // Check bot admin role from config
  if (config?.permissions?.adminRoleId) {
    return member.roles.cache.has(config.permissions.adminRoleId);
  }

  return false;
}

/**
 * Get a helpful error message for permission denied
 *
 * @param {string} commandName - Name of the command
 * @returns {string} User-friendly error message
 */
export function getPermissionError(commandName) {
  return `❌ You don't have permission to use \`/${commandName}\`.\n\nThis command requires administrator access.`;
}
