/**
 * Dashboard role derivation from Discord guild permission bitfield.
 * Must stay in sync with backend (src/api/routes/guilds.js permissionsToDashboardRole).
 */

/** Discord permission flags (decimal). */
const ADMINISTRATOR = 0x8;
const MANAGE_GUILD = 0x20;
const VIEW_CHANNEL = 0x400;
const MANAGE_MESSAGES = 0x2000;
const KICK_MEMBERS = 0x2;
const BAN_MEMBERS = 0x4;

export type DashboardRole = 'viewer' | 'moderator' | 'admin' | 'owner';

const ROLE_ORDER: Record<DashboardRole, number> = {
  viewer: 0,
  moderator: 1,
  admin: 2,
  owner: 3,
};

/**
 * Map Discord guild permission bitfield to dashboard role (no owner — owner is bot owner from backend).
 */
export function permissionsToDashboardRole(permissions: string): DashboardRole | null {
  const p = Number(permissions);
  if (Number.isNaN(p)) return null;
  if ((p & ADMINISTRATOR) !== 0 || (p & MANAGE_GUILD) !== 0) return 'admin';
  if (
    (p & MANAGE_MESSAGES) !== 0 ||
    (p & KICK_MEMBERS) !== 0 ||
    (p & BAN_MEMBERS) !== 0
  ) {
    return 'moderator';
  }
  if ((p & VIEW_CHANNEL) !== 0) return 'viewer';
  return null;
}

export function hasMinimumRole(role: DashboardRole | null, minRequired: DashboardRole): boolean {
  if (role === null) return false;
  return ROLE_ORDER[role] >= ROLE_ORDER[minRequired];
}

/** Minimum role required per nav item (sidebar). */
export const NAV_MIN_ROLE: Record<string, DashboardRole> = {
  '/dashboard': 'viewer',
  '/dashboard/moderation': 'moderator',
  '/dashboard/temp-roles': 'moderator',
  '/dashboard/ai': 'viewer',
  '/dashboard/members': 'admin',
  '/dashboard/conversations': 'admin',
  '/dashboard/tickets': 'admin',
  '/dashboard/config': 'admin',
  '/dashboard/audit-log': 'admin',
  '/dashboard/performance': 'viewer',
  '/dashboard/logs': 'admin',
  '/dashboard/settings': 'admin',
};

export function canAccessRoute(role: DashboardRole | null, path: string): boolean {
  if (role === null) return false;
  const min = NAV_MIN_ROLE[path];
  if (!min) return true;
  return hasMinimumRole(role, min);
}
