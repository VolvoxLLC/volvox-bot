import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: (ch, opts) => ch.send(opts),
  safeReply: (t, opts) => t.reply(opts),
  safeFollowUp: (t, opts) => t.followUp(opts),
  safeEditReply: (t, opts) => t.editReply(opts),
}));

vi.mock('../../src/modules/warningEngine.js', () => ({
  getWarnings: vi.fn().mockResolvedValue([]),
  getActiveWarningStats: vi.fn().mockResolvedValue({ count: 0, points: 0 }),
}));

vi.mock('../../src/logger.js', () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

import { data, execute, moderatorOnly } from '../../src/commands/warnings.js';
import { getActiveWarningStats, getWarnings } from '../../src/modules/warningEngine.js';

describe('warnings command', () => {
  afterEach(() => vi.clearAllMocks());

  const createInteraction = () => ({
    options: {
      getUser: vi.fn().mockReturnValue({
        id: 'user1',
        tag: 'User#0001',
        displayAvatarURL: () => 'https://cdn.example.com/avatar.png',
      }),
      getBoolean: vi.fn().mockReturnValue(false),
      getInteger: vi.fn().mockReturnValue(null),
    },
    guild: { id: 'guild1' },
    guildId: 'guild1',
    user: { id: 'mod1', tag: 'Mod#0001' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  });

  it('should export data with name "warnings"', () => {
    expect(data.name).toBe('warnings');
  });

  it('should export moderatorOnly as true', () => {
    expect(moderatorOnly).toBe(true);
  });

  it('should show no warnings message when empty', async () => {
    const interaction = createInteraction();
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('No warnings found'),
    );
  });

  it('should display warnings as embed', async () => {
    getWarnings.mockResolvedValueOnce([
      {
        id: 1,
        severity: 'low',
        points: 1,
        active: true,
        reason: 'spam',
        created_at: new Date(),
        case_id: 5,
      },
      {
        id: 2,
        severity: 'high',
        points: 3,
        active: false,
        reason: 'toxic',
        created_at: new Date(),
        case_id: null,
        removal_reason: 'Expired',
      },
    ]);
    getActiveWarningStats.mockResolvedValueOnce({ count: 1, points: 1 });

    const interaction = createInteraction();
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('should handle errors gracefully', async () => {
    getWarnings.mockRejectedValueOnce(new Error('DB error'));
    const interaction = createInteraction();
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch'));
  });
});
