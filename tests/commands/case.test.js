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
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    moderation: { logging: { channels: { default: '123', warns: '456' } } },
  }),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

import { adminOnly, data, execute } from '../../src/commands/case.js';
import { getPool } from '../../src/db.js';

const mockCaseRow = {
  id: 1,
  guild_id: 'guild1',
  case_number: 1,
  action: 'warn',
  target_id: 'user1',
  target_tag: 'User#0001',
  moderator_id: 'mod1',
  moderator_tag: 'Mod#0001',
  reason: 'Test reason',
  created_at: '2026-01-01T00:00:00Z',
};

function createInteraction(subcommand, overrides = {}) {
  return {
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getInteger: vi.fn().mockReturnValue(1),
      getUser: vi.fn().mockReturnValue({ id: 'user1', tag: 'User#0001' }),
      getString: vi.fn().mockReturnValue(null),
    },
    guild: { id: 'guild1' },
    user: { id: 'mod1', tag: 'Mod#0001' },
    client: { channels: { fetch: vi.fn().mockResolvedValue(null) } },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('case command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with correct name', () => {
    expect(data.name).toBe('case');
  });

  it('should export adminOnly flag', () => {
    expect(adminOnly).toBe(true);
  });

  describe('view subcommand', () => {
    it('should display a case by number', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [mockCaseRow] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('view');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), ['guild1', 1]);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should handle case not found', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('view');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('Case #1 not found.');
    });
  });

  describe('list subcommand', () => {
    it('should list recent cases', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [mockCaseRow] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should filter by user', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [mockCaseRow] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      interaction.options.getUser = vi.fn().mockReturnValue({ id: 'user1' });
      interaction.options.getString = vi.fn().mockReturnValue(null);
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('target_id'),
        expect.arrayContaining(['user1']),
      );
    });

    it('should filter by type', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [mockCaseRow] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      interaction.options.getUser = vi.fn().mockReturnValue(null);
      interaction.options.getString = vi.fn().mockReturnValue('warn');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('action'),
        expect.arrayContaining(['warn']),
      );
    });

    it('should filter by both user and type', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [mockCaseRow] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      interaction.options.getUser = vi.fn().mockReturnValue({ id: 'user1' });
      interaction.options.getString = vi.fn().mockReturnValue('warn');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('target_id'),
        expect.arrayContaining(['user1', 'warn']),
      );
    });

    it('should handle no cases found', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('No cases found'));
    });

    it('should truncate long reasons', async () => {
      const longReasonCase = { ...mockCaseRow, reason: 'A'.repeat(60) };
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [longReasonCase] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should handle cases with no reason', async () => {
      const noReasonCase = { ...mockCaseRow, reason: null };
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [noReasonCase] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });
  });

  describe('reason subcommand', () => {
    it('should update case reason', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [{ ...mockCaseRow, log_message_id: null }] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('reason');
      interaction.options.getString = vi.fn().mockReturnValue('New reason');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE'), [
        'New reason',
        'guild1',
        1,
      ]);
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Updated reason'));
    });

    it('should edit log message when log_message_id exists', async () => {
      const caseWithLog = {
        ...mockCaseRow,
        log_message_id: 'logmsg1',
        action: 'warn',
      };
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [caseWithLog] }),
      };
      getPool.mockReturnValue(mockPool);

      const mockMessage = { edit: vi.fn().mockResolvedValue(undefined) };
      const mockLogChannel = { messages: { fetch: vi.fn().mockResolvedValue(mockMessage) } };
      const interaction = createInteraction('reason');
      interaction.options.getString = vi.fn().mockReturnValue('Updated reason');
      interaction.client = { channels: { fetch: vi.fn().mockResolvedValue(mockLogChannel) } };
      await execute(interaction);

      expect(mockLogChannel.messages.fetch).toHaveBeenCalledWith('logmsg1');
      expect(mockMessage.edit).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Updated reason'));
    });

    it('should handle log message edit failure gracefully', async () => {
      const caseWithLog = {
        ...mockCaseRow,
        log_message_id: 'logmsg1',
        action: 'warn',
      };
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [caseWithLog] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('reason');
      interaction.options.getString = vi.fn().mockReturnValue('Updated reason');
      interaction.client = {
        channels: { fetch: vi.fn().mockRejectedValue(new Error('Not found')) },
      };
      await execute(interaction);

      // Should still succeed even if log edit fails
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Updated reason'));
    });

    it('should handle case not found on reason update', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('reason');
      interaction.options.getString = vi.fn().mockReturnValue('New reason');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('Case #1 not found.');
    });
  });

  describe('delete subcommand', () => {
    it('should delete a case', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [mockCaseRow] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('delete');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE'), ['guild1', 1]);
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Deleted case'));
    });

    it('should handle case not found on delete', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('delete');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('Case #1 not found.');
    });
  });

  it('should handle errors gracefully', async () => {
    getPool.mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error('DB error')),
    });

    const interaction = createInteraction('view');
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Failed to execute'),
    );
  });
});
