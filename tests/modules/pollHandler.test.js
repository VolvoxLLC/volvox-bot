import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('discord.js', () => {
  const EmbedBuilder = vi.fn().mockImplementation(function () {
    this.data = {};
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setColor = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
  });
  const ButtonBuilder = vi.fn().mockImplementation(function () {
    this.setCustomId = vi.fn().mockReturnThis();
    this.setLabel = vi.fn().mockReturnThis();
    this.setStyle = vi.fn().mockReturnThis();
    this.setDisabled = vi.fn().mockReturnThis();
  });
  const ActionRowBuilder = vi.fn().mockImplementation(function () {
    this.components = [];
    this.addComponents = vi.fn().mockImplementation(function (c) {
      this.components.push(c);
      return this;
    });
  });
  return {
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle: { Primary: 1 },
  };
});

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/utils/discordCache.js', () => ({
  fetchChannelCached: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeReply: vi.fn(),
}));

import { getPool } from '../../src/db.js';
import { info, error as logError } from '../../src/logger.js';
import {
  buildPollButtons,
  buildPollEmbed,
  closeExpiredPolls,
  closePoll,
  handlePollVote,
} from '../../src/modules/pollHandler.js';
import { fetchChannelCached } from '../../src/utils/discordCache.js';
import { safeReply } from '../../src/utils/safeSend.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePoll(overrides = {}) {
  return {
    id: 1,
    question: 'Favorite color?',
    options: ['Red', 'Blue', 'Green'],
    votes: {},
    closed: false,
    closes_at: null,
    multi_vote: false,
    guild_id: 'g1',
    channel_id: 'ch1',
    message_id: 'msg1',
    anonymous: false,
    ...overrides,
  };
}

