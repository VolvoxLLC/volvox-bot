import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('../../../src/logger.js', () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock('../../../src/utils/registerCommands.js', () => ({
  registerCommands: vi.fn().mockResolvedValue(undefined),
}));

import logger from '../../../src/logger.js';
import { registerClientReadyHandler } from '../../../src/modules/events/clientReady.js';
import { registerCommands } from '../../../src/utils/registerCommands.js';

describe('clientReady handler', () => {
  let client;
  let onceHandlers;

  beforeEach(() => {
    onceHandlers = {};
    client = {
      once: vi.fn((event, cb) => {
        if (!onceHandlers[event]) onceHandlers[event] = [];
        onceHandlers[event].push(cb);
      }),
      user: { id: 'bot-user-id' },
      commands: new Map(),
    };

    process.env.DISCORD_TOKEN = 'test-token';
    registerClientReadyHandler(client);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.DISCORD_TOKEN;
  });

  it('should register clientReady once handler', () => {
    expect(client.once).toHaveBeenCalledWith('clientReady', expect.any(Function));
  });

  it('should register commands on clientReady', async () => {
    client.commands.set('ping', { data: { name: 'ping' }, execute: vi.fn() });

    await onceHandlers.clientReady[0]();

    expect(registerCommands).toHaveBeenCalledWith(
      Array.from(client.commands.values()),
      'bot-user-id',
      'test-token',
    );
  });

  it('should handle command registration failure', async () => {
    const failure = new Error('register fail');
    registerCommands.mockRejectedValueOnce(failure);

    await onceHandlers.clientReady[0]();

    expect(logger.error).toHaveBeenCalledWith('Command registration failed', {
      error: 'register fail',
      stack: failure.stack,
    });
  });
});
