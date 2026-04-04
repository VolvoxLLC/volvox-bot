import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/safeSend.js', () => ({
  safeEditReply: (t, opts) => t.editReply(opts),
}));

vi.mock('../../src/modules/warningEngine.js', () => ({
  removeWarning: vi.fn().mockResolvedValue({ id: 1, user_id: 'user1', active: false }),
}));

vi.mock('../../src/logger.js', () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

import { data, execute, moderatorOnly } from '../../src/commands/removewarn.js';
import * as logger from '../../src/logger.js';
import { removeWarning } from '../../src/modules/warningEngine.js';

describe('removewarn command', () => {
  afterEach(() => vi.clearAllMocks());

  const createInteraction = () => ({
    options: {
      getInteger: vi.fn().mockReturnValue(1),
      getString: vi.fn().mockReturnValue('pardoned'),
    },
    guild: { id: 'guild1' },
    user: { id: 'mod1', tag: 'Mod#0001' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  });

  it('should export data with name "removewarn"', () => {
    expect(data.name).toBe('removewarn');
  });

  it('should export moderatorOnly as true', () => {
    expect(moderatorOnly).toBe(true);
  });

  it('should remove a warning successfully', async () => {
    const interaction = createInteraction();
    await execute(interaction);
    expect(removeWarning).toHaveBeenCalledWith('guild1', 1, 'mod1', 'pardoned');
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('removed'));
  });

  it('should return error when warning not found', async () => {
    removeWarning.mockResolvedValueOnce(null);
    const interaction = createInteraction();
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('should handle errors gracefully', async () => {
    removeWarning.mockRejectedValueOnce(new Error('DB error'));
    const interaction = createInteraction();
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Failed'));
  });

  it('should include channelId in info log when warning is removed', async () => {
    const interaction = { ...createInteraction(), channelId: 'channel-removewarn' };
    await execute(interaction);

    expect(logger.info).toHaveBeenCalledWith(
      'Warning removed via command',
      expect.objectContaining({
        guildId: 'guild1',
        channelId: 'channel-removewarn',
      }),
    );
  });
});
