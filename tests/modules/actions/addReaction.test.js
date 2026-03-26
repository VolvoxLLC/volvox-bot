import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { handleAddReaction } from '../../../src/modules/actions/addReaction.js';
import { info, warn } from '../../../src/logger.js';

function makeContext({ reactFn } = {}) {
  const react = reactFn ?? vi.fn().mockResolvedValue(undefined);
  return {
    member: { user: { id: 'user1' } },
    guild: { id: 'guild1' },
    message: { react },
    templateContext: {},
    _mocks: { react },
  };
}

describe('handleAddReaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should react with a Unicode emoji', async () => {
    const ctx = makeContext();
    const action = { type: 'addReaction', emoji: '🎉' };

    await handleAddReaction(action, ctx);

    expect(ctx._mocks.react).toHaveBeenCalledWith('🎉');
    expect(info).toHaveBeenCalledWith(
      'Level-up reaction added',
      expect.objectContaining({ emoji: '🎉' }),
    );
  });

  it('should react with a custom guild emoji by extracting the id', async () => {
    const ctx = makeContext();
    const action = { type: 'addReaction', emoji: '<:star:123456789>' };

    await handleAddReaction(action, ctx);

    expect(ctx._mocks.react).toHaveBeenCalledWith('123456789');
  });

  it('should react with an animated custom emoji by extracting the id', async () => {
    const ctx = makeContext();
    const action = { type: 'addReaction', emoji: '<a:dance:987654321>' };

    await handleAddReaction(action, ctx);

    expect(ctx._mocks.react).toHaveBeenCalledWith('987654321');
  });

  it('should warn and skip when emoji is missing', async () => {
    const ctx = makeContext();
    const action = { type: 'addReaction' };

    await handleAddReaction(action, ctx);

    expect(ctx._mocks.react).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'addReaction action missing emoji config',
      expect.any(Object),
    );
  });

  it('should warn and skip when message is missing', async () => {
    const ctx = makeContext();
    ctx.message = null;
    const action = { type: 'addReaction', emoji: '🎉' };

    await handleAddReaction(action, ctx);

    expect(warn).toHaveBeenCalledWith(
      'addReaction action has no triggering message',
      expect.any(Object),
    );
  });

  it('should handle react errors gracefully', async () => {
    const ctx = makeContext({
      reactFn: vi.fn().mockRejectedValue(new Error('Unknown emoji')),
    });
    const action = { type: 'addReaction', emoji: '🎉' };

    // Should not throw
    await handleAddReaction(action, ctx);

    expect(warn).toHaveBeenCalledWith(
      'Failed to add level-up reaction',
      expect.objectContaining({ error: 'Unknown emoji' }),
    );
  });
});
