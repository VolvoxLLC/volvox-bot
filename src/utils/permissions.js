/**
 * Permission checking utilities for Bill Bot
 *
 * Provides centralized permission checks for commands and features.
 */

import { PermissionFlagsBits } from 'discord.js';

/**
 * Check if a member is an admin
 *
 * @param {GuildMember} member - Discord guild member
 * @param {Object} config - Bot configuration
 * @returns {boolean} True if member is admin
 */
export function isAdmin(member, config) {
  if (!member || !config) return false;

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
 * Get a helpful error message for permission denied
 *
 * @param {string} commandName - Name of the command
 * @returns {string} User-friendly error message
 */
export function getPermissionError(commandName) {
  return `❌ You don't have permission to use \`/${commandName}\`.\n\nThis command requires administrator access.`;
}
