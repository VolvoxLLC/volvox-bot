/**
 * Role Action Utilities
 * Permission checks, rate limiting, and shared role logic for XP level-up actions.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/366
 */

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
  if (!me.permissions.has('ManageRoles')) {
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
 * Remove roles granted at levels above the new level.
 * Called when XP is manually reduced and removeOnLevelDown is enabled.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {number} newLevel
 * @param {Object} xpConfig - The resolved `config.xp` section.
 */
export async function enforceRoleLevelDown(member, newLevel, xpConfig) {
  const guild = member.guild;

  for (const entry of xpConfig.levelActions ?? []) {
    if (entry.level <= newLevel) continue;

    for (const action of entry.actions ?? []) {
      if (action.type !== 'grantRole' || !action.roleId) continue;
      if (!member.roles.cache.has(action.roleId)) continue;
      if (!canManageRole(guild, action.roleId)) continue;
      if (!checkRoleRateLimit(guild.id, member.user.id)) continue;

      await member.roles.remove(action.roleId);
      recordRoleChange(guild.id, member.user.id);
    }
  }
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
