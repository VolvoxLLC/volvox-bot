/**
 * Tests for /review command
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/49
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue({}),
  safeReply: vi.fn((t, opts) => t.reply(opts)),
  safeEditReply: vi.fn((t, opts) => t.editReply(opts)),
}));

vi.mock('discord.js', () => {
  function chainable() {
    const proxy = new Proxy(() => proxy, {
      get: () => () => proxy,
      apply: () => proxy,
    });
    return proxy;
  }

  class MockSlashCommandBuilder {
    constructor() {
      this.name = '';
      this.description = '';
    }
    setName(n) {
      this.name = n;
      return this;
    }
    setDescription(d) {
      this.description = d;
      return this;
    }
    addSubcommand(fn) {
      const sub = {
        setName: () => ({
          setDescription: () => ({
            addStringOption: function self(fn2) {
              fn2(chainable());
              return { addStringOption: self, addIntegerOption: self, addBooleanOption: self };
            },
            addIntegerOption: function self(fn2) {
              fn2(chainable());
              return { addStringOption: self, addIntegerOption: self, addBooleanOption: self };
            },
            addBooleanOption: function self(fn2) {
              fn2(chainable());
              return { addStringOption: self, addIntegerOption: self, addBooleanOption: self };
            },
          }),
        }),
      };
      fn(sub);
      return this;
    }
    toJSON() {
      return { name: this.name, description: this.description };
    }
  }

  class MockEmbedBuilder {
    constructor() {
      this.data = {};
    }
    setTitle(t) {
      this.data.title = t;
      return this;
    }
    setDescription(d) {
      this.data.description = d;
      return this;
    }
    setColor(c) {
      this.data.color = c;
      return this;
    }
    addFields(...fields) {
      this.data.fields = [...(this.data.fields ?? []), ...fields.flat()];
      return this;
    }
    setTimestamp() {
      return this;
    }
    setFooter(f) {
      this.data.footer = f;
      return this;
    }
  }

  class MockButtonBuilder {
    constructor() {
      this.data = {};
    }
    setCustomId(id) {
      this.data.customId = id;
      return this;
    }
    setLabel(l) {
      this.data.label = l;
      return this;
    }
    setStyle(s) {
      this.data.style = s;
      return this;
    }
    setDisabled(d) {
      this.data.disabled = d;
      return this;
    }
  }

  class MockActionRowBuilder {
    constructor() {
      this.components = [];
    }
    addComponents(...items) {
      this.components.push(...items);
      return this;
    }
  }

  return {
    SlashCommandBuilder: MockSlashCommandBuilder,
    EmbedBuilder: MockEmbedBuilder,
    ButtonBuilder: MockButtonBuilder,
    ActionRowBuilder: MockActionRowBuilder,
    ButtonStyle: { Primary: 1, Secondary: 2, Danger: 4 },
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { data, execute } from '../../src/commands/review.js';
import { getPool } from '../../src/db.js';
import { getConfig } from '../../src/modules/config.js';
import {
  buildClaimButton,
  buildReviewEmbed,
  expireStaleReviews,
  handleReviewClaim,
} from '../../src/modules/reviewHandler.js';
import { safeSend } from '../../src/utils/safeSend.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Base review config — enabled */
const enabledConfig = {
  review: { enabled: true, channelId: null, staleAfterDays: 7, xpReward: 50 },
  reputation: { enabled: false },
};

/** Make a mock DB pool */
function makePool(overrides = {}) {
  return {
    query: vi.fn(),
    ...overrides,
  };
}

/** Make a mock interaction */
function makeInteraction(subcommand, options = {}) {
  const optionValues = {
    url: null,
    description: null,
    language: null,
    id: null,
    feedback: null,
    status: null,
    ...options,
  };

  const interaction = {
    guildId: 'guild-123',
    channelId: 'ch-456',
    user: { id: 'user-789', username: 'TestUser' },
    member: { id: 'user-789' },
    channel: {
      id: 'ch-456',
      send: vi.fn().mockResolvedValue({ id: 'msg-001' }),
      threads: null, // no thread support by default
    },
    client: {
      channels: { fetch: vi.fn().mockResolvedValue(null) },
    },
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getString: vi.fn((name) => optionValues[name] ?? null),
      getInteger: vi.fn((name) => optionValues[name] ?? null),
      getBoolean: vi.fn((name) => optionValues[name] ?? null),
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue({}),
    reply: vi.fn().mockResolvedValue({}),
    replied: false,
    deferred: false,
  };
  return interaction;
}

