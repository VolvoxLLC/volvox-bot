import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/moderation.js', () => ({
  createCase: vi.fn().mockResolvedValue({ case_number: 1, action: 'warn', id: 1 }),
  sendDmNotification: vi.fn().mockResolvedValue(undefined),
  sendModLogEmbed: vi.fn().mockResolvedValue({ id: 'msg1' }),
  checkEscalation: vi.fn().mockResolvedValue(null),
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

vi.mock('../../src/logger.js', () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

import { adminOnly, data, execute } from '../../src/commands/warn.js';
import {
  checkEscalation,
  checkHierarchy,
  createCase,
  sendDmNotification,
  sendModLogEmbed,
} from '../../src/modules/moderation.js';

describe('warn command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockMember = {
    id: 'user1',
    user: { id: 'user1', tag: 'User#0001' },
    roles: { highest: { position: 5 } },
  };

  const createInteraction = () => ({
    options: {
      getMember: vi.fn().mockReturnValue(mockMember),
      getString: vi.fn().mockImplementation((name) => {
        if (name === 'reason') return 'test reason';
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

  it('should export data with name "warn"', () => {
    expect(data.name).toBe('warn');
  });

  it('should export adminOnly as true', () => {
    expect(adminOnly).toBe(true);
  });

  it('should warn a user successfully', async () => {
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(sendDmNotification).toHaveBeenCalled();
    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        action: 'warn',
        targetId: 'user1',
        targetTag: 'User#0001',
      }),
    );
    expect(sendModLogEmbed).toHaveBeenCalled();
    expect(checkEscalation).toHaveBeenCalledWith(
      interaction.client,
      'guild1',
      'user1',
      'bot1',
      'Bot#0001',
      expect.objectContaining({
        moderation: expect.any(Object),
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('has been warned'));
  });

  it('should reject when hierarchy check fails', async () => {
    checkHierarchy.mockReturnValueOnce(
      '❌ You cannot moderate a member with an equal or higher role than yours.',
    );
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('cannot moderate'));
    expect(createCase).not.toHaveBeenCalled();
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
