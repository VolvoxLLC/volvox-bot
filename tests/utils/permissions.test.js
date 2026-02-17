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
  isGuildAdmin,
  isModerator,
} from '../../src/utils/permissions.js';

const BOT_OWNER_ID = '191633014441115648';

describe('isAdmin', () => {
  it('should return false for null member or config', () => {
    expect(isAdmin(null, {})).toBe(false);
    expect(isAdmin({}, null)).toBe(false);
    expect(isAdmin(null, null)).toBe(false);
  });

  it('should return true for bot owner via member.id', () => {
    const member = {
      id: BOT_OWNER_ID,
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = { permissions: { botOwners: [BOT_OWNER_ID] } };
    expect(isAdmin(member, config)).toBe(true);
    expect(member.permissions.has).not.toHaveBeenCalled();
  });

  it('should return true for bot owner via member.user.id', () => {
    const member = {
      user: { id: BOT_OWNER_ID },
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = { permissions: { botOwners: [BOT_OWNER_ID] } };
    expect(isAdmin(member, config)).toBe(true);
  });

  it('should return true for bot owner from config.permissions.botOwners', () => {
    const customOwnerId = '999999999999999999';
    const member = {
      id: customOwnerId,
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = { permissions: { botOwners: [customOwnerId] } };
    expect(isAdmin(member, config)).toBe(true);
  });

  it('should not treat old hardcoded owner ID as bot owner when botOwners is missing', () => {
    const member = {
      id: BOT_OWNER_ID,
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isAdmin(member, {})).toBe(false);
  });

  it('should not treat old hardcoded owner ID as bot owner when botOwners is empty', () => {
    const member = {
      id: BOT_OWNER_ID,
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = { permissions: { botOwners: [] } };
    expect(isAdmin(member, config)).toBe(false);
  });

  it('should return true for members with Administrator permission', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(true) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    expect(isAdmin(member, {})).toBe(true);
  });

  it('should return true for members with admin role', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(true) } },
    };
    const config = { permissions: { adminRoleId: '123456' } };
    expect(isAdmin(member, config)).toBe(true);
    expect(member.roles.cache.has).toHaveBeenCalledWith('123456');
  });

  it('should return false for regular members', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = { permissions: { adminRoleId: '123456' } };
    expect(isAdmin(member, config)).toBe(false);
  });

  it('should return false when no adminRoleId configured and not Admin', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn() } },
    };
    expect(isAdmin(member, {})).toBe(false);
  });
});

describe('hasPermission', () => {
  it('should return false for null member, commandName, or config', () => {
    expect(hasPermission(null, 'ping', {})).toBe(false);
    expect(hasPermission({}, null, {})).toBe(false);
    expect(hasPermission({}, 'ping', null)).toBe(false);
  });

  it('should return true for bot owner regardless of permission settings', () => {
    const member = { id: BOT_OWNER_ID };
    const config = {
      permissions: {
        botOwners: [BOT_OWNER_ID],
        enabled: true,
        usePermissions: true,
        allowedCommands: { config: 'admin' },
      },
    };
    expect(hasPermission(member, 'config', config)).toBe(true);
  });

  it('should not bypass for old hardcoded owner ID when botOwners is missing', () => {
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

  it('should not bypass for old hardcoded owner ID when botOwners is empty', () => {
    const member = {
      id: BOT_OWNER_ID,
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    };
    const config = {
      permissions: {
        botOwners: [],
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
    const member = { id: BOT_OWNER_ID };
    const config = { permissions: { botOwners: [BOT_OWNER_ID] } };
    expect(isGuildAdmin(member, config)).toBe(true);
  });

  it('should return true for members with Administrator permission', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(true) },
      roles: { cache: { has: vi.fn() } },
    };
    expect(isGuildAdmin(member, {})).toBe(true);
  });

  it('should return true for members with admin role', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(true) } },
    };
    const config = { permissions: { adminRoleId: '123456' } };
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
    const member = { id: BOT_OWNER_ID };
    const config = { permissions: { botOwners: [BOT_OWNER_ID] } };
    expect(isModerator(member, config)).toBe(true);
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

  it('should return true for members with admin role', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(true) } },
    };
    const config = { permissions: { adminRoleId: '123456' } };
    expect(isModerator(member, config)).toBe(true);
    expect(member.roles.cache.has).toHaveBeenCalledWith('123456');
  });

  it('should return true for members with moderator role', () => {
    const member = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(true) } },
    };
    const config = { permissions: { moderatorRoleId: '654321' } };
    expect(isModerator(member, config)).toBe(true);
    expect(member.roles.cache.has).toHaveBeenCalledWith('654321');
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
