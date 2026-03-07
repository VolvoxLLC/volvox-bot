/**
 * Dashboard role resolution from Discord guild permissions.
 *
 * Maps Discord permission bitfield + guild owner flag to dashboard tiers:
 * - owner: guild owner (Discord API owner: true)
 * - admin: ADMINISTRATOR or MANAGE_GUILD
 * - moderator: MANAGE_MESSAGES or KICK_MEMBERS or BAN_MEMBERS
 * - viewer: VIEW_CHANNEL (or any member of the guild)
 */

import { PermissionFlagsBits } from 'discord.js';

/** Dashboard role tiers in ascending order (viewer = 0, owner = 3). */
export const DASHBOARD_ROLE_ORDER = Object.freeze({
  viewer: 0,
  moderator: 1,
  admin: 2,
  owner: 3,
});

/** @type {'viewer'|'moderator'|'admin'|'owner'} */
const ROLES = ['viewer', 'moderator', 'admin', 'owner'];

/**
 * Get the dashboard role for a user in a guild from Discord permissions and owner flag.
 *
 * @param {number|string} permissions - Discord permission bitfield (from /users/@me/guilds).
 * @param {boolean} [owner] - Whether the user is the guild owner (from Discord API).
 * @returns {'viewer'|'moderator'|'admin'|'owner'} The highest dashboard role the user has.
 */
export function getDashboardRole(permissions, owner = false) {
  if (owner) return 'owner';

  const perm = Number(permissions);
  if (Number.isNaN(perm)) return 'viewer';

  // Admin: ADMINISTRATOR or MANAGE_GUILD
  if ((perm & Number(PermissionFlagsBits.Administrator)) !== 0) return 'admin';
  if ((perm & Number(PermissionFlagsBits.ManageGuild)) !== 0) return 'admin';

  // Moderator: any of MANAGE_MESSAGES, KICK_MEMBERS, BAN_MEMBERS
  const moderatorFlags =
    Number(PermissionFlagsBits.ManageMessages) |
    Number(PermissionFlagsBits.KickMembers) |
    Number(PermissionFlagsBits.BanMembers);
  if ((perm & moderatorFlags) !== 0) return 'moderator';

  // Viewer: VIEW_CHANNEL (or treat as viewer if they're in the guild list at all)
  if ((perm & Number(PermissionFlagsBits.ViewChannel)) !== 0) return 'viewer';

  return 'viewer';
}

/**
 * Check if the user has at least the required dashboard role.
 *
 * @param {string} userRole - User's dashboard role ('viewer'|'moderator'|'admin'|'owner').
 * @param {string} requiredRole - Minimum required role.
 * @returns {boolean} True if userRole >= requiredRole in the hierarchy.
 */
export function hasMinimumRole(userRole, requiredRole) {
  const a = DASHBOARD_ROLE_ORDER[userRole];
  const b = DASHBOARD_ROLE_ORDER[requiredRole];
  if (a === undefined || b === undefined) return false;
  return a >= b;
}

export { ROLES };
