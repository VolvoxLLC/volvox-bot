import { afterEach, describe, expect, it, vi } from 'vitest';

const discordMocks = vi.hoisted(() => ({
  put: vi.fn(),
  setToken: vi.fn(),
  routeGlobal: vi.fn((clientId) => `/applications/${clientId}/commands`),
  routeGuild: vi.fn((clientId, guildId) => `/applications/${clientId}/guilds/${guildId}/commands`),
}));

vi.mock('discord.js', () => {
  class REST {
    constructor() {
      this.put = discordMocks.put;
    }

    setToken(token) {
      discordMocks.setToken(token);
      return this;
    }
  }

  return {
    REST,
    Routes: {
      applicationCommands: discordMocks.routeGlobal,
      applicationGuildCommands: discordMocks.routeGuild,
    },
  };
});

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
}));

import { registerCommands } from '../../src/utils/registerCommands.js';

describe('registerCommands', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should throw if commands is not an array', async () => {
    await expect(registerCommands(null, 'client-id', 'token')).rejects.toThrow(
      'Commands must be an array',
    );
  });

  it('should throw if clientId or token is missing', async () => {
    await expect(registerCommands([], null, 'token')).rejects.toThrow(
      'Client ID and token are required',
    );
    await expect(registerCommands([], 'client-id', null)).rejects.toThrow(
      'Client ID and token are required',
    );
  });

  it('should throw if command lacks .data.toJSON()', async () => {
    const commands = [{ data: {} }];
    await expect(registerCommands(commands, 'client-id', 'token')).rejects.toThrow(
      'Each command must have a .data property with toJSON() method',
    );
  });

  it('should register global commands when no guildId', async () => {
    const commands = [{ data: { toJSON: () => ({ name: 'ping', description: 'Ping' }) } }];
    discordMocks.put.mockResolvedValue([{ name: 'ping' }]);

    await registerCommands(commands, 'client-id', 'token');

    expect(discordMocks.setToken).toHaveBeenCalledWith('token');
    expect(discordMocks.routeGlobal).toHaveBeenCalledWith('client-id');
    expect(discordMocks.put).toHaveBeenCalledWith('/applications/client-id/commands', {
      body: [{ name: 'ping', description: 'Ping' }],
    });
  });

  it('should register guild commands when guildId is provided', async () => {
    const commands = [{ data: { toJSON: () => ({ name: 'ping', description: 'Ping' }) } }];
    discordMocks.put.mockResolvedValue([{ name: 'ping' }]);

    await registerCommands(commands, 'client-id', 'token', 'guild-id');

    expect(discordMocks.routeGuild).toHaveBeenCalledWith('client-id', 'guild-id');
    expect(discordMocks.put).toHaveBeenCalledWith(
      '/applications/client-id/guilds/guild-id/commands',
      { body: [{ name: 'ping', description: 'Ping' }] },
    );
  });

  it('should throw on API failure', async () => {
    const commands = [{ data: { toJSON: () => ({ name: 'ping', description: 'Ping' }) } }];
    discordMocks.put.mockRejectedValue(new Error('Discord API error'));

    await expect(registerCommands(commands, 'client-id', 'token')).rejects.toThrow(
      'Discord API error',
    );
  });
});
