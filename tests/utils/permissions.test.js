import { describe, expect, it, vi } from 'vitest';

// Mock discord.js before importing the module
vi.mock('discord.js', () => ({
  PermissionFlagsBits: {
    Administrator: 1n << 3n,
    ManageGuild: 1n << 5n,
  },
}));

import { PermissionFlagsBits } from 'discord.js';
import {
  getPermissionError,
  hasPermission,
  isAdmin,
  isBotOwner,
  isGuildAdmin,
  isModerator,
  mergeRoleIds,
} from '../../src/utils/permissions.js';

const BOT_OWNER_ID = '191633014441115648';

describe('isAdmin', () => {
  it('should return false for null member or config', () => {
    expect(isAdmin(null, {})).toBe(false);
    expect(isAdmin({}, null)).toBe(false);
    expect(isAdmin(null, null)).toBe(false);
  });

  it('should return true for bot owner via member.id', () => {
    process.env.BOT_OWNER_IDS = BOT_OWNER_ID;
    const member = {
      id: BOT_OWNER_ID,
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isAdmin(member, {})).toBe(true);
    expect(member.permissions.has).not.toHaveBeenCalled();
  });

  it('should return true for bot owner via member.user.id', () => {
    process.env.BOT_OWNER_IDS = BOT_OWNER_ID;
    const member = {
      user: { id: BOT_OWNER_ID },
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isAdmin(member, {})).toBe(true);
  });

  it('should return true for bot owner from BOT_OWNER_IDS env var', () => {
    const customOwnerId = '999999999999999999';
    process.env.BOT_OWNER_IDS = customOwnerId;
    const member = {
      id: customOwnerId,
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isAdmin(member, {})).toBe(true);
  });

  it('should not treat owner as bot owner when BOT_OWNER_IDS is not set', () => {
    delete process.env.BOT_OWNER_IDS;
    const member = {
      id: BOT_OWNER_ID,
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isAdmin(member, {})).toBe(false);
  });

  it('should not treat owner as bot owner when BOT_OWNER_IDS is empty string', () => {
    process.env.BOT_OWNER_IDS = '';
    const member = {
      id: BOT_OWNER_ID,
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isAdmin(member, {})).toBe(false);
  });

  it('should return true for members with Administrator permission', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(true) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isAdmin(member, {})).toBe(true);
  });

  it('should return true for members with admin role (adminRoleIds array)', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(true) } },
    };
    const config = { permissions: { adminRoleIds: ['123456'] } };
    expect(isAdmin(member, config)).toBe(true);
    expect(member.roles.cache.has).toHaveBeenCalledWith('123456');
  });

  it('should return true for members with any of multiple admin roles', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: {
        cache: {
          has: vi.fn().mockImplementation((id) => id === '999999'),
        },
      },
    };
    const config = { permissions: { adminRoleIds: ['123456', '999999'] } };
    expect(isAdmin(member, config)).toBe(true);
  });

  it('should return false for regular members', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = { permissions: { adminRoleIds: ['123456'] } };
    expect(isAdmin(member, config)).toBe(false);
  });

  it('should return false when no adminRoleIds configured and not Admin', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn() } },
    };
    expect(isAdmin(member, {})).toBe(false);
  });

  it('should support backward compat: singular adminRoleId still works', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(true) } },
    };
    const config = { permissions: { adminRoleId: '123456' } };
    expect(isAdmin(member, config)).toBe(true);
    expect(member.roles.cache.has).toHaveBeenCalledWith('123456');
  });

  it('should find legacy adminRoleId even when adminRoleIds:[] default is present (merged config)', () => {
    // This is the real breaking case: defaults merge in adminRoleIds:[] before guild overrides
    // apply, so the config has BOTH fields. ?? alone would miss the legacy value.
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: (id) => id === 'legacy-role-789' } },
    };
    const config = { permissions: { adminRoleIds: [], adminRoleId: 'legacy-role-789' } };
    expect(isAdmin(member, config)).toBe(true);
  });
});

