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

import {
  canManageRole,
  checkRoleRateLimit,
  recordRoleChange,
} from '../../../src/modules/actions/roleUtils.js';
import { handleRemoveRole } from '../../../src/modules/actions/removeRole.js';

function makeContext() {
  const rolesRemove = vi.fn().mockResolvedValue(undefined);
  return {
    member: {
      user: { id: 'user1' },
      roles: { remove: rolesRemove },
    },
    guild: { id: 'guild1' },
    config: {},
    _mocks: { rolesRemove },
  };
}

describe('handleRemoveRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should remove the role from the member', async () => {
    const ctx = makeContext();
    await handleRemoveRole({ type: 'removeRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesRemove).toHaveBeenCalledWith('role-a');
    expect(recordRoleChange).toHaveBeenCalledWith('guild1', 'user1');
  });

  it('should skip when canManageRole returns false', async () => {
    canManageRole.mockReturnValueOnce(false);
    const ctx = makeContext();
    await handleRemoveRole({ type: 'removeRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesRemove).not.toHaveBeenCalled();
  });

  it('should skip when rate limited', async () => {
    checkRoleRateLimit.mockReturnValueOnce(false);
    const ctx = makeContext();
    await handleRemoveRole({ type: 'removeRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesRemove).not.toHaveBeenCalled();
  });
});
