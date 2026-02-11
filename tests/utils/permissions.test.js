import { describe, expect, it, vi } from 'vitest';

// Mock discord.js before importing the module
vi.mock('discord.js', () => ({
  PermissionFlagsBits: {
    Administrator: 1n << 3n,
  },
}));

import { getPermissionError, hasPermission, isAdmin } from '../../src/utils/permissions.js';

describe('isAdmin', () => {
  it('should return false for null member or config', () => {
    expect(isAdmin(null, {})).toBe(false);
    expect(isAdmin({}, null)).toBe(false);
    expect(isAdmin(null, null)).toBe(false);
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

describe('getPermissionError', () => {
  it('should return a formatted error message with command name', () => {
    const msg = getPermissionError('config');
    expect(msg).toContain('/config');
    expect(msg).toContain('permission');
    expect(msg).toContain('administrator');
  });
});
