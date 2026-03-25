import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { warn } from '../../../src/logger.js';
import {
  canManageRole,
  checkRoleRateLimit,
  collectXpManagedRoles,
  enforceRoleLevelDown,
  recordRoleChange,
  sweepRoleLimits,
} from '../../../src/modules/actions/roleUtils.js';

function makeGuild({ hasManageRoles = true, botHighestPosition = 10 } = {}) {
  return {
    id: 'guild1',
    members: {
      me: {
        permissions: { has: vi.fn(() => hasManageRoles) },
        roles: { highest: { position: botHighestPosition } },
      },
    },
    roles: {
      cache: new Map([
        ['role-low', { id: 'role-low', position: 5, name: 'Low Role' }],
        ['role-high', { id: 'role-high', position: 15, name: 'High Role' }],
        ['role-equal', { id: 'role-equal', position: 10, name: 'Equal Role' }],
      ]),
    },
  };
}

describe('canManageRole', () => {
  it('should return true when bot has MANAGE_ROLES and role is below bot highest', () => {
    const guild = makeGuild();
    expect(canManageRole(guild, 'role-low')).toBe(true);
  });

  it('should return false when bot lacks MANAGE_ROLES', () => {
    const guild = makeGuild({ hasManageRoles: false });
    expect(canManageRole(guild, 'role-low')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('MANAGE_ROLES'), expect.any(Object));
  });

  it('should return false when role is above bot highest role', () => {
    const guild = makeGuild();
    expect(canManageRole(guild, 'role-high')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('hierarchy'), expect.any(Object));
  });

  it('should return false when role is at same position as bot highest', () => {
    const guild = makeGuild();
    expect(canManageRole(guild, 'role-equal')).toBe(false);
  });

  it('should return false when role is not in guild cache', () => {
    const guild = makeGuild();
    expect(canManageRole(guild, 'role-missing')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not found'), expect.any(Object));
  });
});

describe('checkRoleRateLimit / recordRoleChange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow first two role changes', () => {
    expect(checkRoleRateLimit('guild1', 'user1')).toBe(true);
    recordRoleChange('guild1', 'user1');
    expect(checkRoleRateLimit('guild1', 'user1')).toBe(true);
    recordRoleChange('guild1', 'user1');
  });

  it('should block third role change within 60s', () => {
    recordRoleChange('guild1', 'user-rl');
    recordRoleChange('guild1', 'user-rl');
    expect(checkRoleRateLimit('guild1', 'user-rl')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rate limit'), expect.any(Object));
  });

  it('should allow role change after 60s window expires', () => {
    recordRoleChange('guild1', 'user-exp');
    recordRoleChange('guild1', 'user-exp');
    vi.advanceTimersByTime(61_000);
    expect(checkRoleRateLimit('guild1', 'user-exp')).toBe(true);
  });
});

describe('sweepRoleLimits', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should remove stale entries older than 60s', () => {
    recordRoleChange('guild1', 'user-sweep');
    vi.advanceTimersByTime(61_000);
    sweepRoleLimits();
    expect(checkRoleRateLimit('guild1', 'user-sweep')).toBe(true);
  });
});

describe('collectXpManagedRoles', () => {
  it('should return all roleIds from grantRole and removeRole actions in levelActions', () => {
    const config = {
      levelActions: [
        { level: 5, actions: [{ type: 'grantRole', roleId: 'role-a' }] },
        {
          level: 10,
          actions: [
            { type: 'grantRole', roleId: 'role-b' },
            { type: 'removeRole', roleId: 'role-a' },
            { type: 'sendDm', message: 'hello' },
          ],
        },
      ],
      defaultActions: [{ type: 'addReaction', emoji: '⬆️' }],
    };

    const roles = collectXpManagedRoles(config);
    expect(roles).toEqual(new Set(['role-a', 'role-b']));
  });

  it('should return empty set when no role actions exist', () => {
    const config = { levelActions: [], defaultActions: [] };
    expect(collectXpManagedRoles(config)).toEqual(new Set());
  });
});

describe('enforceRoleLevelDown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should remove roles granted at levels above newLevel', async () => {
    const rolesRemove = vi.fn().mockResolvedValue(undefined);
    const guild = makeGuild();
    const member = {
      user: { id: 'user1' },
      guild,
      roles: {
        cache: new Map([['role-low', { id: 'role-low' }]]),
        remove: rolesRemove,
      },
    };

    const xpConfig = {
      levelActions: [{ level: 5, actions: [{ type: 'grantRole', roleId: 'role-low' }] }],
    };

    // User dropped to level 3 — role-low is at level 5 (>3), member has it → remove
    await enforceRoleLevelDown(member, 3, xpConfig);
    expect(rolesRemove).toHaveBeenCalledWith('role-low');
  });

  it('should not remove roles at or below newLevel', async () => {
    const rolesRemove = vi.fn().mockResolvedValue(undefined);
    const guild = makeGuild();
    const member = {
      user: { id: 'user1' },
      guild,
      roles: {
        cache: new Map([['role-low', { id: 'role-low' }]]),
        remove: rolesRemove,
      },
    };

    const xpConfig = {
      levelActions: [{ level: 5, actions: [{ type: 'grantRole', roleId: 'role-low' }] }],
    };

    // User at level 5 — role-low is at level 5 (≤5), keep it
    await enforceRoleLevelDown(member, 5, xpConfig);
    expect(rolesRemove).not.toHaveBeenCalled();
  });

  it('should not remove roles the member does not have', async () => {
    const rolesRemove = vi.fn().mockResolvedValue(undefined);
    const guild = makeGuild();
    const member = {
      user: { id: 'user1' },
      guild,
      roles: {
        cache: new Map(), // member has no roles
        remove: rolesRemove,
      },
    };

    const xpConfig = {
      levelActions: [{ level: 10, actions: [{ type: 'grantRole', roleId: 'role-low' }] }],
    };

    await enforceRoleLevelDown(member, 3, xpConfig);
    expect(rolesRemove).not.toHaveBeenCalled();
  });
});
