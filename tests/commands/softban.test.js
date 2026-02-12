import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/moderation.js', () => ({
  createCase: vi.fn().mockResolvedValue({ case_number: 1, action: 'softban', id: 1 }),
  sendDmNotification: vi.fn().mockResolvedValue(undefined),
  sendModLogEmbed: vi.fn().mockResolvedValue({ id: 'msg1' }),
  checkHierarchy: vi.fn().mockReturnValue(null),
  shouldSendDm: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    moderation: {
      dmNotifications: { warn: true, kick: true, timeout: true, ban: true, softban: true },
      logging: { channels: { default: '123' } },
    },
  }),
}));

vi.mock('../../src/logger.js', () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

import { adminOnly, data, execute } from '../../src/commands/softban.js';
import { checkHierarchy, createCase, sendDmNotification } from '../../src/modules/moderation.js';

describe('softban command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const createInteraction = () => {
    const mockMember = {
      id: 'user1',
      user: { id: 'user1', tag: 'User#0001' },
      roles: { highest: { position: 5 } },
    };

    return {
      interaction: {
        options: {
          getMember: vi.fn().mockReturnValue(mockMember),
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'reason') return 'test reason';
            return null;
          }),
          getInteger: vi.fn().mockReturnValue(null),
        },
        guild: {
          id: 'guild1',
          name: 'Test Server',
          members: {
            ban: vi.fn().mockResolvedValue(undefined),
            unban: vi.fn().mockResolvedValue(undefined),
            me: { roles: { highest: { position: 10 } } },
          },
        },
        member: { roles: { highest: { position: 10 } } },
        user: { id: 'mod1', tag: 'Mod#0001' },
        client: { user: { id: 'bot1', tag: 'Bot#0001' } },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        deferred: true,
      },
      mockMember,
    };
  };

  it('should export data with name "softban"', () => {
    expect(data.name).toBe('softban');
  });

  it('should export adminOnly as true', () => {
    expect(adminOnly).toBe(true);
  });

  it('should softban a user successfully', async () => {
    const { interaction } = createInteraction();

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(sendDmNotification).toHaveBeenCalled();
    expect(interaction.guild.members.ban).toHaveBeenCalledWith('user1', {
      deleteMessageSeconds: 7 * 86400,
      reason: 'test reason',
    });
    expect(interaction.guild.members.unban).toHaveBeenCalledWith('user1', 'Softban');
    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        action: 'softban',
        targetId: 'user1',
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('has been soft-banned'),
    );
  });

  it('should retry unban when first attempt fails', async () => {
    const { interaction } = createInteraction();
    interaction.guild.members.unban
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);

    vi.useFakeTimers();
    const run = execute(interaction);
    await vi.runAllTimersAsync();
    await run;
    vi.useRealTimers();

    expect(interaction.guild.members.unban).toHaveBeenCalledTimes(2);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('has been soft-banned'),
    );
  });

  it('should handle getMember returning null', async () => {
    const { interaction } = createInteraction();
    interaction.options.getMember.mockReturnValueOnce(null);

    await execute(interaction);

    expect(interaction.guild.members.ban).not.toHaveBeenCalled();
    expect(interaction.guild.members.unban).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith('❌ User is not in this server.');
  });

  it('should warn moderator if unban keeps failing but still create case', async () => {
    const { interaction } = createInteraction();
    interaction.guild.members.unban.mockRejectedValue(new Error('still failing'));

    vi.useFakeTimers();
    const run = execute(interaction);
    await vi.runAllTimersAsync();
    await run;
    vi.useRealTimers();

    expect(interaction.guild.members.unban).toHaveBeenCalledTimes(3);
    expect(createCase).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('unban failed'));
  });

  it('should reject when hierarchy check fails', async () => {
    checkHierarchy.mockReturnValueOnce(
      '❌ You cannot moderate a member with an equal or higher role than yours.',
    );
    const { interaction } = createInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('cannot moderate'));
    expect(interaction.guild.members.ban).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    createCase.mockRejectedValueOnce(new Error('DB error'));
    const { interaction } = createInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('An error occurred'),
    );
  });
});
