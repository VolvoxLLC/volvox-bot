import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/utils/templateEngine.js', () => ({
  renderTemplate: vi.fn((tpl) => tpl),
}));

import {
  checkDmRateLimit,
  handleSendDm,
  recordDmSend,
  resetDmLimits,
  sweepDmLimits,
} from '../../../src/modules/actions/sendDm.js';
import { debug, warn } from '../../../src/logger.js';
import { renderTemplate } from '../../../src/utils/templateEngine.js';

function makeContext({ sendFn } = {}) {
  const send = sendFn ?? vi.fn().mockResolvedValue(undefined);
  return {
    member: {
      user: { id: 'user1', send },
    },
    guild: { id: 'guild1' },
    templateContext: { username: 'TestUser', level: '5' },
    message: { channel: { id: 'ch1' } },
    _mocks: { send },
  };
}

describe('handleSendDm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDmLimits();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should send a text DM with rendered template', async () => {
    renderTemplate.mockReturnValue('Congrats on level 5!');
    const ctx = makeContext();
    const action = { type: 'sendDm', format: 'text', template: 'Congrats on level {{level}}!' };

    await handleSendDm(action, ctx);

    expect(ctx._mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Congrats on level 5!' }),
    );
  });

  it('should send an embed DM', async () => {
    renderTemplate.mockImplementation((tpl) => tpl);
    const ctx = makeContext();
    const action = {
      type: 'sendDm',
      format: 'embed',
      embed: {
        title: 'Level Up!',
        description: 'You reached level 5',
        color: 0x00ff00,
      },
    };

    await handleSendDm(action, ctx);

    const call = ctx._mocks.send.mock.calls[0][0];
    expect(call.embeds).toHaveLength(1);
    expect(call.content).toBeUndefined();
  });

  it('should send both text and embed when format is "both"', async () => {
    renderTemplate.mockImplementation((tpl) => tpl);
    const ctx = makeContext();
    const action = {
      type: 'sendDm',
      format: 'both',
      template: 'Hey!',
      embed: { title: 'Level Up!' },
    };

    await handleSendDm(action, ctx);

    const call = ctx._mocks.send.mock.calls[0][0];
    expect(call.content).toBe('Hey!');
    expect(call.embeds).toHaveLength(1);
  });

  it('should default to text format when format is not specified', async () => {
    renderTemplate.mockReturnValue('Default text');
    const ctx = makeContext();
    const action = { type: 'sendDm', template: 'Default text' };

    await handleSendDm(action, ctx);

    const call = ctx._mocks.send.mock.calls[0][0];
    expect(call.content).toBe('Default text');
    expect(call.embeds).toBeUndefined();
  });

  it('should silently skip when user has DMs disabled (error code 50007)', async () => {
    const dmError = new Error('Cannot send messages to this user');
    dmError.code = 50007;
    const ctx = makeContext({ sendFn: vi.fn().mockRejectedValue(dmError) });
    const action = { type: 'sendDm', format: 'text', template: 'Hi' };

    await handleSendDm(action, ctx);

    expect(debug).toHaveBeenCalledWith(
      'User has DMs disabled — skipping',
      expect.objectContaining({ userId: 'user1' }),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('should log a warning for non-DM-disabled errors', async () => {
    const ctx = makeContext({
      sendFn: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const action = { type: 'sendDm', format: 'text', template: 'Hi' };

    await handleSendDm(action, ctx);

    expect(warn).toHaveBeenCalledWith(
      'Failed to send level-up DM',
      expect.objectContaining({ error: 'Network error' }),
    );
  });

  it('should skip when rate limited (1 DM per user per 60s)', async () => {
    const ctx = makeContext();
    const action = { type: 'sendDm', format: 'text', template: 'Hi' };

    // First DM should succeed
    await handleSendDm(action, ctx);
    expect(ctx._mocks.send).toHaveBeenCalledTimes(1);

    // Second DM should be rate-limited
    await handleSendDm(action, ctx);
    expect(ctx._mocks.send).toHaveBeenCalledTimes(1); // Still 1
    expect(debug).toHaveBeenCalledWith(
      'DM rate-limited — skipping',
      expect.objectContaining({ guildId: 'guild1', userId: 'user1' }),
    );
  });
});

describe('checkDmRateLimit', () => {
  beforeEach(() => {
    resetDmLimits();
  });

  it('should allow first DM', () => {
    expect(checkDmRateLimit('g1', 'u1')).toBe(true);
  });

  it('should block after recording a DM send', () => {
    recordDmSend('g1', 'u1');
    expect(checkDmRateLimit('g1', 'u1')).toBe(false);
  });

  it('should track rate limits independently by scope', () => {
    recordDmSend('g1', 'u1', 'default');
    expect(checkDmRateLimit('g1', 'u1', 'default')).toBe(false);
    expect(checkDmRateLimit('g1', 'u1', 'levelUpDm')).toBe(true);
  });

  it('should allow after rate window expires', () => {
    vi.useFakeTimers();
    recordDmSend('g1', 'u1');
    expect(checkDmRateLimit('g1', 'u1')).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(checkDmRateLimit('g1', 'u1')).toBe(true);
    vi.useRealTimers();
  });
});
