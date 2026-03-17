import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../src/utils/permissions.js', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
  getPermissionError: vi.fn().mockReturnValue('Permission denied'),
}));

vi.mock('../../../src/utils/safeSend.js', () => ({
  safeReply: vi.fn((t, opts) => Promise.resolve(t.reply(opts))),
  safeFollowUp: vi.fn((t, opts) => Promise.resolve(t.followUp(opts))),
}));

vi.mock('../../../src/utils/commandUsage.js', () => ({
  logCommandUsage: vi.fn().mockResolvedValue(undefined),
}));

import { Events } from 'discord.js';
import { error, info, warn } from '../../../src/logger.js';
import { registerCommandInteractionHandler } from '../../../src/modules/events/commandInteraction.js';
import { logCommandUsage } from '../../../src/utils/commandUsage.js';
import { getPermissionError, hasPermission } from '../../../src/utils/permissions.js';

describe('commandInteraction handler', () => {
  let client;
  let handlers;

  beforeEach(() => {
    handlers = {};
    client = {
      on: vi.fn((event, cb) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(cb);
      }),
      commands: new Map(),
    };

    registerCommandInteractionHandler(client);
  });

  afterEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
  });

  function getHandler() {
    return handlers[Events.InteractionCreate][0];
  }

  it('should register interactionCreate handler', () => {
    expect(client.on).toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function));
  });

  it('should handle autocomplete interactions', async () => {
    const autocomplete = vi.fn().mockResolvedValue(undefined);
    client.commands.set('config', { autocomplete });

    const interaction = {
      isAutocomplete: () => true,
      commandName: 'config',
    };

    await getHandler()(interaction);
    expect(autocomplete).toHaveBeenCalledWith(interaction);
  });

  it('should handle autocomplete errors gracefully', async () => {
    const autocomplete = vi.fn().mockRejectedValue(new Error('autocomplete fail'));
    client.commands.set('config', { autocomplete });

    const interaction = {
      isAutocomplete: () => true,
      commandName: 'config',
      respond: vi.fn().mockResolvedValue(undefined),
    };

    await getHandler()(interaction);
    expect(error).toHaveBeenCalledWith('Autocomplete error', {
      command: 'config',
      error: 'autocomplete fail',
    });
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it('should skip autocomplete for commands without autocomplete handler', async () => {
    client.commands.set('ping', {});

    const interaction = {
      isAutocomplete: () => true,
      commandName: 'ping',
      respond: vi.fn().mockResolvedValue(undefined),
    };

    await getHandler()(interaction);
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it('should ignore non-chat interactions', async () => {
    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => false,
      reply: vi.fn(),
    };

    await getHandler()(interaction);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('should deny command when user lacks permission', async () => {
    hasPermission.mockReturnValue(false);
    getPermissionError.mockReturnValue('denied');

    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'config',
      guildId: 'guild1',
      member: {},
      user: { tag: 'user#1' },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await getHandler()(interaction);
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'denied', ephemeral: true });
    expect(warn).toHaveBeenCalledWith('Permission denied', {
      user: 'user#1',
      command: 'config',
    });
  });

  it('should handle command not found', async () => {
    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'missing',
      guildId: 'guild1',
      member: {},
      user: { tag: 'user#1' },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await getHandler()(interaction);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ Command not found.',
      ephemeral: true,
    });
  });

  it('should execute command successfully', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    client.commands.set('ping', { execute });

    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'ping',
      guildId: 'guild1',
      channelId: 'ch1',
      member: {},
      user: { tag: 'user#1', id: 'user1' },
      reply: vi.fn(),
    };

    await getHandler()(interaction);
    expect(execute).toHaveBeenCalledWith(interaction);
    expect(info).toHaveBeenCalledWith('Command executed', {
      command: 'ping',
      user: 'user#1',
      guildId: 'guild1',
      channelId: 'ch1',
    });
    expect(logCommandUsage).toHaveBeenCalledWith({
      guildId: 'guild1',
      userId: 'user1',
      commandName: 'ping',
      channelId: 'ch1',
    });
  });

  it('should handle command execution errors with reply', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('boom'));
    client.commands.set('ping', { execute });

    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'ping',
      guildId: 'guild1',
      member: {},
      user: { tag: 'user#1' },
      replied: false,
      deferred: false,
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn(),
    };

    await getHandler()(interaction);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ An error occurred while executing this command.',
      ephemeral: true,
    });
  });

  it('should handle command execution errors with followUp when already replied', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('boom'));
    client.commands.set('ping', { execute });

    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'ping',
      guildId: 'guild1',
      member: {},
      user: { tag: 'user#1' },
      replied: true,
      deferred: false,
      reply: vi.fn(),
      followUp: vi.fn().mockResolvedValue(undefined),
    };

    await getHandler()(interaction);
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '❌ An error occurred while executing this command.',
      ephemeral: true,
    });
  });
});