describe('hasPermission', () => {
  it('should return false for null member, commandName, or config', () => {
    expect(hasPermission(null, 'ping', {})).toBe(false);
    expect(hasPermission({}, null, {})).toBe(false);
    expect(hasPermission({}, 'ping', null)).toBe(false);
  });

  it('should return true for bot owner regardless of permission settings', () => {
    process.env.BOT_OWNER_IDS = BOT_OWNER_ID;
    const member = { id: BOT_OWNER_ID };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: { config: 'admin' },
      },
    };
    expect(hasPermission(member, 'config', config)).toBe(true);
  });

  it('should not bypass for owner when BOT_OWNER_IDS is not set', () => {
    delete process.env.BOT_OWNER_IDS;
    const member = {
      id: BOT_OWNER_ID,
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: { config: 'admin' },
      },
    };
    expect(hasPermission(member, 'config', config)).toBe(false);
  });

  it('should not bypass for owner when BOT_OWNER_IDS is empty string', () => {
    process.env.BOT_OWNER_IDS = '';
    const member = {
      id: BOT_OWNER_ID,
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: { config: 'admin' },
      },
    };
    expect(hasPermission(member, 'config', config)).toBe(false);
  });

  it('should return true when permissions are disabled', () => {
    const member = {};
    const config = { permissions: { enabled: false } };
    expect(hasPermission(member, 'ping', config)).toBe(true);
  });

  it('should return true when usePermissions is false', () => {
    const member = {};
    const config = { permissions: { enabled: true, usePermissions: false } };
    expect(hasPermission(member, 'ping', config)).toBe(true);
  });

  it('should return true for "everyone" permission level', () => {
    const member = {};
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: { ping: 'everyone' },
      },
    };
    expect(hasPermission(member, 'ping', config)).toBe(true);
  });

  it('should check moderator for "moderator" permission level', () => {
    const modMember = {
      permissions: {
        has: vi.fn().mockImplementation((perm) => {
          return perm === PermissionFlagsBits.ManageGuild;
        }),
      },
      roles: { cache: { has: vi.fn() } },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: { modlog: 'moderator' },
      },
    };
    expect(hasPermission(modMember, 'modlog', config)).toBe(true);
  });

  it('should deny non-moderator for "moderator" permission level', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: { modlog: 'moderator' },
      },
    };
    expect(hasPermission(member, 'modlog', config)).toBe(false);
  });

  it('should check admin for "admin" permission level', () => {
    const adminMember = {
      permissions: { has: vi.fn().mockReturnValue(true) },
      roles: { cache: { has: vi.fn() } },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: { config: 'admin' },
      },
    };
    expect(hasPermission(adminMember, 'config', config)).toBe(true);
  });

  it('should deny non-admin for "admin" permission level', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: { config: 'admin' },
      },
    };
    expect(hasPermission(member, 'config', config)).toBe(false);
  });

  it('should default to admin-only for unknown commands', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: {},
      },
    };
    expect(hasPermission(member, 'unknown', config)).toBe(false);
  });

  it('should grant admin access to unknown commands', () => {
    const adminMember = {
      permissions: { has: vi.fn().mockReturnValue(true) },
      roles: { cache: { has: vi.fn() } },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: {},
      },
    };
    expect(hasPermission(adminMember, 'unknown', config)).toBe(true);
  });

  it('should deny for unknown permission level', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: { foo: 'moderator' },
      },
    };
    expect(hasPermission(member, 'foo', config)).toBe(false);
  });
});

describe('isGuildAdmin', () => {
  it('should return false for null member', () => {
    expect(isGuildAdmin(null, {})).toBe(false);
  });

  it('should return true for bot owner', () => {
    process.env.BOT_OWNER_IDS = BOT_OWNER_ID;
    const member = { id: BOT_OWNER_ID };
    expect(isGuildAdmin(member, {})).toBe(true);
  });

  it('should return true for members with Administrator permission', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(true) },
      roles: { cache: { has: vi.fn() } },
    };
    expect(isGuildAdmin(member, {})).toBe(true);
  });

  it('should return true for members with admin role (adminRoleIds array)', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(true) } },
    };
    const config = { permissions: { adminRoleIds: ['123456'] } };
    expect(isGuildAdmin(member, config)).toBe(true);
    expect(member.roles.cache.has).toHaveBeenCalledWith('123456');
  });

  it('should return false for regular members', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isGuildAdmin(member, {})).toBe(false);
  });

  it('should return false with null config without throwing', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isGuildAdmin(member, null)).toBe(false);
  });
});

