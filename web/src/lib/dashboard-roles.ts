/**
 * Dashboard role resolution from Discord guild permissions.
 * Mirrors backend src/api/utils/dashboardRoles.js.
 *
 * Mapping: owner → owner, ADMINISTRATOR | MANAGE_GUILD → admin,
 * MANAGE_MESSAGES | KICK_MEMBERS | BAN_MEMBERS → moderator, VIEW_CHANNEL → viewer.
 */

/** Dashboard role tiers in ascending order. */
export const DASHBOARD_ROLE_ORDER = {
  viewer: 0,
  moderator: 1,
  admin: 2,
  owner: 3,
} as const;

export type DashboardRole = keyof typeof DASHBOARD_ROLE_ORDER;

/** Discord permission bits (decimal) used for dashboard role. */
const PermissionBits = {
  ViewChannel: 0x400,
  ManageMessages: 0x2000,
  KickMembers: 0x2,
  BanMembers: 0x4,
  Administrator: 0x8,
  ManageGuild: 0x20,
} as const;

/**
 * Get the dashboard role for a user in a guild from Discord permissions and owner flag.
 */
export function getDashboardRole(permissions: string | number, owner = false): DashboardRole {
  if (owner) return 'owner';
  const perm = typeof permissions === 'string' ? Number(permissions) : permissions;
  if (Number.isNaN(perm)) return 'viewer';

  if ((perm & PermissionBits.Administrator) !== 0) return 'admin';
  if ((perm & PermissionBits.ManageGuild) !== 0) return 'admin';

  const moderatorFlags =
    PermissionBits.ManageMessages | PermissionBits.KickMembers | PermissionBits.BanMembers;
  if ((perm & moderatorFlags) !== 0) return 'moderator';

  if ((perm & PermissionBits.ViewChannel) !== 0) return 'viewer';
  return 'viewer';
}

/**
 * Check if the user has at least the required dashboard role.
 * Returns false if either role is invalid or not in the hierarchy.
 */
export function hasMinimumRole(userRole: DashboardRole, requiredRole: DashboardRole): boolean {
  const a = DASHBOARD_ROLE_ORDER[userRole as keyof typeof DASHBOARD_ROLE_ORDER];
  const b = DASHBOARD_ROLE_ORDER[requiredRole as keyof typeof DASHBOARD_ROLE_ORDER];
  if (a === undefined || b === undefined) return false;
  return a >= b;
}
