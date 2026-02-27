import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    permissions: { enabled: true, adminRoleId: null, usePermissions: true },
  }),
}));

vi.mock('../../src/utils/permissions.js', () => ({
  isModerator: vi.fn().mockReturnValue(true),
  getPermissionError: vi.fn().mockReturnValue("❌ You don't have permission to use `/poll`."),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn(),
  safeReply: (t, opts) => t.reply(opts),
  safeEditReply: (t, opts) => t.editReply(opts),
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
    setName(name) {
      this.name = name;
      return this;
    }
    setDescription(desc) {
      this.description = desc;
      return this;
    }
    addSubcommand(fn) {
      const sub = {
        setName: () => ({
          setDescription: () => ({
            addStringOption: function self(fn2) {
              fn2(chainable());
              return {
                addStringOption: self,
                addIntegerOption: self,
                addBooleanOption: self,
                addChannelOption: self,
              };
            },
            addIntegerOption: function self(fn2) {
              fn2(chainable());
              return {
                addStringOption: self,
                addIntegerOption: self,
                addBooleanOption: self,
                addChannelOption: self,
              };
            },
            addBooleanOption: function self(fn2) {
              fn2(chainable());
              return {
                addStringOption: self,
                addIntegerOption: self,
                addBooleanOption: self,
                addChannelOption: self,
              };
            },
            addChannelOption: function self(fn2) {
              fn2(chainable());
              return {
                addStringOption: self,
                addIntegerOption: self,
                addBooleanOption: self,
                addChannelOption: self,
              };
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
    ChannelType: { GuildText: 0 },
  };
});

import { data, execute } from '../../src/commands/poll.js';
import { getPool } from '../../src/db.js';
import { isModerator } from '../../src/utils/permissions.js';

/**
 * Create a mock interaction for poll tests.
 */
function createMockInteraction(subcommand, options = {}) {
  const optionValues = {
    question: null,
    options: null,
    duration: null,
    multi: null,
    anonymous: null,
    id: null,
    ...options,
  };

  return {
    guildId: 'guild-123',
    channelId: 'ch-456',
    user: { id: 'user-789' },
    member: { id: 'user-789' },
    client: { channels: { fetch: vi.fn() } },
    channel: {
      send: vi.fn().mockResolvedValue({ id: 'msg-001' }),
    },
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getString: vi.fn((name) => optionValues[name] ?? null),
      getInteger: vi.fn((name) => optionValues[name] ?? null),
      getBoolean: vi.fn((name) => optionValues[name] ?? null),
    },
    reply: vi.fn(),
    editReply: vi.fn(),
    deferReply: vi.fn(),
  };
}

describe('poll command', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(mockPool);
    isModerator.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with name "poll"', () => {
    expect(data.name).toBe('poll');
  });

  describe('create subcommand', () => {
    it('should create a poll with valid options', async () => {
      const poll = {
        id: 1,
        guild_id: 'guild-123',
        channel_id: 'ch-456',
        author_id: 'user-789',
        question: 'Favorite color?',
        options: ['Red', 'Blue', 'Green'],
        votes: {},
        multi_vote: false,
        anonymous: false,
        closes_at: null,
        closed: false,
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [poll] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // UPDATE message_id

      const interaction = createMockInteraction('create', {
        question: 'Favorite color?',
        options: 'Red, Blue, Green',
      });

      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO polls'),
        expect.arrayContaining([
          'guild-123',
          'ch-456',
          'user-789',
          'Favorite color?',
          JSON.stringify(['Red', 'Blue', 'Green']),
        ]),
      );
      expect(interaction.channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Poll **#1** created'),
        }),
      );
    });

    it('should create a poll with 2 options (minimum)', async () => {
      const poll = {
        id: 2,
        guild_id: 'guild-123',
        channel_id: 'ch-456',
        author_id: 'user-789',
        question: 'Yes or no?',
        options: ['Yes', 'No'],
        votes: {},
        multi_vote: false,
        anonymous: false,
        closes_at: null,
        closed: false,
      };
      mockPool.query.mockResolvedValueOnce({ rows: [poll] }).mockResolvedValueOnce({ rows: [] });

      const interaction = createMockInteraction('create', {
        question: 'Yes or no?',
        options: 'Yes, No',
      });

      await execute(interaction);

      expect(interaction.channel.send).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Poll **#2** created'),
        }),
      );
    });

    it('should create a poll with 10 options (maximum)', async () => {
      const opts = Array.from({ length: 10 }, (_, i) => `Option ${i + 1}`);
      const poll = {
        id: 3,
        guild_id: 'guild-123',
        channel_id: 'ch-456',
        author_id: 'user-789',
        question: 'Pick one',
        options: opts,
        votes: {},
        multi_vote: false,
        anonymous: false,
        closes_at: null,
        closed: false,
      };
      mockPool.query.mockResolvedValueOnce({ rows: [poll] }).mockResolvedValueOnce({ rows: [] });

      const interaction = createMockInteraction('create', {
        question: 'Pick one',
        options: opts.join(', '),
      });

      await execute(interaction);

      expect(interaction.channel.send).toHaveBeenCalled();
    });

    it('should reject fewer than 2 options', async () => {
      const interaction = createMockInteraction('create', {
        question: 'Only one?',
        options: 'Solo',
      });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('at least 2 options'),
        }),
      );
      expect(interaction.channel.send).not.toHaveBeenCalled();
    });

    it('should reject more than 10 options', async () => {
      const opts = Array.from({ length: 11 }, (_, i) => `Opt ${i + 1}`);
      const interaction = createMockInteraction('create', {
        question: 'Too many?',
        options: opts.join(', '),
      });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Maximum 10 options'),
        }),
      );
      expect(interaction.channel.send).not.toHaveBeenCalled();
    });

    it('should include auto-close message when duration is set', async () => {
      const poll = {
        id: 4,
        guild_id: 'guild-123',
        channel_id: 'ch-456',
        author_id: 'user-789',
        question: 'Timed poll?',
        options: ['A', 'B'],
        votes: {},
        multi_vote: false,
        anonymous: false,
        duration_minutes: 60,
        closes_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        closed: false,
      };
      mockPool.query.mockResolvedValueOnce({ rows: [poll] }).mockResolvedValueOnce({ rows: [] });

      const interaction = createMockInteraction('create', {
        question: 'Timed poll?',
        options: 'A, B',
        duration: 60,
      });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Auto-closes in 60 minutes'),
        }),
      );
    });
  });

  describe('close subcommand', () => {
    it('should close a poll by author', async () => {
      const poll = {
        id: 5,
        guild_id: 'guild-123',
        channel_id: 'ch-456',
        message_id: 'msg-005',
        author_id: 'user-789',
        question: 'Close me',
        options: ['A', 'B'],
        votes: { 'user-1': [0] },
        multi_vote: false,
        anonymous: false,
        closed: false,
      };

      // First query: SELECT in handleClose
      mockPool.query.mockResolvedValueOnce({ rows: [poll] });
      // Second query: UPDATE in closePoll
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...poll, closed: true }] });

      const mockMessage = { id: 'msg-005', edit: vi.fn() };
      const mockChannel = { messages: { fetch: vi.fn().mockResolvedValue(mockMessage) } };
      const interaction = createMockInteraction('close', { id: 5 });
      interaction.client.channels.fetch = vi.fn().mockResolvedValue(mockChannel);

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Poll **#5** has been closed'),
        }),
      );
    });

    it('should deny close for non-author non-moderator', async () => {
      const poll = {
        id: 6,
        guild_id: 'guild-123',
        author_id: 'other-user',
        closed: false,
      };
      mockPool.query.mockResolvedValueOnce({ rows: [poll] });
      isModerator.mockReturnValueOnce(false);

      const interaction = createMockInteraction('close', { id: 6 });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Only the poll creator or a moderator'),
        }),
      );
    });

    it('should allow moderator to close others poll', async () => {
      const poll = {
        id: 7,
        guild_id: 'guild-123',
        channel_id: 'ch-456',
        message_id: 'msg-007',
        author_id: 'other-user',
        question: 'Mod close',
        options: ['A', 'B'],
        votes: {},
        multi_vote: false,
        closed: false,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [poll] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...poll, closed: true }] });
      isModerator.mockReturnValueOnce(true);

      const mockMessage = { id: 'msg-007', edit: vi.fn() };
      const mockChannel = { messages: { fetch: vi.fn().mockResolvedValue(mockMessage) } };
      const interaction = createMockInteraction('close', { id: 7 });
      interaction.client.channels.fetch = vi.fn().mockResolvedValue(mockChannel);

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Poll **#7** has been closed'),
        }),
      );
    });

    it('should report not found for missing poll', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const interaction = createMockInteraction('close', { id: 999 });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No poll with ID **#999**'),
        }),
      );
    });

    it('should reject closing an already-closed poll', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 8, guild_id: 'guild-123', closed: true }],
      });

      const interaction = createMockInteraction('close', { id: 8 });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('already closed'),
        }),
      );
    });
  });

  describe('list subcommand', () => {
    it('should show active polls', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            question: 'Favorite color?',
            author_id: 'user-789',
            options: ['Red', 'Blue'],
            votes: { 'user-1': [0] },
            closes_at: null,
            created_at: new Date(),
          },
        ],
      });

      const interaction = createMockInteraction('list');

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Active Polls (1)'),
        }),
      );
    });

    it('should show empty message when no active polls', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const interaction = createMockInteraction('list');

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No active polls'),
        }),
      );
    });
  });
});

