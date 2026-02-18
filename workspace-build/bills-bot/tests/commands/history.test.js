import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: (ch, opts) => ch.send(opts),
  safeReply: (t, opts) => t.reply(opts),
  safeFollowUp: (t, opts) => t.followUp(opts),
  safeEditReply: (t, opts) => t.editReply(opts),
}));
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

import { adminOnly, data, execute } from '../../src/commands/history.js';
import { getPool } from '../../src/db.js';

const mockCaseRows = [
  {
    case_number: 2,
    action: 'timeout',
    target_id: 'user1',
    target_tag: 'User#0001',
    moderator_id: 'mod1',
    moderator_tag: 'Mod#0001',
    reason: 'Second offense',
    created_at: '2026-01-02T00:00:00Z',
  },
  {
    case_number: 1,
    action: 'warn',
    target_id: 'user1',
    target_tag: 'User#0001',
    moderator_id: 'mod1',
    moderator_tag: 'Mod#0001',
    reason: 'First warning',
    created_at: '2026-01-01T00:00:00Z',
  },
];

function createInteraction() {
  return {
    options: {
      getUser: vi.fn().mockReturnValue({
        id: 'user1',
        tag: 'User#0001',
        displayAvatarURL: vi.fn().mockReturnValue('https://cdn.discordapp.com/avatar.png'),
      }),
    },
    guild: { id: 'guild1' },
    user: { id: 'mod1', tag: 'Mod#0001' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

describe('history command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with correct name', () => {
    expect(data.name).toBe('history');
  });

  it('should export adminOnly flag', () => {
    expect(adminOnly).toBe(true);
  });

  it('should display moderation history for a user', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: mockCaseRows }) };
    getPool.mockReturnValue(mockPool);

    const interaction = createInteraction();
    await execute(interaction);

    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [
      'guild1',
      'user1',
    ]);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('should handle no history found', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    getPool.mockReturnValue(mockPool);

    const interaction = createInteraction();
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('No moderation history'),
    );
  });

  it('should handle errors gracefully', async () => {
    getPool.mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error('DB error')),
    });

    const interaction = createInteraction();
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch'));
  });
});
