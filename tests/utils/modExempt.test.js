import { describe, expect, it, vi } from 'vitest';

vi.mock('discord.js', () => ({
  PermissionFlagsBits: { Administrator: 8n },
}));

import { isExempt } from '../../src/utils/modExempt.js';

/**
 * Build a minimal fake message with configurable member properties.
 */
function makeMessage({ hasMember = true, isAdmin = false, roleIds = [], roleNames = [] } = {}) {
  if (!hasMember) return { member: null };

  const roles = new Map([
    ...roleIds.map((id) => [id, { id, name: `role-${id}` }]),
    ...roleNames.map((name) => [`id-${name}`, { id: `id-${name}`, name }]),
  ]);

  return {
    member: {
      permissions: {
        has: vi.fn().mockReturnValue(isAdmin),
      },
      roles: {
        cache: {
          has: vi.fn((id) => roles.has(id)),
          some: vi.fn((fn) => [...roles.values()].some(fn)),
        },
      },
    },
  };
}

describe('isExempt', () => {
  it('should return false when member is null', () => {
    const msg = makeMessage({ hasMember: false });
    expect(isExempt(msg, {})).toBe(false);
  });

  it('should return true when member has ADMINISTRATOR permission', () => {
    const msg = makeMessage({ isAdmin: true });
    expect(isExempt(msg, {})).toBe(true);
  });

  it('should return false when member has no roles and no perms', () => {
    const msg = makeMessage({ isAdmin: false });
    expect(isExempt(msg, {})).toBe(false);
  });

  it('should return true when member has adminRoleId', () => {
    const msg = makeMessage({ isAdmin: false, roleIds: ['admin-role-id'] });
    const config = { permissions: { adminRoleId: 'admin-role-id' } };
    expect(isExempt(msg, config)).toBe(true);
  });

  it('should return false when adminRoleId is set but member does not have it', () => {
    const msg = makeMessage({ isAdmin: false, roleIds: ['other-role'] });
    const config = { permissions: { adminRoleId: 'admin-role-id' } };
    expect(isExempt(msg, config)).toBe(false);
  });

  it('should return true when member has moderatorRoleId', () => {
    const msg = makeMessage({ isAdmin: false, roleIds: ['mod-role-id'] });
    const config = { permissions: { moderatorRoleId: 'mod-role-id' } };
    expect(isExempt(msg, config)).toBe(true);
  });

  it('should return false when moderatorRoleId is set but member does not have it', () => {
    const msg = makeMessage({ isAdmin: false, roleIds: [] });
    const config = { permissions: { moderatorRoleId: 'mod-role-id' } };
    expect(isExempt(msg, config)).toBe(false);
  });

  it('should return true when member has a role ID in modRoles array', () => {
    const msg = makeMessage({ isAdmin: false, roleIds: ['custom-mod'] });
    const config = { permissions: { modRoles: ['custom-mod'] } };
    expect(isExempt(msg, config)).toBe(true);
  });

  it('should return true when member has a role NAME in modRoles array', () => {
    const msg = makeMessage({ isAdmin: false, roleNames: ['Moderator'] });
    const config = { permissions: { modRoles: ['Moderator'] } };
    expect(isExempt(msg, config)).toBe(true);
  });

  it('should return false when modRoles is empty array', () => {
    const msg = makeMessage({ isAdmin: false, roleIds: ['some-role'] });
    const config = { permissions: { modRoles: [] } };
    expect(isExempt(msg, config)).toBe(false);
  });

  it('should return false when member has no matching role in modRoles', () => {
    const msg = makeMessage({ isAdmin: false, roleIds: ['other-role'] });
    const config = { permissions: { modRoles: ['custom-mod', 'Moderator'] } };
    expect(isExempt(msg, config)).toBe(false);
  });

  it('should return false when config has no permissions key', () => {
    const msg = makeMessage({ isAdmin: false });
    expect(isExempt(msg, {})).toBe(false);
  });
});
