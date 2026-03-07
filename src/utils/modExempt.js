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
 *  - holds any role in `config.permissions.adminRoleIds` (array), OR
 *  - holds any role in `config.permissions.moderatorRoleIds` (array), OR
 *  - holds any role ID or name listed in `config.permissions.modRoles` (array)
 *
 * Backward compat: also checks singular `adminRoleId` / `moderatorRoleId` fields
 * so old configs continue to work without migration.
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

  // Array role IDs — new schema (permissions.adminRoleIds / moderatorRoleIds)
  // Backward compat: fall back to singular field if array field is absent
  const adminRoleIds =
    config.permissions?.adminRoleIds ??
    (config.permissions?.adminRoleId ? [config.permissions.adminRoleId] : []);
  if (adminRoleIds.some((id) => member.roles.cache.has(id))) return true;

  const moderatorRoleIds =
    config.permissions?.moderatorRoleIds ??
    (config.permissions?.moderatorRoleId ? [config.permissions.moderatorRoleId] : []);
  if (moderatorRoleIds.some((id) => member.roles.cache.has(id))) return true;

  // Legacy / test-facing array of role IDs or names (permissions.modRoles)
  const modRoles = config.permissions?.modRoles ?? [];
  if (modRoles.length === 0) return false;

  return member.roles.cache.some(
    (role) => modRoles.includes(role.id) || modRoles.includes(role.name),
  );
}
