/**
 * Role Action Utilities
 * Permission checks, rate limiting, and shared role logic for XP level-up actions.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/366
 */

import { PermissionFlagsBits } from 'discord.js';
import { warn } from '../../logger.js';

/** Max role changes per user per window. */
const MAX_ROLE_CHANGES = 2;

/** Sliding window duration in milliseconds. */
const RATE_WINDOW_MS = 60_000;

/**
 * In-memory rate limiter: `${guildId}:${userId}` → array of timestamps.
 * @type {Map<string, number[]>}
 */
const roleLimits = new Map();

/**
 * Check whether the bot can manage a specific role in a guild.
 * Logs a warning and returns false if the bot lacks permissions or the role is too high.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} roleId
 * @returns {boolean}
 */
export function canManageRole(guild, roleId) {
  const me = guild.members.me;
  if (!me) return false;
  // Use PermissionFlagsBits.ManageRoles instead of string 'ManageRoles'
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    warn('Cannot manage role — bot lacks MANAGE_ROLES permission', {
      guildId: guild.id,
      roleId,
    });
    return false;
  }

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    warn('Cannot manage role — role not found in guild cache', {
      guildId: guild.id,
      roleId,
    });
    return false;
  }

  if (role.position >= me.roles.highest.position) {
    warn('Cannot manage role — role at or above bot in hierarchy', {
      guildId: guild.id,
      roleId,
      rolePosition: role.position,
      botHighest: me.roles.highest.position,
    });
    return false;
  }

  return true;
}

/**
 * Check whether a role change is allowed under the rate limit.
 * Does NOT record the change — call `recordRoleChange` after a successful change.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean} true if the change is allowed.
 */
export function checkRoleRateLimit(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const timestamps = roleLimits.get(key);
  if (!timestamps) return true;

  const now = Date.now();
  const recent = timestamps.filter((ts) => now - ts < RATE_WINDOW_MS);
  roleLimits.set(key, recent);

  if (recent.length >= MAX_ROLE_CHANGES) {
    warn('Role change rate limit exceeded — skipping', {
      guildId,
      userId,
      recentChanges: recent.length,
      windowMs: RATE_WINDOW_MS,
    });
    return false;
  }

  return true;
}

/**
 * Record a successful role change for rate limiting.
 *
 * @param {string} guildId
 * @param {string} userId
 */
export function recordRoleChange(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const timestamps = roleLimits.get(key) ?? [];
  timestamps.push(Date.now());
  roleLimits.set(key, timestamps);
}

/**
 * Evict stale rate limit entries. Call periodically to prevent memory leaks.
 * Exported for testability.
 */
export function sweepRoleLimits() {
  const now = Date.now();
  for (const [key, timestamps] of roleLimits) {
    const recent = timestamps.filter((ts) => now - ts < RATE_WINDOW_MS);
    if (recent.length === 0) {
      roleLimits.delete(key);
    } else {
      roleLimits.set(key, recent);
    }
  }
}

/**
 * Collect roles to remove during level-down.
 * @param {import('discord.js').GuildMember} member
 * @param {number} newLevel
 * @param {Object} xpConfig
 * @returns {Array<{roleId: string, entry: Object}>}
 */
function collectRolesToRemove(member, newLevel, xpConfig) {
  const rolesToRemove = [];
  const seenRoleIds = new Set();

  // Collect roles from levelActions (above newLevel)
  for (const entry of xpConfig.levelActions ?? []) {
    if (entry.level <= newLevel) continue;

    for (const action of entry.actions ?? []) {
      if (action.type !== 'grantRole' || !action.roleId) continue;
      if (!member.roles.cache.has(action.roleId)) continue;
      if (seenRoleIds.has(action.roleId)) continue;

      seenRoleIds.add(action.roleId);
      rolesToRemove.push({ roleId: action.roleId, entry });
    }
  }

  return rolesToRemove;
}

/**
 * Remove a single role with error handling.
 * @param {import('discord.js').GuildMember} member
 * @param {string} roleId
 * @param {Object} entry
 * @returns {Promise<boolean>} true if removed successfully
 */
async function removeSingleRole(member, roleId, entry) {
  const guild = member.guild;

  if (!canManageRole(guild, roleId)) {
    return false;
  }

  try {
    await member.roles.remove(roleId);
    recordRoleChange(guild.id, member.user.id);
    return true;
  } catch (err) {
    warn('Failed to remove role during level-down', {
      guildId: guild.id,
      userId: member.user.id,
      roleId,
      level: entry.level,
      error: err.message,
    });
    return false;
  }
}

/**
 * Collect manageable role IDs from the roles-to-remove list.
 * @param {import('discord.js').Guild} guild
 * @param {Array<{roleId: string, entry: Object}>} rolesToRemove
 * @returns {string[]} Deduplicated array of manageable role IDs.
 */
