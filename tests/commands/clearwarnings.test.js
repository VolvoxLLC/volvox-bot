import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/safeSend.js', () => ({
  safeEditReply: (t, opts) => t.editReply(opts),
}));

vi.mock('../../src/modules/warningEngine.js', () => ({
  clearWarnings: vi.fn().mockResolvedValue(3),
}));

vi.mock('../../src/logger.js', () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

import { data, execute, moderatorOnly } from '../../src/commands/clearwarnings.js';
import * as logger from '../../src/logger.js';
import { clearWarnings } from '../../src/modules/warningEngine.js';

describe('clearwarnings command', () => {
  afterEach(() => vi.clearAllMocks());

  const createInteraction = () => ({
    options: {
      getUser: vi.fn().mockReturnValue({ id: 'user1', tag: 'User#0001' }),
      getString: vi.fn().mockReturnValue('clean slate'),
    },
    guild: { id: 'guild1' },
    user: { id: 'mod1', tag: 'Mod#0001' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  });

  it('should export data with name "clearwarnings"', () => {
    expect(data.name).toBe('clearwarnings');
  });

  it('should export moderatorOnly as true', () => {
    expect(moderatorOnly).toBe(true);
  });

  it('should clear warnings successfully', async () => {
    const interaction = createInteraction();
    await execute(interaction);
    expect(clearWarnings).toHaveBeenCalledWith('guild1', 'user1', 'mod1', 'clean slate');
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Cleared **3**'));
  });

  it('should handle no active warnings', async () => {
    clearWarnings.mockResolvedValueOnce(0);
    const interaction = createInteraction();
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('No active warnings'),
    );
  });

  it('should handle errors gracefully', async () => {
    clearWarnings.mockRejectedValueOnce(new Error('DB error'));
    const interaction = createInteraction();
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Failed'));
  });

  it('should include channelId in info log when warnings are cleared', async () => {
    const interaction = { ...createInteraction(), channelId: 'channel-clearwarn' };
    await execute(interaction);

    expect(logger.info).toHaveBeenCalledWith(
      'Warnings cleared via command',
      expect.objectContaining({
        guildId: 'guild1',
        channelId: 'channel-clearwarn',
      }),
    );
  });
});