describe('poll vote handling', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(mockPool);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createMockButtonInteraction(customId, userId = 'voter-1') {
    return {
      customId,
      user: { id: userId },
      message: {
        edit: vi.fn(),
      },
      reply: vi.fn(),
      replied: false,
      deferred: false,
    };
  }

  it('should toggle vote in single-vote mode', async () => {
    const { handlePollVote } = await import('../../src/modules/pollHandler.js');

    const poll = {
      id: 1,
      question: 'Pick one',
      options: ['A', 'B', 'C'],
      votes: {},
      multi_vote: false,
      anonymous: false,
      closed: false,
      closes_at: null,
    };
    mockPool.query.mockResolvedValueOnce({ rows: [poll] }); // SELECT
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE

    const interaction = createMockButtonInteraction('poll_vote_1_0');

    await handlePollVote(interaction);

    // Should have updated votes with user voting for option 0
    expect(mockPool.query).toHaveBeenCalledWith('UPDATE polls SET votes = $1 WHERE id = $2', [
      JSON.stringify({ 'voter-1': [0] }),
      1,
    ]);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Voted for **A**'),
        ephemeral: true,
      }),
    );
  });

  it('should remove vote when clicking same option in single-vote mode', async () => {
    const { handlePollVote } = await import('../../src/modules/pollHandler.js');

    const poll = {
      id: 2,
      question: 'Pick one',
      options: ['A', 'B'],
      votes: { 'voter-1': [0] },
      multi_vote: false,
      anonymous: false,
      closed: false,
      closes_at: null,
    };
    mockPool.query.mockResolvedValueOnce({ rows: [poll] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const interaction = createMockButtonInteraction('poll_vote_2_0');

    await handlePollVote(interaction);

    expect(mockPool.query).toHaveBeenCalledWith('UPDATE polls SET votes = $1 WHERE id = $2', [
      JSON.stringify({}),
      2,
    ]);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Vote removed for **A**'),
      }),
    );
  });

  it('should replace vote when clicking different option in single-vote mode', async () => {
    const { handlePollVote } = await import('../../src/modules/pollHandler.js');

    const poll = {
      id: 3,
      question: 'Pick one',
      options: ['A', 'B'],
      votes: { 'voter-1': [0] },
      multi_vote: false,
      anonymous: false,
      closed: false,
      closes_at: null,
    };
    mockPool.query.mockResolvedValueOnce({ rows: [poll] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const interaction = createMockButtonInteraction('poll_vote_3_1');

    await handlePollVote(interaction);

    expect(mockPool.query).toHaveBeenCalledWith('UPDATE polls SET votes = $1 WHERE id = $2', [
      JSON.stringify({ 'voter-1': [1] }),
      3,
    ]);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Voted for **B**'),
      }),
    );
  });

  it('should toggle individual options in multi-vote mode', async () => {
    const { handlePollVote } = await import('../../src/modules/pollHandler.js');

    const poll = {
      id: 4,
      question: 'Pick several',
      options: ['A', 'B', 'C'],
      votes: { 'voter-1': [0] },
      multi_vote: true,
      anonymous: false,
      closed: false,
      closes_at: null,
    };
    mockPool.query.mockResolvedValueOnce({ rows: [poll] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    // Vote for B (index 1) — should add to existing [0]
    const interaction = createMockButtonInteraction('poll_vote_4_1');

    await handlePollVote(interaction);

    expect(mockPool.query).toHaveBeenCalledWith('UPDATE polls SET votes = $1 WHERE id = $2', [
      JSON.stringify({ 'voter-1': [0, 1] }),
      4,
    ]);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Voted for **B**'),
      }),
    );
  });

  it('should remove option in multi-vote mode when clicking already-voted option', async () => {
    const { handlePollVote } = await import('../../src/modules/pollHandler.js');

    const poll = {
      id: 5,
      question: 'Pick several',
      options: ['A', 'B', 'C'],
      votes: { 'voter-1': [0, 1] },
      multi_vote: true,
      anonymous: false,
      closed: false,
      closes_at: null,
    };
    mockPool.query.mockResolvedValueOnce({ rows: [poll] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    // Remove vote for A (index 0)
    const interaction = createMockButtonInteraction('poll_vote_5_0');

    await handlePollVote(interaction);

    expect(mockPool.query).toHaveBeenCalledWith('UPDATE polls SET votes = $1 WHERE id = $2', [
      JSON.stringify({ 'voter-1': [1] }),
      5,
    ]);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Vote removed for **A**'),
      }),
    );
  });

  it('should reject vote on closed poll', async () => {
    const { handlePollVote } = await import('../../src/modules/pollHandler.js');

    const poll = {
      id: 6,
      options: ['A', 'B'],
      votes: {},
      closed: true,
    };
    mockPool.query.mockResolvedValueOnce({ rows: [poll] });

    const interaction = createMockButtonInteraction('poll_vote_6_0');

    await handlePollVote(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('poll is closed'),
        ephemeral: true,
      }),
    );
  });

  it('should reject vote on non-existent poll', async () => {
    const { handlePollVote } = await import('../../src/modules/pollHandler.js');

    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const interaction = createMockButtonInteraction('poll_vote_999_0');

    await handlePollVote(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('no longer exists'),
        ephemeral: true,
      }),
    );
  });
});

