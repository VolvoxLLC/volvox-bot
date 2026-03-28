import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('discord.js', () => ({
  Events: {
    VoiceStateUpdate: 'voiceStateUpdate',
  },
}));

vi.mock('../../../src/logger.js', () => ({
  error: vi.fn(),
}));

vi.mock('../../../src/modules/voice.js', () => ({
  handleVoiceStateUpdate: vi.fn(),
}));

import { error as logError } from '../../../src/logger.js';
import { registerVoiceStateHandler } from '../../../src/modules/events/voiceState.js';
import { handleVoiceStateUpdate } from '../../../src/modules/voice.js';

describe('registerVoiceStateHandler', () => {
  let client;
  let handlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};
    client = {
      on: vi.fn((event, cb) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(cb);
      }),
    };
    registerVoiceStateHandler(client);
  });

  it('should register a voiceStateUpdate event handler on the client', () => {
    expect(client.on).toHaveBeenCalledWith('voiceStateUpdate', expect.any(Function));
  });

  it('should register exactly one handler', () => {
    expect(client.on).toHaveBeenCalledTimes(1);
  });

  describe('voiceStateUpdate handler', () => {
    let handler;
    const oldState = { channelId: '111', member: { id: 'user1' } };
    const newState = { channelId: '222', member: { id: 'user1' } };

    beforeEach(() => {
      handler = handlers.voiceStateUpdate[0];
    });

    it('should call handleVoiceStateUpdate with oldState and newState', async () => {
      handleVoiceStateUpdate.mockResolvedValue(undefined);

      await handler(oldState, newState);

      expect(handleVoiceStateUpdate).toHaveBeenCalledWith(oldState, newState);
      expect(handleVoiceStateUpdate).toHaveBeenCalledTimes(1);
    });

    it('should resolve successfully when handleVoiceStateUpdate succeeds', async () => {
      handleVoiceStateUpdate.mockResolvedValue(undefined);

      await expect(handler(oldState, newState)).resolves.toBeUndefined();
      expect(logError).not.toHaveBeenCalled();
    });

    it('should catch errors and log them', async () => {
      handleVoiceStateUpdate.mockRejectedValue(new Error('Database connection failed'));

      await handler(oldState, newState);

      expect(logError).toHaveBeenCalledWith('Voice state update handler error', {
        error: 'Database connection failed',
      });
    });

    it('should not throw when handleVoiceStateUpdate rejects', async () => {
      handleVoiceStateUpdate.mockRejectedValue(new Error('unexpected'));

      await expect(handler(oldState, newState)).resolves.toBeUndefined();
    });

    it('should log the error message from the caught error', async () => {
      handleVoiceStateUpdate.mockRejectedValue(new Error('Voice channel not found'));

      await handler(oldState, newState);

      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError.mock.calls[0][1]).toEqual({
        error: 'Voice channel not found',
      });
    });
  });
});
