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
 * @property {(predicate: (role: MockRole, key: string, collection: MockRoleCollection) => boolean) => MockRoleCollection} filter
 * @property {(mapper: (role: MockRole, key: string, collection: MockRoleCollection) => unknown) => unknown[]} map
 */

/**
 * @typedef {MockRoleCollection} MockRoleCache
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
 * Create a small Discord.js Collection-shaped wrapper for role mocks.
 * @param {MockRole[]} roles - Ordered array of role mocks.
 * @returns {MockRoleCollection}
 */
function makeRoleCollection(roles) {
  const collection = {
    filter: (predicate) =>
      makeRoleCollection(roles.filter((role) => predicate(role, role.id, collection))),
    map: (mapper) => roles.map((role) => mapper(role, role.id, collection)),
  };

  return collection;
}

/**
 * Create a minimal Discord.js-like role cache that supports filter().map().
 * The guild ID role is included as @everyone so production eligibility code can filter it out.
 * @param {MockRoleDefinition[]} roleDefs - Role IDs or role-like objects assigned to the member.
 * @param {string} [guildId='guild-1'] - Guild ID used for the @everyone role.
 * @returns {MockRoleCache}
 */
export function makeRoleCache(roleDefs, guildId = 'guild-1') {
  const roles = [{ id: guildId, name: '@everyone' }, ...roleDefs.map(normalizeRole)];

  return makeRoleCollection(roles);
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
