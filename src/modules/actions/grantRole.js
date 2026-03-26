/**
 * grantRole Action Handler
 * Adds a Discord role to the member who leveled up.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/366
 */

import { info, warn } from '../../logger.js';
import { canManageRole, checkRoleRateLimit, recordRoleChange } from './roleUtils.js';

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
  // Note: Rate limit is checked ONCE before the pipeline, not per-action

  // Replace mode: remove other XP-managed roles before granting
  if (!config.roleRewards.stackRoles) {
    for (const [id] of member.roles.cache) {
      if (xpManagedRoles.has(id) && id !== roleId) {
        if (!canManageRole(guild, id)) continue;
        // Check rate limit before each removal in replace mode
        if (!checkRoleRateLimit(guild.id, member.user?.id)) continue;
        try {
          await member.roles.remove(id);
          recordRoleChange(guild.id, member.user?.id);
        } catch (err) {
          // Log and continue — don't block granting the new role
          warn('Failed to remove role in replace mode', {
            guildId: guild.id,
            userId: member.user?.id,
            roleId: id,
            error: err.message,
          });
        }
      }
    }
  }

  await member.roles.add(roleId);
  recordRoleChange(guild.id, member.user?.id);

  // Update template context for downstream actions
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
