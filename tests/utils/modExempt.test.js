import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { isExempt } from '../../src/utils/modExempt.js';

/**
 * Create a mock message with configurable member permissions and roles.
 */
/**
 * Minimal Collection-like Map with .some() and .has() for Discord role cache.
 */
class FakeCollection extends Map {
  some(fn) {
    for (const value of this.values()) {
      if (fn(value)) return true;
    }
    return false;
  }
}

function createMessage({ permissions = [], roleIds = [], roleNames = [] } = {}) {
  const permBits = new PermissionsBitField(permissions);
  const rolesCache = new FakeCollection();
  for (let i = 0; i < roleIds.length; i++) {
    const id = roleIds[i];
    rolesCache.set(id, { id, name: roleNames[i] || `role-${id}` });
  }
  return {
    member: {
      permissions: permBits,
      roles: { cache: rolesCache },
    },
  };
}

describe('modExempt', () => {
  it('should exempt members with ADMINISTRATOR permission', () => {
    const msg = createMessage({ permissions: [PermissionFlagsBits.Administrator] });
    expect(isExempt(msg, { permissions: {} })).toBe(true);
  });

  it('should exempt members with adminRoleId', () => {
    const msg = createMessage({ roleIds: ['admin-role'] });
    expect(isExempt(msg, { permissions: { adminRoleId: 'admin-role' } })).toBe(true);
  });

  it('should exempt members with moderatorRoleId', () => {
    const msg = createMessage({ roleIds: ['mod-role'] });
    expect(isExempt(msg, { permissions: { moderatorRoleId: 'mod-role' } })).toBe(true);
  });

  it('should exempt members with a role name in modRoles array', () => {
    const msg = createMessage({ roleIds: ['r1'], roleNames: ['Moderator'] });
    expect(isExempt(msg, { permissions: { modRoles: ['Moderator'] } })).toBe(true);
  });

  it('should return false for non-exempt members', () => {
    const msg = createMessage({ roleIds: ['regular'] });
    expect(isExempt(msg, { permissions: { adminRoleId: 'admin', modRoles: [] } })).toBe(false);
  });

  it('should return false when message has no member', () => {
    expect(isExempt({ member: null }, { permissions: {} })).toBe(false);
  });
});
