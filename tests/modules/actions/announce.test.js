import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/utils/templateEngine.js', () => ({
  renderTemplate: vi.fn((tpl) => tpl),
}));

vi.mock('../../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue(undefined),
}));

import { info, warn } from '../../../src/logger.js';
import { handleAnnounce } from '../../../src/modules/actions/announce.js';
import { safeSend } from '../../../src/utils/safeSend.js';
import { renderTemplate } from '../../../src/utils/templateEngine.js';

function makeContext({ channelCache = new Map() } = {}) {
  const messageChannel = { id: 'current-ch', send: vi.fn() };
  return {
    member: { user: { id: 'user1' } },
    guild: {
      id: 'guild1',
      channels: { cache: channelCache },
    },
    message: { channel: messageChannel },
    templateContext: { username: 'TestUser', level: '5' },
  };
}

describe('handleAnnounce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send text announcement to current channel by default', async () => {
    renderTemplate.mockReturnValue('Level up!');
    const ctx = makeContext();
    const action = { type: 'announce', template: 'Level up!' };

    await handleAnnounce(action, ctx);

    expect(safeSend).toHaveBeenCalledWith(
      ctx.message.channel,
      expect.objectContaining({ content: 'Level up!' }),
    );
    expect(info).toHaveBeenCalledWith(
      'Level-up announcement sent',
      expect.objectContaining({ channelId: 'current-ch' }),
    );
  });

  it('should send to a specific channel when channelMode is "specific"', async () => {
    renderTemplate.mockReturnValue('Announced!');
    const specificChannel = { id: 'specific-ch', send: vi.fn() };
    const channelCache = new Map([['specific-ch', specificChannel]]);
    const ctx = makeContext({ channelCache });
    const action = {
      type: 'announce',
      channelMode: 'specific',
      channelId: 'specific-ch',
      template: 'Announced!',
    };

    await handleAnnounce(action, ctx);

    expect(safeSend).toHaveBeenCalledWith(
      specificChannel,
      expect.objectContaining({ content: 'Announced!' }),
    );
  });

  it('should do nothing when channelMode is "none"', async () => {
    const ctx = makeContext();
    const action = { type: 'announce', channelMode: 'none', template: 'Hello' };

    await handleAnnounce(action, ctx);

    expect(safeSend).not.toHaveBeenCalled();
  });

  it('should warn when specific channel is not found', async () => {
    const ctx = makeContext({ channelCache: new Map() });
    const action = {
      type: 'announce',
      channelMode: 'specific',
      channelId: 'missing-ch',
      template: 'Hello',
    };

    await handleAnnounce(action, ctx);

    expect(warn).toHaveBeenCalledWith(
      'announce target channel not found',
      expect.objectContaining({ channelId: 'missing-ch' }),
    );
    expect(safeSend).not.toHaveBeenCalled();
  });

  it('should warn when specific mode has no channelId', async () => {
    const ctx = makeContext();
    const action = { type: 'announce', channelMode: 'specific', template: 'Hello' };

    await handleAnnounce(action, ctx);

    expect(warn).toHaveBeenCalledWith(
      'announce action has channelMode "specific" but no channelId',
      expect.any(Object),
    );
    expect(safeSend).not.toHaveBeenCalled();
  });

  it('should send an embed announcement', async () => {
    renderTemplate.mockImplementation((tpl) => tpl);
    const ctx = makeContext();
    const action = {
      type: 'announce',
      format: 'embed',
      embed: {
        title: 'Level Up!',
        description: 'Congrats!',
        color: 0xff0000,
      },
    };

    await handleAnnounce(action, ctx);

    const call = safeSend.mock.calls[0][1];
    expect(call.embeds).toHaveLength(1);
    expect(call.content).toBeUndefined();
  });

  it('should send both text and embed when format is "both"', async () => {
    renderTemplate.mockImplementation((tpl) => tpl);
    const ctx = makeContext();
    const action = {
      type: 'announce',
      format: 'both',
      template: 'Hey!',
      embed: { title: 'Level Up!' },
    };

    await handleAnnounce(action, ctx);

    const call = safeSend.mock.calls[0][1];
    expect(call.content).toBe('Hey!');
    expect(call.embeds).toHaveLength(1);
  });

  it('should handle safeSend errors gracefully', async () => {
    safeSend.mockRejectedValueOnce(new Error('Missing permissions'));
    const ctx = makeContext();
    const action = { type: 'announce', template: 'Hello' };

    // Should not throw
    await handleAnnounce(action, ctx);

    expect(warn).toHaveBeenCalledWith(
      'Failed to send level-up announcement',
      expect.objectContaining({ error: 'Missing permissions' }),
    );
  });
});