describe('poll embed builder', () => {
  it('should build correct vote bars', async () => {
    const { buildPollEmbed } = await import('../../src/modules/pollHandler.js');

    const poll = {
      id: 1,
      question: 'Colors?',
      options: ['Red', 'Blue'],
      votes: {
        u1: [0],
        u2: [0],
        u3: [1],
      },
      multi_vote: false,
      anonymous: false,
      closed: false,
      closes_at: null,
    };

    const embed = buildPollEmbed(poll);

    // Red should have ~67% (2/3), Blue ~33% (1/3)
    expect(embed.data.description).toContain('Red');
    expect(embed.data.description).toContain('Blue');
    expect(embed.data.description).toContain('2 votes');
    expect(embed.data.description).toContain('1 vote)');
    expect(embed.data.footer.text).toContain('Poll #1');
    expect(embed.data.footer.text).toContain('3 voters');
  });

  it('should show "No time limit" for polls without closes_at', async () => {
    const { buildPollEmbed } = await import('../../src/modules/pollHandler.js');

    const poll = {
      id: 2,
      question: 'Test',
      options: ['A', 'B'],
      votes: {},
      closed: false,
      closes_at: null,
    };

    const embed = buildPollEmbed(poll);
    expect(embed.data.footer.text).toContain('No time limit');
  });

  it('should show "Closed" for closed polls', async () => {
    const { buildPollEmbed } = await import('../../src/modules/pollHandler.js');

    const poll = {
      id: 3,
      question: 'Done',
      options: ['A', 'B'],
      votes: {},
      closed: true,
      closes_at: null,
    };

    const embed = buildPollEmbed(poll);
    expect(embed.data.footer.text).toContain('Closed');
  });
});