/** Base review row */
function makeReview(overrides = {}) {
  return {
    id: 1,
    guild_id: 'guild-123',
    requester_id: 'user-789',
    reviewer_id: null,
    url: 'https://github.com/test/pr/1',
    description: 'Please review this',
    language: 'JavaScript',
    status: 'open',
    message_id: 'msg-001',
    channel_id: 'ch-456',
    thread_id: null,
    feedback: null,
    created_at: new Date().toISOString(),
    claimed_at: null,
    completed_at: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('/review command', () => {
  let pool;

  beforeEach(() => {
    pool = makePool();
    getPool.mockReturnValue(pool);
    getConfig.mockReturnValue(enabledConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── data export ────────────────────────────────────────────────────────────

  describe('data', () => {
    it('should export a slash command named review', () => {
      expect(data.name).toBe('review');
    });
  });

  // ── Config gate ────────────────────────────────────────────────────────────

  describe('config gate', () => {
    it('returns error when review is disabled', async () => {
      getConfig.mockReturnValue({ review: { enabled: false } });
      const interaction = makeInteraction('request');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('not enabled') }),
      );
    });

    it('returns error when pool is null', async () => {
      getPool.mockReturnValue(null);
      const interaction = makeInteraction('request');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Database') }),
      );
    });

    it('returns error when no guildId', async () => {
      const interaction = makeInteraction('request');
      interaction.guildId = null;
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('server') }),
      );
    });
  });

  // ── /review request ────────────────────────────────────────────────────────

  describe('/review request', () => {
    it('creates a review and posts embed to current channel', async () => {
      const review = makeReview();
      pool.query
        .mockResolvedValueOnce({ rows: [review] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // UPDATE message_id

      const interaction = makeInteraction('request', {
        url: 'https://github.com/test/pr/1',
        description: 'Review my changes',
        language: 'JavaScript',
      });

      await execute(interaction);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reviews'),
        expect.arrayContaining(['guild-123', 'user-789']),
      );
      expect(interaction.channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array), components: expect.any(Array) }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('✅') }),
      );
    });

    it('creates a review without optional language', async () => {
      const review = makeReview({ language: null });
      pool.query.mockResolvedValueOnce({ rows: [review] }).mockResolvedValueOnce({ rows: [] });

      const interaction = makeInteraction('request', {
        url: 'https://github.com/test/pr/1',
        description: 'Review my changes',
      });

      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('#1') }),
      );
    });

    it('posts to configured review channel when set', async () => {
      const reviewChannelId = 'review-ch-999';
      getConfig.mockReturnValue({
        review: { enabled: true, channelId: reviewChannelId, staleAfterDays: 7, xpReward: 50 },
        reputation: { enabled: false },
      });

      const mockReviewChannel = {
        id: reviewChannelId,
        send: vi.fn().mockResolvedValue({ id: 'msg-002' }),
      };
      const interaction = makeInteraction('request', {
        url: 'https://github.com/test/pr/1',
        description: 'Review me',
      });
      interaction.client.channels.fetch.mockResolvedValue(mockReviewChannel);

      const review = makeReview();
      pool.query.mockResolvedValueOnce({ rows: [review] }).mockResolvedValueOnce({ rows: [] });

      await execute(interaction);

      expect(interaction.client.channels.fetch).toHaveBeenCalledWith(reviewChannelId);
      expect(mockReviewChannel.send).toHaveBeenCalled();
    });
  });

  // ── /review list ───────────────────────────────────────────────────────────

  describe('/review list', () => {
    it('lists open reviews by default', async () => {
      pool.query.mockResolvedValue({ rows: [makeReview()] });
      const interaction = makeInteraction('list');
      await execute(interaction);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('status = $2'),
        expect.arrayContaining(['open']),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('#1') }),
      );
    });

    it('lists claimed reviews', async () => {
      pool.query.mockResolvedValue({
        rows: [makeReview({ status: 'claimed', reviewer_id: 'rev-001' })],
      });
      const interaction = makeInteraction('list', { status: 'claimed' });
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('#1') }),
      );
    });

    it('lists all reviews when status=all', async () => {
      pool.query.mockResolvedValue({
        rows: [makeReview(), makeReview({ id: 2, status: 'completed' })],
      });
      const interaction = makeInteraction('list', { status: 'all' });
      await execute(interaction);
      expect(pool.query).toHaveBeenCalledWith(
        expect.not.stringContaining('status = $2'),
        expect.any(Array),
      );
    });

    it('shows empty message when no reviews', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      const interaction = makeInteraction('list');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('📭') }),
      );
    });

    it('lists stale reviews', async () => {
      pool.query.mockResolvedValue({ rows: [makeReview({ status: 'stale' })] });
      const interaction = makeInteraction('list', { status: 'stale' });
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('#1') }),
      );
    });

    it('lists completed reviews', async () => {
      pool.query.mockResolvedValue({
        rows: [makeReview({ status: 'completed', reviewer_id: 'rev-001' })],
      });
      const interaction = makeInteraction('list', { status: 'completed' });
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('#1') }),
      );
    });
  });

  // ── /review complete ───────────────────────────────────────────────────────

  describe('/review complete', () => {
    it('completes review when called by assigned reviewer', async () => {
      const review = makeReview({ status: 'claimed', reviewer_id: 'user-789' });
      const completed = makeReview({
        status: 'completed',
        reviewer_id: 'user-789',
        completed_at: new Date().toISOString(),
      });

      pool.query
        .mockResolvedValueOnce({ rows: [review] }) // SELECT
        .mockResolvedValueOnce({ rows: [completed] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // XP (not called — rep disabled)

      const interaction = makeInteraction('complete', { id: 1 });
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('✅') }),
      );
    });

    it('rejects completion by non-reviewer', async () => {
      const review = makeReview({ status: 'claimed', reviewer_id: 'other-user' });
      pool.query.mockResolvedValueOnce({ rows: [review] });

      const interaction = makeInteraction('complete', { id: 1 });
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Only the assigned reviewer') }),
      );
    });

    it('rejects completion when review not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const interaction = makeInteraction('complete', { id: 999 });
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('No review') }),
      );
    });

    it('rejects double-completion', async () => {
      const review = makeReview({ status: 'completed', reviewer_id: 'user-789' });
      pool.query.mockResolvedValueOnce({ rows: [review] });
      const interaction = makeInteraction('complete', { id: 1 });
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('already completed') }),
      );
    });

    it('awards XP when reputation is enabled', async () => {
      getConfig.mockReturnValue({
        review: { enabled: true, channelId: null, staleAfterDays: 7, xpReward: 75 },
        reputation: { enabled: true },
      });

      const review = makeReview({ status: 'claimed', reviewer_id: 'user-789' });
      const completed = makeReview({ status: 'completed', reviewer_id: 'user-789' });

      pool.query
        .mockResolvedValueOnce({ rows: [review] }) // SELECT
        .mockResolvedValueOnce({ rows: [completed] }) // UPDATE status
        .mockResolvedValueOnce({ rows: [] }); // XP INSERT

      const interaction = makeInteraction('complete', { id: 1 });
      await execute(interaction);

      // Third query should be the XP upsert
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reputation'),
        expect.arrayContaining(['guild-123', 'user-789', 75]),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('+75 XP') }),
      );
    });

    it('stores feedback when provided', async () => {
      const review = makeReview({ status: 'claimed', reviewer_id: 'user-789' });
      const completed = makeReview({
        status: 'completed',
        reviewer_id: 'user-789',
        feedback: 'Looks good!',
      });

      pool.query
        .mockResolvedValueOnce({ rows: [review] })
        .mockResolvedValueOnce({ rows: [completed] });

      const interaction = makeInteraction('complete', { id: 1, feedback: 'Looks good!' });
      await execute(interaction);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('feedback'),
        expect.arrayContaining(['Looks good!']),
      );
    });
  });
});

