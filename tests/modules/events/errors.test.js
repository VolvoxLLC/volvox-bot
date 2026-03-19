import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  error: vi.fn(),
  warn: vi.fn(),
}));

import { error as logError, warn as logWarn } from '../../../src/logger.js';
import { registerErrorHandlers } from '../../../src/modules/events/errors.js';

describe('registerErrorHandlers', () => {
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
    registerErrorHandlers(client);
  });

  describe('Events.Error handler', () => {
    it('should log discord client errors with structured fields', () => {
      const err = new Error('connection reset');
      err.code = 'ECONNRESET';

      const handler = handlers.error[0];
      handler(err);

      expect(logError).toHaveBeenCalledWith('Discord client error', {
        error: 'connection reset',
        stack: err.stack,
        code: 'ECONNRESET',
        source: 'discord_client',
      });
    });

    it('should handle errors without a code property', () => {
      const err = new Error('generic failure');

      const handler = handlers.error[0];
      handler(err);

      expect(logError).toHaveBeenCalledWith('Discord client error', {
        error: 'generic failure',
        stack: err.stack,
        code: undefined,
        source: 'discord_client',
      });
    });
  });

  describe('Events.ShardDisconnect handler', () => {
    it('should log a warning for non-1000 disconnect codes', () => {
      const handler = handlers.shardDisconnect[0];
      handler({ code: 4000 }, 1);

      expect(logWarn).toHaveBeenCalledWith('Shard disconnected unexpectedly', {
        shardId: 1,
        code: 4000,
        source: 'discord_shard',
      });
    });

    it('should silently ignore code 1000 (normal closure)', () => {
      const handler = handlers.shardDisconnect[0];
      handler({ code: 1000 }, 0);

      expect(logWarn).not.toHaveBeenCalled();
    });
  });
});
