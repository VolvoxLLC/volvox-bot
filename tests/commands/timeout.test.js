import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/moderation.js', () => ({
  createCase: vi.fn().mockResolvedValue({ case_number: 1, action: 'timeout', id: 1 }),
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
  parseDuration: vi.fn().mockReturnValue(3600000),
  formatDuration: vi.fn().mockReturnValue('1 hour'),
}));

vi.mock('../../src/logger.js', () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

import { adminOnly, data, execute } from '../../src/commands/timeout.js';
import { checkHierarchy, createCase, sendDmNotification } from '../../src/modules/moderation.js';
import { parseDuration } from '../../src/utils/duration.js';

describe('timeout command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockMember = {
    id: 'user1',
    user: { id: 'user1', tag: 'User#0001' },
    roles: { highest: { position: 5 } },
    timeout: vi.fn().mockResolvedValue(undefined),
  };

  const createInteraction = () => ({
    options: {
      getMember: vi.fn().mockReturnValue(mockMember),
      getString: vi.fn().mockImplementation((name) => {
        if (name === 'reason') return 'test reason';
        if (name === 'duration') return '1h';
        return null;
      }),
    },
    guild: {
      id: 'guild1',
      name: 'Test Server',
      members: { me: { roles: { highest: { position: 10 } } } },
    },
    member: { roles: { highest: { position: 10 } } },
    user: { id: 'mod1', tag: 'Mod#0001' },
    client: { user: { id: 'bot1', tag: 'Bot#0001' } },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    deferred: true,
  });

  it('should export data with name "timeout"', () => {
    expect(data.name).toBe('timeout');
  });

  it('should export adminOnly as true', () => {
    expect(adminOnly).toBe(true);
  });

  it('should timeout a user successfully', async () => {
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(sendDmNotification).toHaveBeenCalled();
    expect(mockMember.timeout).toHaveBeenCalledWith(3600000, 'test reason');
    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        action: 'timeout',
        targetId: 'user1',
        duration: '1 hour',
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('has been timed out'),
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

  it('should reject durations above 28 days', async () => {
    parseDuration.mockReturnValueOnce(29 * 24 * 60 * 60 * 1000);
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      '❌ Timeout duration cannot exceed 28 days.',
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
    expect(mockMember.timeout).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    createCase.mockRejectedValueOnce(new Error('DB error'));
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('An error occurred'),
    );
  });
});
