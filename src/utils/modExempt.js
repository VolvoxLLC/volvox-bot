/**
 * Shared mod/admin exemption check.
 * Used by rate limiting and link filter modules to avoid duplicating
 * the same isExempt logic in both places.
 */

import { PermissionFlagsBits } from 'discord.js';

/**
 * Check whether a message author has mod/admin permissions and should be
 * exempted from automated moderation actions.
 *
 * Exempt if the member:
 *  - has the ADMINISTRATOR Discord permission, OR
 *  - holds the role at `config.permissions.adminRoleId` (singular ID), OR
 *  - holds the role at `config.permissions.moderatorRoleId` (singular ID), OR
 *  - holds any role ID or name listed in `config.permissions.modRoles` (array)
 *
 * @param {import('discord.js').Message} message
 * @param {Object} config - Merged guild config
 * @returns {boolean}
 */
export function isExempt(message, config) {
  const member = message.member;
  if (!member) return false;

  // ADMINISTRATOR permission bypasses everything
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  // Singular role IDs — the actual config schema (permissions.adminRoleId / moderatorRoleId)
  const adminRoleId = config.permissions?.adminRoleId;
  const moderatorRoleId = config.permissions?.moderatorRoleId;
  if (adminRoleId && member.roles.cache.has(adminRoleId)) return true;
  if (moderatorRoleId && member.roles.cache.has(moderatorRoleId)) return true;

  // Legacy / test-facing array of role IDs or names (permissions.modRoles)
  const modRoles = config.permissions?.modRoles ?? [];
  if (modRoles.length === 0) return false;

  return member.roles.cache.some(
    (role) => modRoles.includes(role.id) || modRoles.includes(role.name),
  );
}