describe('isModerator', () => {
  it('should return false for null member', () => {
    expect(isModerator(null, {})).toBe(false);
  });

  it('should return true for bot owner', () => {
    process.env.BOT_OWNER_IDS = BOT_OWNER_ID;
    const member = { id: BOT_OWNER_ID };
    expect(isModerator(member, {})).toBe(true);
  });

  it('should return true for members with Administrator permission', () => {
    const member = {
      permissions: {
        has: vi.fn().mockImplementation((perm) => {
          return perm === PermissionFlagsBits.Administrator;
        }),
      },
      roles: { cache: { has: vi.fn() } },
    };
    expect(isModerator(member, {})).toBe(true);
  });

  it('should return true for members with ManageGuild permission', () => {
    const member = {
      permissions: {
        has: vi.fn().mockImplementation((perm) => {
          return perm === PermissionFlagsBits.ManageGuild;
        }),
      },
      roles: { cache: { has: vi.fn() } },
    };
    expect(isModerator(member, {})).toBe(true);
  });

  it('should return true for members with admin role (adminRoleIds array)', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(true) } },
    };
    const config = { permissions: { adminRoleIds: ['123456'] } };
    expect(isModerator(member, config)).toBe(true);
    expect(member.roles.cache.has).toHaveBeenCalledWith('123456');
  });

  it('should return true for members with any of multiple admin roles', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: {
        cache: {
          has: vi.fn().mockImplementation((id) => id === '999999'),
        },
      },
    };
    const config = { permissions: { adminRoleIds: ['123456', '999999'] } };
    expect(isModerator(member, config)).toBe(true);
  });

  it('should return true for members with moderator role (moderatorRoleIds array)', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(true) } },
    };
    const config = { permissions: { moderatorRoleIds: ['654321'] } };
    expect(isModerator(member, config)).toBe(true);
    expect(member.roles.cache.has).toHaveBeenCalledWith('654321');
  });

  it('should return true for members with any of multiple moderator roles', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: {
        cache: {
          has: vi.fn().mockImplementation((id) => id === '888888'),
        },
      },
    };
    const config = { permissions: { moderatorRoleIds: ['654321', '888888'] } };
    expect(isModerator(member, config)).toBe(true);
  });

  it('should return true for moderator role when admin and moderator roles are both configured', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: {
        cache: {
          has: vi.fn().mockImplementation((roleId) => roleId === '654321'),
        },
      },
    };
    const config = {
      permissions: { adminRoleIds: ['123456'], moderatorRoleIds: ['654321'] },
    };
    expect(isModerator(member, config)).toBe(true);
    expect(member.roles.cache.has).toHaveBeenCalledWith('123456');
    expect(member.roles.cache.has).toHaveBeenCalledWith('654321');
  });

  it('should support backward compat: singular adminRoleId still works', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(true) } },
    };
    const config = { permissions: { adminRoleId: '123456' } };
    expect(isModerator(member, config)).toBe(true);
    expect(member.roles.cache.has).toHaveBeenCalledWith('123456');
  });

  it('should support backward compat: singular moderatorRoleId still works', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(true) } },
    };
    const config = { permissions: { moderatorRoleId: '654321' } };
    expect(isModerator(member, config)).toBe(true);
    expect(member.roles.cache.has).toHaveBeenCalledWith('654321');
  });

  it('should find legacy moderatorRoleId even when moderatorRoleIds:[] default is present (merged config)', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: (id) => id === 'legacy-mod-999' } },
    };
    const config = { permissions: { moderatorRoleIds: [], moderatorRoleId: 'legacy-mod-999' } };
    expect(isModerator(member, config)).toBe(true);
  });

  it('should grant moderator via legacy adminRoleId even when adminRoleIds:[] default is present', () => {
    // isModerator() checks admin roles first — legacy adminRoleId must be found
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: (id) => id === 'legacy-admin-123' } },
    };
    const config = {
      permissions: { adminRoleIds: [], adminRoleId: 'legacy-admin-123', moderatorRoleIds: [] },
    };
    expect(isModerator(member, config)).toBe(true);
  });

  it('should return false for regular members', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isModerator(member, {})).toBe(false);
  });

  it('should return false with null config without throwing', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isModerator(member, null)).toBe(false);
  });
});