function makeInteraction(overrides = {}) {
  return {
    customId: 'poll_vote_1_0',
    guildId: 'g1',
    user: { id: 'u1' },
    message: {
      edit: vi.fn(),
      channel: { threads: {} },
    },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('pollHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── buildPollEmbed ──────────────────────────────────────────────────────

  describe('buildPollEmbed', () => {
    it('should build an embed with zero votes', () => {
      const poll = makePoll();
      const embed = buildPollEmbed(poll);
      expect(embed.setTitle).toHaveBeenCalledWith(expect.stringContaining('Favorite color?'));
      expect(embed.setDescription).toHaveBeenCalled();
      expect(embed.setColor).toHaveBeenCalledWith(0x5865f2);
      expect(embed.setFooter).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('Poll #1') }),
      );
    });

    it('should show vote counts and percentages', () => {
      const poll = makePoll({
        votes: { u1: [0], u2: [1], u3: [0] },
      });
      const embed = buildPollEmbed(poll);
      // Description should contain vote counts
      const desc = embed.setDescription.mock.calls[0][0];
      expect(desc).toContain('2 votes');
      expect(desc).toContain('1 vote)');
    });

    it('should show closed footer when poll is closed', () => {
      const poll = makePoll({ closed: true });
      const embed = buildPollEmbed(poll);
      expect(embed.setFooter).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('Closed') }),
      );
    });

    it('should show closes_at timestamp when set', () => {
      const poll = makePoll({ closes_at: '2026-12-31T00:00:00Z' });
      const embed = buildPollEmbed(poll);
      expect(embed.setFooter).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('Closes') }),
      );
    });

    it('should show multi_vote note in description', () => {
      const poll = makePoll({ multi_vote: true });
      const embed = buildPollEmbed(poll);
      const calls = embed.setDescription.mock.calls;
      const lastDesc = calls[calls.length - 1][0];
      expect(lastDesc).toContain('Multiple votes allowed');
    });

    it('should truncate long questions', () => {
      const poll = makePoll({ question: 'A'.repeat(300) });
      const embed = buildPollEmbed(poll);
      const title = embed.setTitle.mock.calls[0][0];
      expect(title.length).toBeLessThanOrEqual(260);
    });

    it('should handle null votes gracefully', () => {
      const poll = makePoll({ votes: null });
      expect(() => buildPollEmbed(poll)).not.toThrow();
    });

    it('should ignore out-of-range vote indices', () => {
      const poll = makePoll({ votes: { u1: [99] } });
      const embed = buildPollEmbed(poll);
      const desc = embed.setDescription.mock.calls[0][0];
      expect(desc).toContain('0%');
    });
  });

  // ── buildPollButtons ────────────────────────────────────────────────────

  describe('buildPollButtons', () => {
    it('should create one row for up to 5 options', () => {
      const rows = buildPollButtons(1, ['A', 'B', 'C'], false);
      expect(rows).toHaveLength(1);
      expect(rows[0].components).toHaveLength(3);
    });

    it('should create multiple rows when more than 5 options', () => {
      const options = ['A', 'B', 'C', 'D', 'E', 'F'];
      const rows = buildPollButtons(1, options, false);
      expect(rows).toHaveLength(2);
      expect(rows[0].components).toHaveLength(5);
      expect(rows[1].components).toHaveLength(1);
    });

    it('should truncate long option labels', () => {
      const longLabel = 'X'.repeat(200);
      const rows = buildPollButtons(1, [longLabel], false);
      expect(rows).toHaveLength(1);
      // Assert label was truncated to <= 80 characters
      const firstButton = rows[0].components[0];
      const labelArg = firstButton.setLabel.mock.calls[0][0];
      expect(labelArg.length).toBeLessThanOrEqual(80);
    });

    it('should set disabled state on buttons', () => {
      const rows = buildPollButtons(1, ['A'], true);
      expect(rows[0].components[0].setDisabled).toHaveBeenCalledWith(true);
    });
  });

  // ── handlePollVote ──────────────────────────────────────────────────────

  describe('handlePollVote', () => {
    let mockClient;
    let mockPool;

    beforeEach(() => {
      mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };
      mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };
      getPool.mockReturnValue(mockPool);
    });

    it('should ignore non-matching custom IDs', async () => {
      const interaction = makeInteraction({ customId: 'not_a_poll' });
      await handlePollVote(interaction);
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('should reply error when poll not found', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // SELECT

      const interaction = makeInteraction();
      await handlePollVote(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('no longer exists') }),
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should reply error when poll is closed', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePoll({ closed: true })] });

      const interaction = makeInteraction();
      await handlePollVote(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('closed') }),
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should reply error when poll has expired', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePoll({ closes_at: '2020-01-01T00:00:00Z' })] });

      const interaction = makeInteraction();
      await handlePollVote(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('expired') }),
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should reply error for invalid option index', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePoll()] });

      const interaction = makeInteraction({ customId: 'poll_vote_1_99' });
      await handlePollVote(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Invalid option') }),
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should record a new vote (single-vote mode)', async () => {
      const poll = makePoll();
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [poll] }) // SELECT
        .mockResolvedValueOnce(undefined) // UPDATE
        .mockResolvedValueOnce(undefined); // COMMIT

      const interaction = makeInteraction();
      await handlePollVote(interaction);

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Voted for') }),
      );
    });

    it('should toggle off an existing vote (single-vote mode)', async () => {
      const poll = makePoll({ votes: { u1: [0] } });
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [poll] })
        .mockResolvedValueOnce(undefined) // UPDATE
        .mockResolvedValueOnce(undefined); // COMMIT

      const interaction = makeInteraction();
      await handlePollVote(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Vote removed') }),
      );
    });

    it('should allow adding multiple votes in multi-vote mode', async () => {
      const poll = makePoll({ multi_vote: true, votes: { u1: [0] } });
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [poll] })
        .mockResolvedValueOnce(undefined) // UPDATE
        .mockResolvedValueOnce(undefined); // COMMIT

      const interaction = makeInteraction({ customId: 'poll_vote_1_1' });
      await handlePollVote(interaction);

      // Should have voted for option 1, keeping option 0
      const updateCall = mockClient.query.mock.calls[2];
      const votesJson = JSON.parse(updateCall[1][0]);
      expect(votesJson.u1).toEqual([0, 1]);
    });

    it('should toggle off in multi-vote mode', async () => {
      const poll = makePoll({ multi_vote: true, votes: { u1: [0, 1] } });
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [poll] })
        .mockResolvedValueOnce(undefined) // UPDATE
        .mockResolvedValueOnce(undefined); // COMMIT

      const interaction = makeInteraction({ customId: 'poll_vote_1_0' });
      await handlePollVote(interaction);

      const updateCall = mockClient.query.mock.calls[2];
      const votesJson = JSON.parse(updateCall[1][0]);
      expect(votesJson.u1).toEqual([1]);
    });

    it('should rollback and rethrow on DB error', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('DB failure')) // SELECT fails
        .mockResolvedValueOnce(undefined); // ROLLBACK

      const interaction = makeInteraction();
      await expect(handlePollVote(interaction)).rejects.toThrow('DB failure');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should log error when embed update fails', async () => {
      const poll = makePoll();
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [poll] })
        .mockResolvedValueOnce(undefined) // UPDATE
        .mockResolvedValueOnce(undefined); // COMMIT

      const interaction = makeInteraction();
      interaction.message.edit.mockRejectedValue(new Error('edit failed'));

      await handlePollVote(interaction);

      expect(logError).toHaveBeenCalledWith(
        'Failed to update poll embed',
        expect.objectContaining({ pollId: 1 }),
      );
      // Should still send ephemeral confirmation
      expect(safeReply).toHaveBeenCalled();
    });
  });

  // ── closePoll ───────────────────────────────────────────────────────────

  describe('closePoll', () => {
    it('should return false when poll not found or already closed', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(pool);

      const result = await closePoll(99, {});
      expect(result).toBe(false);
    });

    it('should close poll, update embed, and disable buttons', async () => {
      const poll = makePoll({ closed: true });
      const pool = { query: vi.fn().mockResolvedValue({ rows: [poll] }) };
      getPool.mockReturnValue(pool);

      const mockMessage = { edit: vi.fn() };
      const mockChannel = { messages: { fetch: vi.fn().mockResolvedValue(mockMessage) } };
      fetchChannelCached.mockResolvedValue(mockChannel);

      const result = await closePoll(1, {});
      expect(result).toBe(true);
      expect(mockMessage.edit).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array), components: expect.any(Array) }),
      );
      expect(info).toHaveBeenCalledWith('Poll closed', expect.objectContaining({ pollId: 1 }));
    });

    it('should log error when message edit fails', async () => {
      const poll = makePoll({ closed: true });
      const pool = { query: vi.fn().mockResolvedValue({ rows: [poll] }) };
      getPool.mockReturnValue(pool);

      const mockMessage = { edit: vi.fn().mockRejectedValue(new Error('edit failed')) };
      const mockChannel = { messages: { fetch: vi.fn().mockResolvedValue(mockMessage) } };
      fetchChannelCached.mockResolvedValue(mockChannel);

      const result = await closePoll(1, {});
      expect(result).toBe(true);
      expect(logError).toHaveBeenCalledWith('Failed to edit closed poll message', {
        pollId: 1,
        error: 'edit failed',
      });
    });
  });

  // ── closeExpiredPolls ───────────────────────────────────────────────────

  describe('closeExpiredPolls', () => {
    it('should close all expired polls', async () => {
      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }) // expired poll IDs
          .mockResolvedValueOnce({ rows: [makePoll({ id: 1, closed: true })] }) // closePoll for id 1
          .mockResolvedValueOnce({ rows: [makePoll({ id: 2, closed: true })] }), // closePoll for id 2
      };
      getPool.mockReturnValue(pool);
      fetchChannelCached.mockResolvedValue(null);

      await closeExpiredPolls({});
      // Should have queried for expired polls and attempted to close each
      expect(pool.query).toHaveBeenCalledTimes(3);
    });

    it('should continue closing other polls if one fails', async () => {
      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }) // expired poll IDs
          .mockRejectedValueOnce(new Error('close failed')) // closePoll for id 1 fails
          .mockResolvedValueOnce({ rows: [makePoll({ id: 2, closed: true })] }), // closePoll for id 2
      };
      getPool.mockReturnValue(pool);
      fetchChannelCached.mockResolvedValue(null);

      await closeExpiredPolls({});

      expect(logError).toHaveBeenCalledWith(
        'Failed to close expired poll',
        expect.objectContaining({ pollId: 1 }),
      );
    });

    it('should handle top-level query failure gracefully', async () => {
      const pool = {
        query: vi.fn().mockRejectedValue(new Error('DB down')),
      };
      getPool.mockReturnValue(pool);

      await expect(closeExpiredPolls({})).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalledWith(
        'Poll expiry check failed',
        expect.objectContaining({ error: 'DB down' }),
      );
    });
  });
});
