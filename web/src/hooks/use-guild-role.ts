import type { MutualGuild } from '@/types/discord';

/**
 * Discord permission bits relevant to dashboard access levels.
 */
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;
const KICK_MEMBERS = 0x2n;
const BAN_MEMBERS = 0x4n;
const MODERATE_MEMBERS = 0x10000000000n; // 1 << 40

/**
 * Dashboard role hierarchy (highest to lowest access).
 *   owner      — guild owner
 *   admin      — ADMINISTRATOR or MANAGE_GUILD permission
 *   moderator  — KICK_MEMBERS, BAN_MEMBERS, or MODERATE_MEMBERS permission
 *   viewer     — member with no elevated permissions
 */
export type GuildDashboardRole = 'owner' | 'admin' | 'moderator' | 'viewer';

/**
 * Derive the user's dashboard role for a given guild from the permissions
 * already embedded in the MutualGuild response (no extra API call needed).
 *
 * @param guild - The mutual guild object returned by /api/guilds
 * @returns The user's dashboard role in that guild
 */
export function getGuildDashboardRole(guild: MutualGuild): GuildDashboardRole {
  if (guild.access === 'bot-owner') return 'admin';
  if (guild.access === 'admin') return 'admin';
  if (guild.access === 'moderator') return 'moderator';
  if (guild.access === 'viewer') return 'viewer';
  if (guild.owner) return 'owner';

  let perms: bigint;
  try {
    perms = BigInt(guild.permissions);
  } catch {
    return 'viewer';
  }

  if ((perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD) {
    return 'admin';
  }

  if (
    (perms & KICK_MEMBERS) === KICK_MEMBERS ||
    (perms & BAN_MEMBERS) === BAN_MEMBERS ||
    (perms & MODERATE_MEMBERS) === MODERATE_MEMBERS
  ) {
    return 'moderator';
  }

  return 'viewer';
}

/**
 * Returns true when the user can access the management dashboard for this guild.
 * Manageable roles: owner, admin, moderator.
 * Non-manageable roles: viewer (member-only).
 */
export function isGuildManageable(guild: MutualGuild): boolean {
  const role = getGuildDashboardRole(guild);
  return role === 'owner' || role === 'admin' || role === 'moderator';
}
