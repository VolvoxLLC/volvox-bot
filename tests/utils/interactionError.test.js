import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogError = vi.fn();
const mockSafeReply = vi.fn();

vi.mock('../../src/logger.js', () => ({
  error: (...args) => mockLogError(...args),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeReply: (...args) => mockSafeReply(...args),
}));

import { handleButtonError } from '../../src/utils/interactionError.js';

describe('handleButtonError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeReply.mockResolvedValue(undefined);
  });

  it('logs the error with contextual metadata', async () => {
    const interaction = {
      customId: 'poll_vote_123_0',
      user: { id: 'user-42' },
      replied: false,
      deferred: false,
    };
    const err = new Error('something broke');

    await handleButtonError(interaction, err, {
      context: 'Test handler failed',
      message: '❌ Oops.',
    });

    expect(mockLogError).toHaveBeenCalledWith('Test handler failed', {
      customId: 'poll_vote_123_0',
      userId: 'user-42',
      error: 'something broke',
    });
  });

  it('sends an ephemeral error reply when the interaction has not been replied to', async () => {
    const interaction = {
      customId: 'poll_vote_123_0',
      user: { id: 'user-42' },
      replied: false,
      deferred: false,
    };
    const err = new Error('something broke');

    await handleButtonError(interaction, err, {
      context: 'Test handler failed',
      message: '❌ Oops.',
    });

    expect(mockSafeReply).toHaveBeenCalledWith(interaction, {
      content: '❌ Oops.',
      ephemeral: true,
    });
  });

  it('skips the reply when the interaction has already been replied to', async () => {
    const interaction = {
      customId: 'poll_vote_123_0',
      user: { id: 'user-42' },
      replied: true,
      deferred: false,
    };
    const err = new Error('something broke');

    await handleButtonError(interaction, err, {
      context: 'Test handler failed',
      message: '❌ Oops.',
    });

    expect(mockSafeReply).not.toHaveBeenCalled();
  });

  it('skips the reply when the interaction is already deferred', async () => {
    const interaction = {
      customId: 'poll_vote_123_0',
      user: { id: 'user-42' },
      replied: false,
      deferred: true,
    };
    const err = new Error('something broke');

    await handleButtonError(interaction, err, {
      context: 'Test handler failed',
      message: '❌ Oops.',
    });

    expect(mockSafeReply).not.toHaveBeenCalled();
  });

  it('swallows safeReply errors without throwing', async () => {
    const interaction = {
      customId: 'poll_vote_123_0',
      user: { id: 'user-42' },
      replied: false,
      deferred: false,
    };
    const err = new Error('something broke');
    mockSafeReply.mockRejectedValueOnce(new Error('reply failed'));

    await expect(
      handleButtonError(interaction, err, {
        context: 'Test handler failed',
        message: '❌ Oops.',
      }),
    ).resolves.toBeUndefined();
  });

  it('handles an interaction with no user gracefully', async () => {
    const interaction = {
      customId: 'poll_vote_123_0',
      user: undefined,
      replied: false,
      deferred: false,
    };
    const err = new Error('something broke');

    await handleButtonError(interaction, err, {
      context: 'Test handler failed',
      message: '❌ Oops.',
    });

    expect(mockLogError).toHaveBeenCalledWith('Test handler failed', {
      customId: 'poll_vote_123_0',
      userId: undefined,
      error: 'something broke',
    });
  });
});