// ── Review Claim Handler ───────────────────────────────────────────────────────

describe('handleReviewClaim', () => {
  let pool;

  beforeEach(() => {
    pool = makePool();
    getPool.mockReturnValue(pool);
    getConfig.mockReturnValue(enabledConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeButtonInteraction(overrides = {}) {
    return {
      customId: 'review_claim_1',
      guildId: 'guild-123',
      user: { id: 'claimer-001', username: 'Claimer' },
      message: {
        id: 'msg-001',
        channel: null, // no threads by default
        edit: vi.fn().mockResolvedValue({}),
        startThread: vi.fn(),
      },
      client: {
        channels: {
          fetch: vi.fn().mockResolvedValue({
            messages: { fetch: vi.fn().mockResolvedValue({ edit: vi.fn() }) },
          }),
        },
      },
      reply: vi.fn().mockResolvedValue({}),
      replied: false,
      deferred: false,
      ...overrides,
    };
  }

  it('claims an open review successfully', async () => {
    const review = makeReview();
    const claimed = makeReview({ status: 'claimed', reviewer_id: 'claimer-001' });

    pool.query
      .mockResolvedValueOnce({ rows: [review] }) // SELECT to check for self-claim
      .mockResolvedValueOnce({ rowCount: 1 }) // atomic UPDATE succeeds (status was 'open')
      .mockResolvedValueOnce({ rows: [claimed] }); // SELECT to fetch updated row

    const interaction = makeButtonInteraction();
    await handleReviewClaim(interaction);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'claimed'"),
      expect.arrayContaining(['claimer-001', 1]),
    );
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("You've claimed") }),
    );
  });

  it('prevents self-claim', async () => {
    const review = makeReview({ requester_id: 'claimer-001' });
    pool.query.mockResolvedValueOnce({ rows: [review] });

    const interaction = makeButtonInteraction();
    await handleReviewClaim(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('cannot claim your own') }),
    );
  });

  it('prevents double-claim on already claimed review', async () => {
    const review = makeReview({ status: 'claimed', reviewer_id: 'someone-else' });
    pool.query
      .mockResolvedValueOnce({ rows: [review] }) // SELECT (status=claimed)
      .mockResolvedValueOnce({ rowCount: 0 }); // atomic UPDATE fails (status != 'open')

    const interaction = makeButtonInteraction();
    await handleReviewClaim(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('no longer available') }),
    );
  });

  it('prevents claiming a completed review', async () => {
    const review = makeReview({ status: 'completed', reviewer_id: 'someone-else' });
    pool.query
      .mockResolvedValueOnce({ rows: [review] }) // SELECT (status=completed)
      .mockResolvedValueOnce({ rowCount: 0 }); // atomic UPDATE fails (status != 'open')

    const interaction = makeButtonInteraction();
    await handleReviewClaim(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('no longer available') }),
    );
  });

  it('prevents claiming a stale review', async () => {
    const review = makeReview({ status: 'stale' });
    pool.query
      .mockResolvedValueOnce({ rows: [review] }) // SELECT (status=stale)
      .mockResolvedValueOnce({ rowCount: 0 }); // atomic UPDATE fails (status != 'open')

    const interaction = makeButtonInteraction();
    await handleReviewClaim(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('no longer available') }),
    );
  });

  it('returns error when review not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const interaction = makeButtonInteraction();
    await handleReviewClaim(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('not found') }),
    );
  });

  it('returns error when pool is null', async () => {
    getPool.mockReturnValue(null);
    const interaction = makeButtonInteraction();
    await handleReviewClaim(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Database') }),
    );
  });

  it('handles invalid customId gracefully', async () => {
    const interaction = makeButtonInteraction({ customId: 'review_claim_abc' });
    await handleReviewClaim(interaction);
    // Should return early without querying DB
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ── expireStaleReviews ─────────────────────────────────────────────────────────

describe('expireStaleReviews', () => {
  let pool;

  beforeEach(() => {
    pool = makePool();
    getPool.mockReturnValue(pool);
    getConfig.mockReturnValue(enabledConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when no stale reviews', async () => {
    // New impl first queries for guilds with open reviews; empty means nothing to expire.
    pool.query.mockResolvedValueOnce({ rows: [] }); // SELECT DISTINCT guild_id → no guilds
    const client = { channels: { fetch: vi.fn() } };
    await expireStaleReviews(client);
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('marks stale reviews and posts nudge', async () => {
    const staleReviews = [
      makeReview({ id: 1, status: 'stale', guild_id: 'guild-123', channel_id: 'ch-456' }),
      makeReview({ id: 2, status: 'stale', guild_id: 'guild-123', channel_id: 'ch-456' }),
    ];
    // New impl: 1st query = SELECT DISTINCT guild_id, 2nd = per-guild UPDATE RETURNING
    pool.query
      .mockResolvedValueOnce({ rows: [{ guild_id: 'guild-123' }] }) // SELECT DISTINCT
      .mockResolvedValueOnce({ rows: staleReviews }); // per-guild UPDATE

    getConfig.mockReturnValue({
      review: { enabled: true, channelId: 'review-ch-001', staleAfterDays: 7, xpReward: 50 },
    });

    const mockChannel = {
      messages: { fetch: vi.fn().mockResolvedValue({ edit: vi.fn() }) },
    };
    const client = {
      channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
    };

    await expireStaleReviews(client);

    // safeSend is mocked at module level — verify it was called with the nudge content
    expect(safeSend).toHaveBeenCalledWith(
      mockChannel,
      expect.objectContaining({ content: expect.stringContaining('#1') }),
    );
  });

  it('skips nudge when no review channelId configured', async () => {
    const staleReviews = [makeReview({ status: 'stale', guild_id: 'guild-123' })];
    // New impl: SELECT DISTINCT then per-guild UPDATE
    pool.query
      .mockResolvedValueOnce({ rows: [{ guild_id: 'guild-123' }] }) // SELECT DISTINCT
      .mockResolvedValueOnce({ rows: staleReviews }); // per-guild UPDATE

    getConfig.mockReturnValue({ review: { enabled: true, channelId: null } });

    const client = { channels: { fetch: vi.fn() } };
    await expireStaleReviews(client);
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('handles null pool gracefully', async () => {
    getPool.mockReturnValue(null);
    const client = { channels: { fetch: vi.fn() } };
    // Should not throw
    await expect(expireStaleReviews(client)).resolves.toBeUndefined();
  });
});

// ── buildReviewEmbed ───────────────────────────────────────────────────────────

describe('buildReviewEmbed', () => {
  it('builds embed with correct color for open status', () => {
    const embed = buildReviewEmbed(makeReview());
    expect(embed.data.color).toBe(0x5865f2);
  });

  it('builds embed with claimed color', () => {
    const embed = buildReviewEmbed(makeReview({ status: 'claimed', reviewer_id: 'rev-001' }));
    expect(embed.data.color).toBe(0xffa500);
  });

  it('builds embed with completed color', () => {
    const embed = buildReviewEmbed(makeReview({ status: 'completed' }));
    expect(embed.data.color).toBe(0x57f287);
  });

  it('builds embed with stale color', () => {
    const embed = buildReviewEmbed(makeReview({ status: 'stale' }));
    expect(embed.data.color).toBe(0x95a5a6);
  });

  it('includes feedback field when present', () => {
    const embed = buildReviewEmbed(makeReview({ feedback: 'LGTM!' }));
    const feedbackField = embed.data.fields?.find((f) => f.name === '💬 Feedback');
    expect(feedbackField).toBeDefined();
    expect(feedbackField.value).toBe('LGTM!');
  });

  it('truncates long URLs', () => {
    const longUrl = `https://example.com/${'a'.repeat(300)}`;
    const embed = buildReviewEmbed(makeReview({ url: longUrl }));
    const urlField = embed.data.fields?.find((f) => f.name === '🔗 URL');
    expect(urlField.value.length).toBeLessThanOrEqual(204);
  });
});

// ── buildClaimButton ───────────────────────────────────────────────────────────

describe('buildClaimButton', () => {
  it('creates an enabled claim button', () => {
    const row = buildClaimButton(42);
    expect(row.components[0].data.customId).toBe('review_claim_42');
    expect(row.components[0].data.disabled).toBe(false);
  });

  it('creates a disabled claim button', () => {
    const row = buildClaimButton(42, true);
    expect(row.components[0].data.disabled).toBe(true);
  });
});
