/**
 * @typedef {object} MockRole
 * @property {string} id - Discord role ID.
 * @property {string} name - Discord role display name.
 */

/**
 * @typedef {string | MockRole} MockRoleDefinition
 */

/**
 * @typedef {object} MockRoleCollection
 * @property {(mapper: (role: MockRole, index: number, array: MockRole[]) => unknown) => unknown[]} map
 */

/**
 * @typedef {object} MockRoleCache
 * @property {(predicate: (role: MockRole, index: number, array: MockRole[]) => boolean) => MockRoleCollection} filter
 */

/**
 * @typedef {object} MockGuildMember
 * @property {{ id: string }} guild
 * @property {{ cache: MockRoleCache }} roles
 */

/**
 * Normalize role test definitions so call sites can pass either role IDs or role-like objects.
 * @param {MockRoleDefinition} roleDef - Role ID string or mock role object.
 * @returns {MockRole}
 */
function normalizeRole(roleDef) {
  if (typeof roleDef === 'string') {
    return { id: roleDef, name: `role-${roleDef}` };
  }

  return roleDef;
}

/**
 * Create a minimal Discord.js-like role cache that supports filter().map().
 * The guild ID role is included as @everyone so production eligibility code can filter it out.
 * @param {MockRoleDefinition[]} roleDefs - Role IDs or role-like objects assigned to the member.
 * @param {string} [guildId='g1'] - Guild ID used for the @everyone role.
 * @returns {MockRoleCache}
 */
export function makeRoleCache(roleDefs, guildId = 'g1') {
  const roles = [{ id: guildId, name: '@everyone' }, ...roleDefs.map(normalizeRole)];

  return {
    filter: (predicate) => {
      const filtered = roles.filter((role, index, array) => predicate(role, index, array));
      return {
        map: (mapper) => filtered.map((role, index, array) => mapper(role, index, array)),
      };
    },
  };
}

/**
 * Create a minimal GuildMember mock with a Discord.js-like roles cache.
 * @param {MockRoleDefinition[]} roleDefs - Role IDs or role-like objects assigned to the member.
 * @param {string} [guildId='g1'] - Guild ID used for the member and @everyone role.
 * @returns {MockGuildMember}
 */
export function makeMemberWithRoles(roleDefs, guildId = 'g1') {
  return {
    guild: { id: guildId },
    roles: { cache: makeRoleCache(roleDefs, guildId) },
  };
}

/**
 * Create a GuildMember mock using the triage-config tests' historical default guild ID.
 * @param {MockRoleDefinition[]} roleDefs - Role IDs or role-like objects assigned to the member.
 * @param {string} [guildId='guild-1'] - Guild ID used for the member and @everyone role.
 * @returns {MockGuildMember}
 */
export function makeMember(roleDefs, guildId = 'guild-1') {
  return makeMemberWithRoles(roleDefs, guildId);
}
