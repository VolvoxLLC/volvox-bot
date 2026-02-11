import { describe, expect, it } from 'vitest';
import { getPermissionError, hasPermission, isAdmin } from '../../src/utils/permissions.js';

describe('isAdmin', () => {
  it('should return false for null or undefined member', () => {
    expect(isAdmin(null, {})).toBe(false);
    expect(isAdmin(undefined, {})).toBe(false);
  });

  it('should return false for null or undefined config', () => {
    const member = { permissions: { has: () => false }, roles: { cache: new Map() } };
    expect(isAdmin(member, null)).toBe(false);
    expect(isAdmin(member, undefined)).toBe(false);
  });

  it('should return true if member has Administrator permission', () => {
    const member = {
      permissions: {
        has: () => true, // Mock has() to return true for Administrator permission
      },
      roles: { cache: new Map() },
    };
    const config = {};
    expect(isAdmin(member, config)).toBe(true);
  });

  it('should return true if member has configured admin role', () => {
    const adminRoleId = '123456789';
    const member = {
      permissions: {
        has: () => false,
      },
      roles: {
        cache: new Map([[adminRoleId, {}]]),
      },
    };
    const config = {
      permissions: {
        adminRoleId,
      },
    };
    expect(isAdmin(member, config)).toBe(true);
  });

  it('should return false if member has neither Administrator permission nor admin role', () => {
    const member = {
      permissions: {
        has: () => false,
      },
      roles: {
        cache: new Map([['999999', {}]]),
      },
    };
    const config = {
      permissions: {
        adminRoleId: '123456789',
      },
    };
    expect(isAdmin(member, config)).toBe(false);
  });

  it('should return false if config has no adminRoleId and member is not Administrator', () => {
    const member = {
      permissions: {
        has: () => false,
      },
      roles: {
        cache: new Map(),
      },
    };
    const config = {
      permissions: {},
    };
    expect(isAdmin(member, config)).toBe(false);
  });
});

describe('hasPermission', () => {
  it('should return false for null or undefined member', () => {
    expect(hasPermission(null, 'test', {})).toBe(false);
    expect(hasPermission(undefined, 'test', {})).toBe(false);
  });

  it('should return false for null or undefined command name', () => {
    const member = { permissions: { has: () => false } };
    expect(hasPermission(member, null, {})).toBe(false);
    expect(hasPermission(member, undefined, {})).toBe(false);
  });

  it('should return false for null or undefined config', () => {
    const member = { permissions: { has: () => false } };
    expect(hasPermission(member, 'test', null)).toBe(false);
    expect(hasPermission(member, 'test', undefined)).toBe(false);
  });

  it('should return true if permissions are disabled', () => {
    const member = { permissions: { has: () => false } };
    const config = {
      permissions: {
        enabled: false,
      },
    };
    expect(hasPermission(member, 'test', config)).toBe(true);
  });

  it('should return true if usePermissions is false', () => {
    const member = { permissions: { has: () => false } };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: false,
      },
    };
    expect(hasPermission(member, 'test', config)).toBe(true);
  });

  it('should return true for everyone-level command', () => {
    const member = { permissions: { has: () => false } };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: {
          ping: 'everyone',
        },
      },
    };
    expect(hasPermission(member, 'ping', config)).toBe(true);
  });

  it('should check admin status for admin-level command', () => {
    const adminMember = {
      permissions: {
        has: () => true, // Admin has Administrator permission
      },
      roles: { cache: new Map() },
    };
    const normalMember = {
      permissions: {
        has: () => false,
      },
      roles: { cache: new Map() },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: {
          config: 'admin',
        },
      },
    };

    expect(hasPermission(adminMember, 'config', config)).toBe(true);
    expect(hasPermission(normalMember, 'config', config)).toBe(false);
  });

  it('should default to admin-only for commands not in config', () => {
    const adminMember = {
      permissions: {
        has: () => true, // Admin has Administrator permission
      },
      roles: { cache: new Map() },
    };
    const normalMember = {
      permissions: {
        has: () => false,
      },
      roles: { cache: new Map() },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: {},
      },
    };

    expect(hasPermission(adminMember, 'unknown', config)).toBe(true);
    expect(hasPermission(normalMember, 'unknown', config)).toBe(false);
  });

  it('should deny access for unknown permission levels', () => {
    const member = {
      permissions: {
        has: (perm) => perm === 0x8,
      },
      roles: { cache: new Map() },
    };
    const config = {
      permissions: {
        enabled: true,
        usePermissions: true,
        allowedCommands: {
          test: 'moderator', // Unknown level
        },
      },
    };

    expect(hasPermission(member, 'test', config)).toBe(false);
  });
});

describe('getPermissionError', () => {
  it('should return formatted error message', () => {
    const message = getPermissionError('config');
    expect(message).toContain('config');
    expect(message).toContain('permission');
    expect(message).toContain('administrator');
  });

  it('should include command name in backticks', () => {
    const message = getPermissionError('test');
    expect(message).toMatch(/`\/test`/);
  });

  it('should include emoji indicator', () => {
    const message = getPermissionError('test');
    expect(message).toContain('❌');
  });

  it('should handle different command names', () => {
    const message1 = getPermissionError('ping');
    const message2 = getPermissionError('status');
    expect(message1).toContain('ping');
    expect(message2).toContain('status');
  });
});