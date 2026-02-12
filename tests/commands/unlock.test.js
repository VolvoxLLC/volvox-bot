import { ChannelType } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/moderation.js', () => ({
  createCase: vi.fn().mockResolvedValue({ case_number: 2, action: 'unlock', id: 2 }),
  sendModLogEmbed: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    moderation: { logging: { channels: { default: '123' } } },
  }),
}));

vi.mock('../../src/logger.js', () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

import { adminOnly, data, execute } from '../../src/commands/unlock.js';
import { createCase, sendModLogEmbed } from '../../src/modules/moderation.js';

describe('unlock command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const createInteraction = (overrides = {}) => ({
    options: {
      getChannel: vi.fn().mockReturnValue(null),
      getString: vi.fn().mockReturnValue(null),
    },
    channel: {
      id: 'chan1',
      name: 'general',
      type: ChannelType.GuildText,
      permissionOverwrites: { edit: vi.fn().mockResolvedValue(undefined) },
      send: vi.fn().mockResolvedValue(undefined),
    },
    guild: {
      id: 'guild1',
      roles: { everyone: { id: 'everyone-role' } },
    },
    user: { id: 'mod1', tag: 'Mod#0001', toString: () => '<@mod1>' },
    client: { channels: { fetch: vi.fn() } },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    deferred: true,
    ...overrides,
  });

  it('should export data with name "unlock"', () => {
    expect(data.name).toBe('unlock');
  });

  it('should export adminOnly as true', () => {
    expect(adminOnly).toBe(true);
  });

  it('should unlock the current channel with SendMessages reset to null', async () => {
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.channel.permissionOverwrites.edit).toHaveBeenCalledWith(
      interaction.guild.roles.everyone,
      { SendMessages: null },
    );
    expect(interaction.channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        action: 'unlock',
        targetId: 'chan1',
        targetTag: '#general',
      }),
    );
    expect(sendModLogEmbed).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('has been unlocked'),
    );
  });

  it('should unlock a specified channel', async () => {
    const targetChannel = {
      id: 'chan2',
      name: 'announcements',
      type: ChannelType.GuildText,
      permissionOverwrites: { edit: vi.fn().mockResolvedValue(undefined) },
      send: vi.fn().mockResolvedValue(undefined),
    };
    const interaction = createInteraction();
    interaction.options.getChannel.mockReturnValue(targetChannel);

    await execute(interaction);

    expect(targetChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
      interaction.guild.roles.everyone,
      { SendMessages: null },
    );
    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        targetId: 'chan2',
        targetTag: '#announcements',
      }),
    );
  });

  it('should include reason in notification and case', async () => {
    const interaction = createInteraction();
    interaction.options.getString.mockReturnValue('raid is over');

    await execute(interaction);

    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        reason: 'raid is over',
      }),
    );
  });

  it('should reject non-text channels', async () => {
    const interaction = createInteraction();
    interaction.channel.type = ChannelType.GuildVoice;

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('text channels'));
    expect(createCase).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    const interaction = createInteraction();
    interaction.channel.permissionOverwrites.edit.mockRejectedValueOnce(new Error('Missing perms'));

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Failed to unlock channel'),
    );
  });
});
