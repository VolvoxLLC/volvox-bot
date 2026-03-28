import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { handleNickPrefix, handleNickSuffix } from '../../../src/modules/actions/nickPrefix.js';
import { warn } from '../../../src/logger.js';

function makeContext({
  displayName = 'TestUser',
  hasPermission = true,
  isOwner = false,
} = {}) {
  const setNickname = vi.fn().mockResolvedValue(undefined);

  return {
    member: {
      id: isOwner ? 'owner1' : 'user1',
      user: { id: isOwner ? 'owner1' : 'user1', displayName },
      displayName,
      setNickname,
    },
    guild: {
      id: 'guild1',
      ownerId: 'owner1',
      members: {
        me: {
          permissions: {
            has: vi.fn(() => hasPermission),
          },
        },
      },
    },
    templateContext: {
      level: '5',
      username: displayName,
    },
    _mocks: { setNickname },
  };
}

describe('handleNickPrefix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should prepend a rendered template prefix to the nickname', async () => {
    const ctx = makeContext();
    await handleNickPrefix({ type: 'nickPrefix', template: '[Lvl {{level}}] ' }, ctx);

    expect(ctx._mocks.setNickname).toHaveBeenCalledWith('[Lvl 5] TestUser');
  });

  it('should truncate to 32 characters', async () => {
    const ctx = makeContext({ displayName: 'AVeryLongUsernameForTesting1234' });
    await handleNickPrefix({ type: 'nickPrefix', template: '[Lvl {{level}}] ' }, ctx);

    const arg = ctx._mocks.setNickname.mock.calls[0][0];
    expect(arg.length).toBeLessThanOrEqual(32);
    expect(arg).toBe('[Lvl 5] AVeryLongUsernameForTest');
  });

  it('should skip if MANAGE_NICKNAMES permission is missing', async () => {
    const ctx = makeContext({ hasPermission: false });
    await handleNickPrefix({ type: 'nickPrefix', template: '[Lvl {{level}}] ' }, ctx);

    expect(ctx._mocks.setNickname).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'nickPrefix skipped — missing MANAGE_NICKNAMES permission',
      expect.any(Object),
    );
  });

  it('should skip for server owner', async () => {
    const ctx = makeContext({ isOwner: true });
    await handleNickPrefix({ type: 'nickPrefix', template: '[Lvl {{level}}] ' }, ctx);

    expect(ctx._mocks.setNickname).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'nickPrefix skipped — cannot change server owner nickname',
      expect.any(Object),
    );
  });

  it('should skip if rendered template is empty', async () => {
    const ctx = makeContext();
    await handleNickPrefix({ type: 'nickPrefix', template: '' }, ctx);

    expect(ctx._mocks.setNickname).not.toHaveBeenCalled();
  });

  it('should handle missing template gracefully', async () => {
    const ctx = makeContext();
    await handleNickPrefix({ type: 'nickPrefix' }, ctx);

    expect(ctx._mocks.setNickname).not.toHaveBeenCalled();
  });
});

describe('handleNickSuffix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should append a rendered template suffix to the nickname', async () => {
    const ctx = makeContext();
    await handleNickSuffix({ type: 'nickSuffix', template: ' [Lvl {{level}}]' }, ctx);

    expect(ctx._mocks.setNickname).toHaveBeenCalledWith('TestUser [Lvl 5]');
  });

  it('should truncate base name to fit suffix within 32 chars', async () => {
    const ctx = makeContext({ displayName: 'AVeryLongUsernameForTestingPurposes' });
    await handleNickSuffix({ type: 'nickSuffix', template: ' [Lvl {{level}}]' }, ctx);

    const arg = ctx._mocks.setNickname.mock.calls[0][0];
    expect(arg.length).toBeLessThanOrEqual(32);
    expect(arg.endsWith(' [Lvl 5]')).toBe(true);
  });

  it('should skip if MANAGE_NICKNAMES permission is missing', async () => {
    const ctx = makeContext({ hasPermission: false });
    await handleNickSuffix({ type: 'nickSuffix', template: ' [Lvl {{level}}]' }, ctx);

    expect(ctx._mocks.setNickname).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'nickSuffix skipped — missing MANAGE_NICKNAMES permission',
      expect.any(Object),
    );
  });

  it('should skip for server owner', async () => {
    const ctx = makeContext({ isOwner: true });
    await handleNickSuffix({ type: 'nickSuffix', template: ' [Lvl {{level}}]' }, ctx);

    expect(ctx._mocks.setNickname).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'nickSuffix skipped — cannot change server owner nickname',
      expect.any(Object),
    );
  });

  it('should handle suffix longer than 32 chars gracefully', async () => {
    const ctx = makeContext();
    const longSuffix = ' '.repeat(40);
    await handleNickSuffix({ type: 'nickSuffix', template: longSuffix }, ctx);

    const arg = ctx._mocks.setNickname.mock.calls[0][0];
    expect(arg.length).toBeLessThanOrEqual(32);
  });
});
