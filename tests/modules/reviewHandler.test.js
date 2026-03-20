import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('discord.js', () => {
  const EmbedBuilder = vi.fn().mockImplementation(function () {
    this.data = {};
    this.setColor = vi.fn().mockReturnThis();
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.addFields = vi.fn().mockReturnThis();
    this.setTimestamp = vi.fn().mockReturnThis();
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
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/utils/discordCache.js', () => ({
  fetchChannelCached: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeReply: vi.fn(),
  safeSend: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({}),
}));

import { getPool } from '../../src/db.js';
import { info, warn } from '../../src/logger.js';
import { getConfig } from '../../src/modules/config.js';
import {
  buildClaimButton,
  buildReviewEmbed,
  expireStaleReviews,
  handleReviewClaim,
  STATUS_COLORS,
  STATUS_LABELS,
  updateReviewMessage,
} from '../../src/modules/reviewHandler.js';
import { fetchChannelCached } from '../../src/utils/discordCache.js';
import { safeReply, safeSend } from '../../src/utils/safeSend.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeReview(overrides = {}) {
  return {
    id: 1,
    url: 'https://github.com/org/repo/pull/1',
    description: 'Please review this PR',
    language: 'JavaScript',
    status: 'open',
    requester_id: 'u1',
    reviewer_id: null,
    feedback: null,
    channel_id: 'ch1',
    message_id: 'msg1',
    guild_id: 'g1',
    thread_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeInteraction(overrides = {}) {
  return {
    customId: 'review_claim_1',
    guildId: 'g1',
    user: { id: 'u2' },
    client: {},
    message: {
      edit: vi.fn(),
      channel: {
        threads: {
          create: vi.fn(),
        },
      },
      startThread: vi.fn().mockResolvedValue({ id: 'thread1', send: vi.fn() }),
    },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('reviewHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Constants ─────────────────────────────────────────────────────────

  describe('constants', () => {
    it('should export status colors for all statuses', () => {
      expect(STATUS_COLORS).toHaveProperty('open');
      expect(STATUS_COLORS).toHaveProperty('claimed');
      expect(STATUS_COLORS).toHaveProperty('completed');
      expect(STATUS_COLORS).toHaveProperty('stale');
    });

    it('should export status labels for all statuses', () => {
      expect(STATUS_LABELS.open).toContain('Open');
      expect(STATUS_LABELS.claimed).toContain('Claimed');
      expect(STATUS_LABELS.completed).toContain('Completed');
      expect(STATUS_LABELS.stale).toContain('Stale');
    });
  });

  // ── buildReviewEmbed ──────────────────────────────────────────────────

  describe('buildReviewEmbed', () => {
    it('should build embed with required fields', () => {
      const review = makeReview();
      const embed = buildReviewEmbed(review);
      expect(embed.setColor).toHaveBeenCalledWith(STATUS_COLORS.open);
      expect(embed.setTitle).toHaveBeenCalledWith('Code Review Request #1');
      expect(embed.addFields).toHaveBeenCalled();
      expect(embed.setTimestamp).toHaveBeenCalled();
      expect(embed.setFooter).toHaveBeenCalledWith({ text: 'Review #1' });
    });

    it('should include language field when present', () => {
      const review = makeReview({ language: 'Python' });
      const embed = buildReviewEmbed(review);
      const allFields = embed.addFields.mock.calls.flatMap((c) => c);
      const langField = allFields.find((f) => f.name?.includes('Language'));
      expect(langField).toBeDefined();
      expect(langField.value).toBe('Python');
    });

    it('should omit language field when null', () => {
      const review = makeReview({ language: null });
      const embed = buildReviewEmbed(review);
      const allFields = embed.addFields.mock.calls.flatMap((c) => c);
      const langField = allFields.find((f) => f.name?.includes('Language'));
      expect(langField).toBeUndefined();
    });

    it('should include reviewer field when reviewer_id is set', () => {
      const review = makeReview({ reviewer_id: 'u3', status: 'claimed' });
      const embed = buildReviewEmbed(review, 'requester#0001', 'reviewer#0002');
      const allFields = embed.addFields.mock.calls.flatMap((c) => c);
      const reviewerField = allFields.find((f) => f.name?.includes('Reviewer'));
      expect(reviewerField).toBeDefined();
    });

    it('should include feedback field when feedback is present', () => {
      const review = makeReview({ feedback: 'Looks good!' });
      const embed = buildReviewEmbed(review);
      const allFields = embed.addFields.mock.calls.flatMap((c) => c);
      const fbField = allFields.find((f) => f.name?.includes('Feedback'));
      expect(fbField).toBeDefined();
      expect(fbField.value).toBe('Looks good!');
    });

    it('should truncate long URLs', () => {
      const review = makeReview({ url: 'https://github.com/' + 'a'.repeat(300) });
      const embed = buildReviewEmbed(review);
      const allFields = embed.addFields.mock.calls.flatMap((c) => c);
      const urlField = allFields.find((f) => f.name?.includes('URL'));
      expect(urlField.value.length).toBeLessThanOrEqual(201);
    });

    it('should truncate long descriptions', () => {
      const review = makeReview({ description: 'D'.repeat(600) });
      const embed = buildReviewEmbed(review);
      const allFields = embed.addFields.mock.calls.flatMap((c) => c);
      const descField = allFields.find((f) => f.name?.includes('Description'));
      expect(descField.value.length).toBeLessThanOrEqual(501);
    });

    it('should truncate long feedback', () => {
      const review = makeReview({ feedback: 'F'.repeat(600) });
      const embed = buildReviewEmbed(review);
      const allFields = embed.addFields.mock.calls.flatMap((c) => c);
      const fbField = allFields.find((f) => f.name?.includes('Feedback'));
      expect(fbField.value.length).toBeLessThanOrEqual(501);
    });

    it('should use default color for unknown status', () => {
      const review = makeReview({ status: 'unknown' });
      const embed = buildReviewEmbed(review);
      expect(embed.setColor).toHaveBeenCalledWith(STATUS_COLORS.open);
    });
  });

  // ── buildClaimButton ──────────────────────────────────────────────────

  describe('buildClaimButton', () => {
    it('should create a claim button with correct custom ID', () => {
      const row = buildClaimButton(42);
      expect(row.components).toHaveLength(1);
      expect(row.components[0].setCustomId).toHaveBeenCalledWith('review_claim_42');
    });

    it('should set disabled state', () => {
      const row = buildClaimButton(1, true);
      expect(row.components[0].setDisabled).toHaveBeenCalledWith(true);
    });
  });

  // ── updateReviewMessage ───────────────────────────────────────────────

  describe('updateReviewMessage', () => {
    it('should return early if no message_id', async () => {
      await updateReviewMessage({ ...makeReview(), message_id: null }, {});
      expect(fetchChannelCached).not.toHaveBeenCalled();
    });

    it('should return early if no channel_id', async () => {
      await updateReviewMessage({ ...makeReview(), channel_id: null }, {});
      expect(fetchChannelCached).not.toHaveBeenCalled();
    });

    it('should update the message embed', async () => {
      const mockMessage = { edit: vi.fn() };
      const mockChannel = { messages: { fetch: vi.fn().mockResolvedValue(mockMessage) } };
      fetchChannelCached.mockResolvedValue(mockChannel);

      await updateReviewMessage(makeReview(), {});
      expect(mockMessage.edit).toHaveBeenCalled();
    });

    it('should handle channel not found', async () => {
      fetchChannelCached.mockResolvedValue(null);
      await updateReviewMessage(makeReview(), {});
      // Should not throw
    });

    it('should handle message fetch failure gracefully (message not found)', async () => {
      const mockChannel = { messages: { fetch: vi.fn().mockRejectedValue(new Error('gone')) } };
      fetchChannelCached.mockResolvedValue(mockChannel);

      // Should not throw — the .catch(() => null) swallows the error and returns early
      await expect(updateReviewMessage(makeReview(), {})).resolves.toBeUndefined();
    });

    it('should warn when message.edit fails', async () => {
      const mockMessage = { edit: vi.fn().mockRejectedValue(new Error('edit fail')) };
      const mockChannel = { messages: { fetch: vi.fn().mockResolvedValue(mockMessage) } };
      fetchChannelCached.mockResolvedValue(mockChannel);

      await updateReviewMessage(makeReview(), {});
      expect(warn).toHaveBeenCalledWith(
        'Failed to update review embed',
        expect.objectContaining({ reviewId: 1 }),
      );
    });
  });

  // ── handleReviewClaim ─────────────────────────────────────────────────

  describe('handleReviewClaim', () => {
    let mockPool;

    beforeEach(() => {
      mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);
      fetchChannelCached.mockResolvedValue(null);
    });

    it('should ignore non-numeric review IDs', async () => {
      const interaction = makeInteraction({ customId: 'review_claim_abc' });
      await handleReviewClaim(interaction);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should reply error when DB is not available', async () => {
      getPool.mockReturnValue(null);
      const interaction = makeInteraction();
      await handleReviewClaim(interaction);
      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Database') }),
      );
    });

    it('should reply error when review not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const interaction = makeInteraction();
      await handleReviewClaim(interaction);
      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('not found') }),
      );
    });

    it('should prevent self-claim', async () => {
      const review = makeReview({ requester_id: 'u2' }); // same as interaction user
      mockPool.query.mockResolvedValueOnce({ rows: [review] });

      const interaction = makeInteraction();
      await handleReviewClaim(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('cannot claim your own') }),
      );
      expect(warn).toHaveBeenCalledWith(
        'Self-claim attempt blocked',
        expect.objectContaining({ reviewId: 1 }),
      );
    });

    it('should reply error when review is no longer open (race condition)', async () => {
      const review = makeReview();
      mockPool.query
        .mockResolvedValueOnce({ rows: [review] }) // SELECT
        .mockResolvedValueOnce({ rowCount: 0 }); // UPDATE (already claimed)

      const interaction = makeInteraction();
      await handleReviewClaim(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('no longer available') }),
      );
    });

    it('should successfully claim a review', async () => {
      const review = makeReview();
      const claimedReview = makeReview({ reviewer_id: 'u2', status: 'claimed' });
      mockPool.query
        .mockResolvedValueOnce({ rows: [review] }) // SELECT
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE claim
        .mockResolvedValueOnce({ rows: [claimedReview] }) // SELECT updated
        .mockResolvedValueOnce(undefined); // UPDATE thread_id

      const interaction = makeInteraction();
      await handleReviewClaim(interaction);

      expect(info).toHaveBeenCalledWith(
        'Review claimed',
        expect.objectContaining({ reviewId: 1, reviewerId: 'u2' }),
      );
      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining("You've claimed") }),
      );
    });

    it('should handle thread creation failure gracefully', async () => {
      const review = makeReview();
      const claimedReview = makeReview({ reviewer_id: 'u2', status: 'claimed' });
      mockPool.query
        .mockResolvedValueOnce({ rows: [review] }) // SELECT
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE claim
        .mockResolvedValueOnce({ rows: [claimedReview] }); // SELECT updated

      const interaction = makeInteraction();
      interaction.message.startThread.mockRejectedValue(new Error('no perms'));

      await handleReviewClaim(interaction);

      expect(warn).toHaveBeenCalledWith(
        'Failed to create review discussion thread',
        expect.objectContaining({ reviewId: 1 }),
      );
      // Should still succeed
      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining("You've claimed") }),
      );
    });
  });

  // ── expireStaleReviews ────────────────────────────────────────────────

  describe('expireStaleReviews', () => {
    it('should return early when pool is null', async () => {
      getPool.mockReturnValue(null);
      await expireStaleReviews({});
      // No error
    });

    it('should return early when no open reviews exist', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(pool);
      await expireStaleReviews({});
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('should expire stale reviews per guild config', async () => {
      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ guild_id: 'g1' }] }) // open guilds
          .mockResolvedValueOnce({ rows: [] }), // no stale reviews for g1
      };
      getPool.mockReturnValue(pool);
      getConfig.mockReturnValue({ review: { staleAfterDays: 14 } });

      await expireStaleReviews({});
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('should send nudge messages for stale reviews', async () => {
      const staleReview = makeReview({ status: 'stale', guild_id: 'g1' });
      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ guild_id: 'g1' }] }) // open guilds
          .mockResolvedValueOnce({ rows: [staleReview] }), // stale reviews
      };
      getPool.mockReturnValue(pool);
      getConfig.mockReturnValue({ review: { staleAfterDays: 7, channelId: 'ch-review' } });

      const mockChannel = { id: 'ch-review' };
      fetchChannelCached.mockResolvedValue(mockChannel);

      await expireStaleReviews({});

      expect(info).toHaveBeenCalledWith(
        'Stale reviews expired',
        expect.objectContaining({ count: 1 }),
      );
      expect(safeSend).toHaveBeenCalledWith(
        mockChannel,
        expect.objectContaining({ content: expect.stringContaining('stale') }),
      );
    });

    it('should handle query errors gracefully', async () => {
      const pool = { query: vi.fn().mockRejectedValue(new Error('DB error')) };
      getPool.mockReturnValue(pool);

      await expireStaleReviews({});
      expect(warn).toHaveBeenCalledWith(
        'Stale review expiry failed',
        expect.objectContaining({ error: 'DB error' }),
      );
    });
  });
});