describe('getPermissionError', () => {
  it('should return a formatted error message with command name', () => {
    const msg = getPermissionError('config');
    expect(msg).toContain('/config');
    expect(msg).toContain('permission');
    expect(msg).toContain('administrator');
  });

  it('should accept a custom permission level', () => {
    const msg = getPermissionError('modlog', 'moderator');
    expect(msg).toContain('/modlog');
    expect(msg).toContain('moderator');
  });
});

describe('isBotOwner', () => {
  it('should return true for a bot owner', () => {
    process.env.BOT_OWNER_IDS = BOT_OWNER_ID;
    const member = { id: BOT_OWNER_ID };
    expect(isBotOwner(member, {})).toBe(true);
  });

  it('should return false for a non-owner', () => {
    process.env.BOT_OWNER_IDS = BOT_OWNER_ID;
    const member = { id: '000000000000000000' };
    expect(isBotOwner(member, {})).toBe(false);
  });

  it('should return false when BOT_OWNER_IDS is not set', () => {
    delete process.env.BOT_OWNER_IDS;
    const member = { id: BOT_OWNER_ID };
    expect(isBotOwner(member, {})).toBe(false);
  });

  it('should return false when BOT_OWNER_IDS is empty string', () => {
    process.env.BOT_OWNER_IDS = '';
    const member = { id: BOT_OWNER_ID };
    expect(isBotOwner(member, {})).toBe(false);
  });
});

describe('mergeRoleIds', () => {
  it('merges a non-empty array with a singular id', () => {
    expect(mergeRoleIds(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('deduplicates when singular id is already in array', () => {
    expect(mergeRoleIds(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('handles empty array + singular id', () => {
    expect(mergeRoleIds([], 'abc')).toEqual(['abc']);
  });

  it('handles array only (no singular id)', () => {
    expect(mergeRoleIds(['x', 'y'], null)).toEqual(['x', 'y']);
  });

  it('handles null array + singular id (legacy-only config)', () => {
    expect(mergeRoleIds(null, 'legacy-id')).toEqual(['legacy-id']);
  });

  it('handles undefined array + singular id (defaults not merged yet)', () => {
    expect(mergeRoleIds(undefined, 'legacy-id')).toEqual(['legacy-id']);
  });

  it('handles both null — returns empty array', () => {
    expect(mergeRoleIds(null, null)).toEqual([]);
  });

  it('normalizes a string roleIds to single-element array (malformed config)', () => {
    expect(mergeRoleIds('malformed-string-id', null)).toEqual(['malformed-string-id']);
  });

  it('string roleIds + singular id deduplicates if same', () => {
    expect(mergeRoleIds('role-123', 'role-123')).toEqual(['role-123']);
  });

  it('string roleIds + different singular id merges both', () => {
    expect(mergeRoleIds('role-abc', 'role-xyz')).toEqual(['role-abc', 'role-xyz']);
  });

  it('empty string roleId is ignored', () => {
    expect(mergeRoleIds(['a'], '')).toEqual(['a']);
  });

  it('empty string roleIds falls back to empty array', () => {
    expect(mergeRoleIds('', 'abc')).toEqual(['abc']);
  });

  it('real merged-config case: defaults inject [] alongside legacy guild override', () => {
    // This is the production failure scenario: defaults merge adminRoleIds:[] before
    // guild overrides apply, so config has BOTH fields.
    expect(mergeRoleIds([], 'legacy-guild-role')).toEqual(['legacy-guild-role']);
  });
});