describe('poll button builder', () => {
  it('should create correct number of buttons', async () => {
    const { buildPollButtons } = await import('../../src/modules/pollHandler.js');

    const rows = buildPollButtons(1, ['A', 'B', 'C']);

    // 3 buttons should fit in 1 row
    expect(rows).toHaveLength(1);
    expect(rows[0].components).toHaveLength(3);
    expect(rows[0].components[0].data.customId).toBe('poll_vote_1_0');
    expect(rows[0].components[1].data.customId).toBe('poll_vote_1_1');
    expect(rows[0].components[2].data.customId).toBe('poll_vote_1_2');
  });

  it('should split buttons across rows when > 5 options', async () => {
    const { buildPollButtons } = await import('../../src/modules/pollHandler.js');

    const opts = Array.from({ length: 8 }, (_, i) => `Option ${i + 1}`);
    const rows = buildPollButtons(1, opts);

    // 8 buttons: 5 in first row, 3 in second
    expect(rows).toHaveLength(2);
    expect(rows[0].components).toHaveLength(5);
    expect(rows[1].components).toHaveLength(3);
  });

  it('should disable buttons when disabled=true', async () => {
    const { buildPollButtons } = await import('../../src/modules/pollHandler.js');

    const rows = buildPollButtons(1, ['A', 'B'], true);

    expect(rows[0].components[0].data.disabled).toBe(true);
    expect(rows[0].components[1].data.disabled).toBe(true);
  });
});
