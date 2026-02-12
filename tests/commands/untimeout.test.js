import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/moderation.js', () => ({
  createCase: vi.fn().mockResolvedValue({ case_number: 1, action: 'untimeout', id: 1 }),
  sendModLogEmbed: vi.fn().mockResolvedValue({ id: 'msg1' }),
  checkHierarchy: vi.fn().mockReturnValue(null),
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

import { adminOnly, data, execute } from '../../src/commands/untimeout.js';
import { checkHierarchy, createCase } from '../../src/modules/moderation.js';

describe('untimeout command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const createInteraction = () => {
    const mockMember = {
      id: 'user1',
      user: { id: 'user1', tag: 'User#0001' },
      roles: { highest: { position: 5 } },
      timeout: vi.fn().mockResolvedValue(undefined),
    };

    return {
      interaction: {
        options: {
          getMember: vi.fn().mockReturnValue(mockMember),
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'reason') return 'test reason';
            return null;
          }),
        },
        guild: { id: 'guild1', name: 'Test Server' },
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

  it('should export data with name "untimeout"', () => {
    expect(data.name).toBe('untimeout');
  });

  it('should export adminOnly as true', () => {
    expect(adminOnly).toBe(true);
  });

  it('should remove timeout from a user successfully', async () => {
    const { interaction, mockMember } = createInteraction();

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(mockMember.timeout).toHaveBeenCalledWith(null, 'test reason');
    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        action: 'untimeout',
        targetId: 'user1',
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('has had their timeout removed'),
    );
  });

  it('should reject when hierarchy check fails', async () => {
    checkHierarchy.mockReturnValueOnce(
      '❌ You cannot moderate a member with an equal or higher role than yours.',
    );
    const { interaction, mockMember } = createInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('cannot moderate'));
    expect(mockMember.timeout).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    createCase.mockRejectedValueOnce(new Error('DB error'));
    const { interaction } = createInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Failed to execute'),
    );
  });
});
