/**
 * grantRole Action Handler
 * Adds a Discord role to the member who leveled up.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/366
 */

import { info, warn } from '../../logger.js';
import { canManageRole, checkRoleRateLimit, recordRoleChange } from './roleUtils.js';

/**
 * Remove stale XP-managed roles in replace mode (stackRoles: false).
 * @param {Object} member - Discord guild member
 * @param {Object} guild - Discord guild
 * @param {string} newRoleId - The role being granted (skip removal)
 * @param {Set} xpManagedRoles - Set of XP-managed role IDs
 */
async function removeStaleRoles(member, guild, newRoleId, xpManagedRoles) {
  for (const [id] of member.roles.cache) {
    if (!xpManagedRoles.has(id) || id === newRoleId) continue;
    if (!canManageRole(guild, id)) continue;
    if (!checkRoleRateLimit(guild.id, member.user?.id)) continue;
    try {
      await member.roles.remove(id);
      recordRoleChange(guild.id, member.user?.id);
    } catch (err) {
      warn('Failed to remove role in replace mode', {
        guildId: guild.id,
        userId: member.user?.id,
        roleId: id,
        error: err.message,
      });
    }
  }
}

/**
 * Grant a role to the member.
 * In replace mode (stackRoles: false), removes all other XP-managed roles first.
 *
 * @param {Object} action - { type: "grantRole", roleId: string }
 * @param {Object} context - Pipeline context
 */
export async function handleGrantRole(action, context) {
  const { member, guild, config, xpManagedRoles, templateContext } = context;
  const { roleId } = action;

  if (!canManageRole(guild, roleId)) return;

  if (!config.roleRewards.stackRoles) {
    await removeStaleRoles(member, guild, roleId, xpManagedRoles);
  }

  await member.roles.add(roleId);
  recordRoleChange(guild.id, member.user?.id);

  const role = guild.roles.cache.get(roleId);
  templateContext.roleName = role?.name ?? '';
  templateContext.roleId = roleId;
  templateContext.roleMention = `<@&${roleId}>`;

  info('Level-up role granted', {
    guildId: guild.id,
    userId: member.user?.id,
    roleId,
  });
}
