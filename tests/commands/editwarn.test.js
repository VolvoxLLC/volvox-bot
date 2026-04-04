import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/safeSend.js', () => ({
  safeEditReply: (t, opts) => t.editReply(opts),
}));

vi.mock('../../src/modules/warningEngine.js', () => ({
  editWarning: vi
    .fn()
    .mockResolvedValue({ id: 1, reason: 'updated', severity: 'medium', points: 2 }),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({ moderation: { warnings: {} } }),
}));

vi.mock('../../src/logger.js', () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

import { data, execute, moderatorOnly } from '../../src/commands/editwarn.js';
import * as logger from '../../src/logger.js';
import { editWarning } from '../../src/modules/warningEngine.js';

describe('editwarn command', () => {
  afterEach(() => vi.clearAllMocks());

  const createInteraction = (opts = {}) => ({
    options: {
      getInteger: vi.fn().mockReturnValue(opts.id ?? 1),
      getString: vi.fn().mockImplementation((name) => {
        if (name === 'reason') return opts.reason ?? 'new reason';
        if (name === 'severity') return opts.severity ?? null;
        return null;
      }),
    },
    guild: { id: 'guild1' },
    guildId: 'guild1',
    user: { id: 'mod1', tag: 'Mod#0001' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  });

  it('should export data with name "editwarn"', () => {
    expect(data.name).toBe('editwarn');
  });

  it('should export moderatorOnly as true', () => {
    expect(moderatorOnly).toBe(true);
  });

  it('should edit a warning successfully', async () => {
    const interaction = createInteraction();
    await execute(interaction);
    expect(editWarning).toHaveBeenCalledWith(
      'guild1',
      1,
      { reason: 'new reason' },
      expect.any(Object),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('updated'));
  });

  it('should reject when no updates provided', async () => {
    const interaction = createInteraction({ reason: null, severity: null });
    interaction.options.getString.mockReturnValue(null);
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('must provide'));
  });

  it('should return error when warning not found', async () => {
    editWarning.mockResolvedValueOnce(null);
    const interaction = createInteraction();
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('should include channelId in info log when warning is edited', async () => {
    const interaction = { ...createInteraction(), channelId: 'channel-editwarn' };
    await execute(interaction);

    expect(logger.info).toHaveBeenCalledWith(
      'Warning edited via command',
      expect.objectContaining({
        guildId: 'guild1',
        channelId: 'channel-editwarn',
      }),
    );
  });
});
