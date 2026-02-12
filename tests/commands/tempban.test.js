import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/moderation.js', () => ({
  createCase: vi.fn().mockResolvedValue({ case_number: 1, action: 'tempban', id: 1 }),
  scheduleAction: vi.fn().mockResolvedValue({ id: 10 }),
  sendDmNotification: vi.fn().mockResolvedValue(undefined),
  sendModLogEmbed: vi.fn().mockResolvedValue({ id: 'msg1' }),
  checkHierarchy: vi.fn().mockReturnValue(null),
  shouldSendDm: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    moderation: {
      dmNotifications: { warn: true, kick: true, timeout: true, ban: true },
      logging: { channels: { default: '123' } },
    },
  }),
}));

vi.mock('../../src/utils/duration.js', () => ({
  parseDuration: vi.fn().mockReturnValue(86400000),
  formatDuration: vi.fn().mockReturnValue('1 day'),
}));

vi.mock('../../src/logger.js', () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

import { adminOnly, data, execute } from '../../src/commands/tempban.js';
import {
  checkHierarchy,
  createCase,
  scheduleAction,
  sendDmNotification,
} from '../../src/modules/moderation.js';
import { parseDuration } from '../../src/utils/duration.js';

describe('tempban command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockUser = { id: 'user1', tag: 'User#0001' };
  const mockMember = {
    id: 'user1',
    user: mockUser,
    roles: { highest: { position: 5 } },
  };

  const createInteraction = () => ({
    options: {
      getUser: vi.fn().mockReturnValue(mockUser),
      getString: vi.fn().mockImplementation((name) => {
        if (name === 'reason') return 'test reason';
        if (name === 'duration') return '1d';
        return null;
      }),
      getInteger: vi.fn().mockReturnValue(0),
    },
    guild: {
      id: 'guild1',
      name: 'Test Server',
      members: {
        ban: vi.fn().mockResolvedValue(undefined),
        fetch: vi.fn().mockResolvedValue(mockMember),
      },
    },
    member: { roles: { highest: { position: 10 } } },
    user: { id: 'mod1', tag: 'Mod#0001' },
    client: { user: { id: 'bot1', tag: 'Bot#0001' } },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    deferred: true,
  });

  it('should export data with name "tempban"', () => {
    expect(data.name).toBe('tempban');
  });

  it('should export adminOnly as true', () => {
    expect(adminOnly).toBe(true);
  });

  it('should tempban a user successfully', async () => {
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(sendDmNotification).toHaveBeenCalled();
    expect(interaction.guild.members.ban).toHaveBeenCalledWith('user1', {
      deleteMessageSeconds: 0,
      reason: 'test reason',
    });
    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        action: 'tempban',
        targetId: 'user1',
        duration: '1 day',
      }),
    );
    expect(scheduleAction).toHaveBeenCalledWith('guild1', 'unban', 'user1', 1, expect.any(Date));
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('has been temporarily banned'),
    );
  });

  it('should reject invalid duration', async () => {
    parseDuration.mockReturnValueOnce(null);
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Invalid duration format'),
    );
    expect(createCase).not.toHaveBeenCalled();
  });

  it('should reject when hierarchy check fails', async () => {
    checkHierarchy.mockReturnValueOnce(
      '❌ You cannot moderate a member with an equal or higher role than yours.',
    );
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('cannot moderate'));
    expect(interaction.guild.members.ban).not.toHaveBeenCalled();
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
