/**
 * Permission checking utilities for Bill Bot
 *
 * Provides centralized permission checks for commands and features.
 */

import { PermissionFlagsBits } from 'discord.js';

/** Fallback bot owner IDs when config.permissions.botOwners is not set */
const DEFAULT_BOT_OWNERS = ['191633014441115648'];

/**
 * Check if a member is a bot owner
 *
 * @param {GuildMember} member - Discord guild member
 * @param {Object} config - Bot configuration
 * @returns {boolean} True if member is a bot owner
 */
function isBotOwner(member, config) {
  const owners = config?.permissions?.botOwners || DEFAULT_BOT_OWNERS;
  const userId = member?.id || member?.user?.id;
  return userId != null && owners.includes(userId);
}

/**
 * Check if a member is an admin
 *
 * @param {GuildMember} member - Discord guild member
 * @param {Object} config - Bot configuration
 * @returns {boolean} True if member is admin
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
  return isAdmin(member, config);
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
  if (isBotOwner(member, config)) return true;

  if (!config) return false;

  // Check Discord Manage Guild permission
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  // Check bot admin role from config
  if (config.permissions?.adminRoleId) {
    return member.roles.cache.has(config.permissions.adminRoleId);
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
