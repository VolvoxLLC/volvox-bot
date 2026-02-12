import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/moderation.js', () => ({
  createCase: vi.fn().mockResolvedValue({ case_number: 1, action: 'unban', id: 1 }),
  sendModLogEmbed: vi.fn().mockResolvedValue({ id: 'msg1' }),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    moderation: {
      dmNotifications: { warn: true, kick: true, timeout: true, ban: true },
      logging: { channels: { default: '123' } },
    },
  }),
}));

vi.mock('../../src/logger.js', () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

import { adminOnly, data, execute } from '../../src/commands/unban.js';
import { createCase } from '../../src/modules/moderation.js';

describe('unban command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const createInteraction = () => ({
    options: {
      getString: vi.fn().mockImplementation((name) => {
        if (name === 'user_id') return '123456789';
        if (name === 'reason') return 'test reason';
        return null;
      }),
    },
    guild: {
      id: 'guild1',
      name: 'Test Server',
      members: {
        unban: vi.fn().mockResolvedValue(undefined),
      },
    },
    member: { roles: { highest: { position: 10 } } },
    user: { id: 'mod1', tag: 'Mod#0001' },
    client: {
      user: { id: 'bot1', tag: 'Bot#0001' },
      users: {
        fetch: vi.fn().mockResolvedValue({ tag: 'User#0001' }),
      },
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    deferred: true,
  });

  it('should export data with name "unban"', () => {
    expect(data.name).toBe('unban');
  });

  it('should export adminOnly as true', () => {
    expect(adminOnly).toBe(true);
  });

  it('should unban a user successfully', async () => {
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.guild.members.unban).toHaveBeenCalledWith('123456789', 'test reason');
    expect(interaction.client.users.fetch).toHaveBeenCalledWith('123456789');
    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        action: 'unban',
        targetId: '123456789',
        targetTag: 'User#0001',
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('has been unbanned'),
    );
  });

  it('should fall back to raw user id when user fetch fails', async () => {
    const interaction = createInteraction();
    interaction.client.users.fetch.mockRejectedValueOnce(new Error('not found'));

    await execute(interaction);

    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        targetTag: '123456789',
      }),
    );
  });

  it('should handle unban API failure gracefully', async () => {
    const interaction = createInteraction();
    interaction.guild.members.unban.mockRejectedValueOnce(new Error('unban failed'));

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Failed to execute'),
    );
  });

  it('should handle errors gracefully', async () => {
    createCase.mockRejectedValueOnce(new Error('DB error'));
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Failed to execute'),
    );
  });
});
