/**
 * removeRole Action Handler
 * Removes a Discord role from the member who leveled up.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/366
 */

import { info } from '../../logger.js';
import { canManageRole, recordRoleChange } from './roleUtils.js';

/**
 * Remove a role from the member.
 *
 * @param {Object} action - { type: "removeRole", roleId: string }
 * @param {Object} context - Pipeline context
 */
export async function handleRemoveRole(action, context) {
  const { member, guild } = context;
  const { roleId } = action;

  if (!canManageRole(guild, roleId)) return;
  // Note: Rate limit is checked ONCE per level-up pipeline, not per individual removal

  await member.roles.remove(roleId);
  recordRoleChange(guild.id, member.user?.id);

  info('Level-up role removed', {
    guildId: guild.id,
    userId: member.user?.id,
    roleId,
  });
}
