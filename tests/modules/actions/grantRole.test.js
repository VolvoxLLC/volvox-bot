import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/actions/roleUtils.js', () => ({
  canManageRole: vi.fn(() => true),
  checkRoleRateLimit: vi.fn(() => true),
  recordRoleChange: vi.fn(),
}));

import { handleGrantRole } from '../../../src/modules/actions/grantRole.js';
import { canManageRole, recordRoleChange } from '../../../src/modules/actions/roleUtils.js';

function makeContext({
  memberRoles = new Map(),
  xpManagedRoles = new Set(),
  stackRoles = true,
} = {}) {
  const rolesAdd = vi.fn().mockResolvedValue(undefined);
  const rolesRemove = vi.fn().mockResolvedValue(undefined);

  return {
    member: {
      user: { id: 'user1' },
      roles: {
        add: rolesAdd,
        remove: rolesRemove,
        cache: memberRoles,
      },
    },
    guild: {
      id: 'guild1',
      roles: {
        cache: new Map([
          ['role-a', { id: 'role-a', name: 'Role A' }],
          ['role-b', { id: 'role-b', name: 'Role B' }],
        ]),
      },
    },
    config: {
      roleRewards: { stackRoles },
    },
    xpManagedRoles,
    templateContext: {},
    _mocks: { rolesAdd, rolesRemove },
  };
}

describe('handleGrantRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add the role to the member', async () => {
    const ctx = makeContext();
    await handleGrantRole({ type: 'grantRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesAdd).toHaveBeenCalledWith('role-a');
    expect(recordRoleChange).toHaveBeenCalledWith('guild1', 'user1');
  });

  it('should update templateContext with roleName and roleId', async () => {
    const ctx = makeContext();
    await handleGrantRole({ type: 'grantRole', roleId: 'role-a' }, ctx);

    expect(ctx.templateContext.roleName).toBe('Role A');
    expect(ctx.templateContext.roleId).toBe('role-a');
    expect(ctx.templateContext.roleMention).toBe('<@&role-a>');
  });

  it('should skip when canManageRole returns false', async () => {
    canManageRole.mockReturnValueOnce(false);
    const ctx = makeContext();
    await handleGrantRole({ type: 'grantRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesAdd).not.toHaveBeenCalled();
  });

  // Note: Rate limiting is now handled at the pipeline level, not per-action
  // This test verifies that grantRole doesn't check rate limits internally
  it('should not check rate limit internally (handled at pipeline level)', async () => {
    const ctx = makeContext();
    await handleGrantRole({ type: 'grantRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesAdd).toHaveBeenCalledWith('role-a');
  });

  it('should remove other XP-managed roles when stackRoles is false', async () => {
    const memberRoles = new Map([
      ['role-a', { id: 'role-a' }],
      ['role-b', { id: 'role-b' }],
      ['role-unrelated', { id: 'role-unrelated' }],
    ]);
    const xpManagedRoles = new Set(['role-a', 'role-b']);
    const ctx = makeContext({ memberRoles, xpManagedRoles, stackRoles: false });

    await handleGrantRole({ type: 'grantRole', roleId: 'role-b' }, ctx);

    // Should remove role-a (XP-managed, not the target) but NOT role-unrelated
    expect(ctx._mocks.rolesRemove).toHaveBeenCalledWith('role-a');
    expect(ctx._mocks.rolesRemove).not.toHaveBeenCalledWith('role-unrelated');
    expect(ctx._mocks.rolesAdd).toHaveBeenCalledWith('role-b');
  });

  it('should not remove other roles when stackRoles is true', async () => {
    const memberRoles = new Map([['role-a', { id: 'role-a' }]]);
    const xpManagedRoles = new Set(['role-a', 'role-b']);
    const ctx = makeContext({ memberRoles, xpManagedRoles, stackRoles: true });

    await handleGrantRole({ type: 'grantRole', roleId: 'role-b' }, ctx);

    expect(ctx._mocks.rolesRemove).not.toHaveBeenCalled();
    expect(ctx._mocks.rolesAdd).toHaveBeenCalledWith('role-b');
  });

  // Regression test for skipped-level role rewards
  it('should grant roles for all skipped levels when rate limit allows', async () => {
    // Simulates a user jumping from level 1 to level 5
    // Each level has a different role reward
    const memberRoles = new Map();
    const xpManagedRoles = new Set(['role-l2', 'role-l3', 'role-l4', 'role-l5']);
    const ctx = makeContext({ memberRoles, xpManagedRoles, stackRoles: true });

    // Grant level 2 role
    await handleGrantRole({ type: 'grantRole', roleId: 'role-l2' }, ctx);
    // Grant level 3 role
    await handleGrantRole({ type: 'grantRole', roleId: 'role-l3' }, ctx);
    // Grant level 4 role
    await handleGrantRole({ type: 'grantRole', roleId: 'role-l4' }, ctx);
    // Grant level 5 role
    await handleGrantRole({ type: 'grantRole', roleId: 'role-l5' }, ctx);

    // All roles should be granted when rate limit is checked once at pipeline start
    expect(ctx._mocks.rolesAdd).toHaveBeenCalledWith('role-l2');
    expect(ctx._mocks.rolesAdd).toHaveBeenCalledWith('role-l3');
    expect(ctx._mocks.rolesAdd).toHaveBeenCalledWith('role-l4');
    expect(ctx._mocks.rolesAdd).toHaveBeenCalledWith('role-l5');
    expect(ctx._mocks.rolesAdd).toHaveBeenCalledTimes(4);
  });
});