function collectManageableRoleIds(guild, rolesToRemove) {
  const roleIds = [];
  for (const { roleId } of rolesToRemove) {
    if (canManageRole(guild, roleId)) {
      roleIds.push(roleId);
    }
  }
  return [...new Set(roleIds)];
}

/**
 * Batch-remove roles, falling back to individual removal on failure.
 * @param {import('discord.js').GuildMember} member
 * @param {string[]} uniqueRoleIds
 * @param {Array<{roleId: string, entry: Object}>} rolesToRemove
 */
async function batchRemoveRoles(member, uniqueRoleIds, rolesToRemove) {
  try {
    await member.roles.remove(uniqueRoleIds);
    for (const _roleId of uniqueRoleIds) {
      recordRoleChange(member.guild.id, member.user.id);
    }
  } catch (err) {
    warn('Batch role removal failed — falling back to individual removal', {
      guildId: member.guild.id,
      userId: member.user.id,
      roleIds: uniqueRoleIds,
      error: err.message,
    });

    for (const { roleId, entry } of rolesToRemove) {
      await removeSingleRole(member, roleId, entry);
    }
  }
}

/**
 * Find the highest-level grantRole at or below the given level.
 * @param {Object} xpConfig
 * @param {number} newLevel
 * @returns {string|null} The role ID, or null if none found.
 */
function findHighestGrantRole(xpConfig, newLevel) {
  let highestGrantRole = null;
  let highestLevel = -1;

  for (const entry of xpConfig.levelActions ?? []) {
    if (entry.level > newLevel) continue;
    for (const action of entry.actions ?? []) {
      if (action.type === 'grantRole' && action.roleId && entry.level > highestLevel) {
        highestLevel = entry.level;
        highestGrantRole = action.roleId;
      }
    }
  }

  return highestGrantRole;
}

/**
 * In replace mode, restore the highest role the member should have at newLevel.
 * @param {import('discord.js').GuildMember} member
 * @param {number} newLevel
 * @param {Object} xpConfig
 */
async function restoreHighestRoleForReplaceMode(member, newLevel, xpConfig) {
  if (xpConfig.roleRewards?.stackRoles) return;

  const highestGrantRole = findHighestGrantRole(xpConfig, newLevel);
  if (!highestGrantRole || !canManageRole(member.guild, highestGrantRole)) return;

  try {
    await member.roles.add(highestGrantRole);
    recordRoleChange(member.guild.id, member.user.id);
  } catch (err) {
    warn('Failed to restore highest role in replace mode', {
      guildId: member.guild.id,
      userId: member.user.id,
      roleId: highestGrantRole,
      error: err.message,
    });
  }
}

/**
 * Remove roles granted at levels above the new level.
 * Called when XP is manually reduced and removeOnLevelDown is enabled.
 * Uses batch removal with error handling per role.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {number} newLevel
 * @param {Object} xpConfig - The resolved `config.xp` section.
 */
export async function enforceRoleLevelDown(member, newLevel, xpConfig) {
  // Check rate limit ONCE for the level-down event
  if (!checkRoleRateLimit(member.guild.id, member.user.id)) {
    warn('Rate limit exceeded for level-down — skipping role removal', {
      guildId: member.guild.id,
      userId: member.user.id,
    });
    return;
  }

  const rolesToRemove = collectRolesToRemove(member, newLevel, xpConfig);
  if (rolesToRemove.length === 0) return;

  const uniqueRoleIds = collectManageableRoleIds(member.guild, rolesToRemove);
  if (uniqueRoleIds.length === 0) return;

  await batchRemoveRoles(member, uniqueRoleIds, rolesToRemove);

  // Replace mode: restore the highest role that should be granted at newLevel
  await restoreHighestRoleForReplaceMode(member, newLevel, xpConfig);
}

// Periodic sweep — same pattern as reputation.js cooldowns.
setInterval(sweepRoleLimits, 5 * 60 * 1000).unref();

/**
 * Collect all role IDs managed by XP level actions (grantRole / removeRole).
 * Used for stack-vs-replace logic.
 *
 * @param {Object} config - The resolved `config.xp` section.
 * @returns {Set<string>} Set of role IDs.
 */
export function collectXpManagedRoles(config) {
  const roleIds = new Set();
  for (const entry of config.levelActions ?? []) {
    for (const action of entry.actions ?? []) {
      if ((action.type === 'grantRole' || action.type === 'removeRole') && action.roleId) {
        roleIds.add(action.roleId);
      }
    }
  }
  // Also collect roles from defaultActions
  for (const action of config.defaultActions ?? []) {
    if ((action.type === 'grantRole' || action.type === 'removeRole') && action.roleId) {
      roleIds.add(action.roleId);
    }
  }
  return roleIds;
}
