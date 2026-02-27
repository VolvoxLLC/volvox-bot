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
    showcase: { enabled: true },
    permissions: { enabled: true, adminRoleId: null, usePermissions: true },
  }),
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
              };
            },
            addIntegerOption: function self(fn2) {
              fn2(chainable());
              return {
                addStringOption: self,
                addIntegerOption: self,
                addBooleanOption: self,
              };
            },
            addBooleanOption: function self(fn2) {
              fn2(chainable());
              return {
                addStringOption: self,
                addIntegerOption: self,
                addBooleanOption: self,
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
      this.data = { fields: [] };
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
    addFields(...fields) {
      const flat = fields.flat();
      this.data.fields.push(...flat);
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
      this.components.push(...items.flat());
      return this;
    }
  }

  class MockModalBuilder {
    constructor() {
      this.data = { components: [] };
    }
    setCustomId(id) {
      this.data.customId = id;
      return this;
    }
    setTitle(t) {
      this.data.title = t;
      return this;
    }
    addComponents(...rows) {
      this.data.components.push(...rows.flat());
      return this;
    }
  }

  class MockTextInputBuilder {
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
    setRequired(r) {
      this.data.required = r;
      return this;
    }
    setMaxLength(m) {
      this.data.maxLength = m;
      return this;
    }
    setPlaceholder(p) {
      this.data.placeholder = p;
      return this;
    }
  }

  return {
    SlashCommandBuilder: MockSlashCommandBuilder,
    EmbedBuilder: MockEmbedBuilder,
    ButtonBuilder: MockButtonBuilder,
    ActionRowBuilder: MockActionRowBuilder,
    ModalBuilder: MockModalBuilder,
    TextInputBuilder: MockTextInputBuilder,
    ButtonStyle: { Primary: 1, Secondary: 2, Danger: 4 },
    TextInputStyle: { Short: 1, Paragraph: 2 },
  };
});

import {
  buildShowcaseEmbed,
  buildUpvoteRow,
  data,
  execute,
  handleShowcaseModalSubmit,
  handleShowcaseUpvote,
} from '../../src/commands/showcase.js';
import { getPool } from '../../src/db.js';
import { getConfig } from '../../src/modules/config.js';

/** Create a mock slash command interaction. */
function createMockInteraction(subcommand, options = {}) {
  const optionValues = {
    tag: null,
    page: null,
    id: null,
    ...options,
  };

  return {
    guildId: 'guild-123',
    channelId: 'ch-456',
    user: { id: 'user-789', tag: 'TestUser#0001' },
    member: { id: 'user-789' },
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
    showModal: vi.fn(),
  };
}

/** Create a mock modal submit interaction. */
function createMockModalInteraction(fields = {}) {
  const defaults = {
    showcase_name: 'My Awesome Project',
    showcase_description: 'A cool project I built.',
    showcase_tech: 'node, react, postgres',
    showcase_repo: 'https://github.com/user/repo',
    showcase_live: 'https://myproject.dev',
    ...fields,
  };

  return {
    guildId: 'guild-123',
    channelId: 'ch-456',
    user: { id: 'user-789', tag: 'TestUser#0001' },
    customId: 'showcase_submit_modal',
    fields: {
      getTextInputValue: vi.fn((key) => defaults[key] ?? ''),
    },
    channel: {
      send: vi.fn().mockResolvedValue({ id: 'msg-002' }),
    },
    reply: vi.fn(),
    editReply: vi.fn(),
    deferReply: vi.fn(),
  };
}

/** Create a mock button interaction. */
function createMockButtonInteraction(customId, userId = 'voter-001') {
  return {
    customId,
    guildId: 'guild-123',
    user: { id: userId },
    message: { edit: vi.fn() },
    reply: vi.fn(),
    replied: false,
    deferred: false,
  };
}

// ── Core export tests ──────────────────────────────────────────────

describe('showcase command exports', () => {
  it('should export data with name "showcase"', () => {
    expect(data.name).toBe('showcase');
  });

  it('should export buildShowcaseEmbed as a function', () => {
    expect(typeof buildShowcaseEmbed).toBe('function');
  });

  it('should export buildUpvoteRow as a function', () => {
    expect(typeof buildUpvoteRow).toBe('function');
  });
});

// ── buildShowcaseEmbed ─────────────────────────────────────────────

describe('buildShowcaseEmbed', () => {
  const baseShowcase = {
    id: 1,
    name: 'Cool Project',
    description: 'A very cool project.',
    tech_stack: ['node', 'react'],
    repo_url: 'https://github.com/user/cool',
    live_url: 'https://cool.dev',
    author_id: 'user-123',
    upvotes: 5,
    created_at: new Date('2025-01-01T00:00:00Z'),
  };

  it('should set title to project name', () => {
    const embed = buildShowcaseEmbed(baseShowcase);
    expect(embed.data.title).toBe('Cool Project');
  });

  it('should set description to project description', () => {
    const embed = buildShowcaseEmbed(baseShowcase);
    expect(embed.data.description).toBe('A very cool project.');
  });

  it('should include tech stack field', () => {
    const embed = buildShowcaseEmbed(baseShowcase);
    const techField = embed.data.fields.find((f) => f.name === 'Tech Stack');
    expect(techField).toBeDefined();
    expect(techField.value).toContain('node');
    expect(techField.value).toContain('react');
  });

  it('should include repo URL field when provided', () => {
    const embed = buildShowcaseEmbed(baseShowcase);
    const repoField = embed.data.fields.find((f) => f.name === 'Repo URL');
    expect(repoField).toBeDefined();
    expect(repoField.value).toBe('https://github.com/user/cool');
  });

  it('should include live URL field when provided', () => {
    const embed = buildShowcaseEmbed(baseShowcase);
    const liveField = embed.data.fields.find((f) => f.name === 'Live URL');
    expect(liveField).toBeDefined();
  });

  it('should include author and upvotes fields', () => {
    const embed = buildShowcaseEmbed(baseShowcase);
    const authorField = embed.data.fields.find((f) => f.name === 'Author');
    const upvotesField = embed.data.fields.find((f) => f.name === 'Upvotes');
    expect(authorField).toBeDefined();
    expect(upvotesField).toBeDefined();
    expect(upvotesField.value).toBe('5');
  });

  it('should include ID in footer', () => {
    const embed = buildShowcaseEmbed(baseShowcase);
    expect(embed.data.footer.text).toContain('ID: 1');
  });

  it('should skip tech stack field when empty', () => {
    const embed = buildShowcaseEmbed({ ...baseShowcase, tech_stack: [] });
    const techField = embed.data.fields.find((f) => f.name === 'Tech Stack');
    expect(techField).toBeUndefined();
  });

  it('should skip repo URL field when null', () => {
    const embed = buildShowcaseEmbed({ ...baseShowcase, repo_url: null });
    const repoField = embed.data.fields.find((f) => f.name === 'Repo URL');
    expect(repoField).toBeUndefined();
  });

  it('should skip live URL field when null', () => {
    const embed = buildShowcaseEmbed({ ...baseShowcase, live_url: null });
    const liveField = embed.data.fields.find((f) => f.name === 'Live URL');
    expect(liveField).toBeUndefined();
  });
});

// ── buildUpvoteRow ─────────────────────────────────────────────────

describe('buildUpvoteRow', () => {
  it('should create a button with correct customId', () => {
    const row = buildUpvoteRow(42, 7);
    expect(row.components).toHaveLength(1);
    expect(row.components[0].data.customId).toBe('showcase_upvote_42');
  });

  it('should show upvote count in label', () => {
    const row = buildUpvoteRow(1, 13);
    expect(row.components[0].data.label).toBe('👍 13');
  });
});

// ── /showcase execute ──────────────────────────────────────────────

describe('showcase execute', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    getPool.mockReturnValue(mockPool);
    getConfig.mockReturnValue({ showcase: { enabled: true } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should reject when no guild', async () => {
    const interaction = createMockInteraction('browse');
    interaction.guildId = null;
    await execute(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('server') }),
    );
  });

  it('should reject when showcase is disabled', async () => {
    getConfig.mockReturnValueOnce({ showcase: { enabled: false } });
    const interaction = createMockInteraction('browse');
    await execute(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('disabled') }),
    );
  });

  it('should return error when pool unavailable for browse', async () => {
    getPool.mockReturnValueOnce(null);
    const interaction = createMockInteraction('browse');
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Database is not available') }),
    );
  });
});

// ── /showcase submit ───────────────────────────────────────────────

describe('showcase submit subcommand', () => {
  afterEach(() => vi.clearAllMocks());

  it('should show a modal when submit is called', async () => {
    getConfig.mockReturnValue({ showcase: { enabled: true } });
    const interaction = createMockInteraction('submit');
    await execute(interaction);
    expect(interaction.showModal).toHaveBeenCalledOnce();
  });
});

// ── handleShowcaseModalSubmit ──────────────────────────────────────

describe('handleShowcaseModalSubmit', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    getConfig.mockReturnValue({ showcase: { enabled: true } });
  });

  afterEach(() => vi.clearAllMocks());

  it('should reject when no guild', async () => {
    const interaction = createMockModalInteraction();
    interaction.guildId = null;
    await handleShowcaseModalSubmit(interaction, mockPool);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('server') }),
    );
  });

  it('should reject when showcase is disabled', async () => {
    getConfig.mockReturnValueOnce({ showcase: { enabled: false } });
    const interaction = createMockModalInteraction();
    await handleShowcaseModalSubmit(interaction, mockPool);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('disabled') }),
    );
  });

  it('should save project and send embed to channel', async () => {
    const showcase = {
      id: 1,
      guild_id: 'guild-123',
      author_id: 'user-789',
      name: 'My Awesome Project',
      description: 'A cool project I built.',
      tech_stack: ['node', 'react', 'postgres'],
      repo_url: 'https://github.com/user/repo',
      live_url: 'https://myproject.dev',
      upvotes: 0,
      created_at: new Date(),
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [showcase] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // UPDATE message_id

    const interaction = createMockModalInteraction();
    await handleShowcaseModalSubmit(interaction, mockPool);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO showcases'),
      expect.arrayContaining(['guild-123', 'user-789', 'My Awesome Project']),
    );
    expect(interaction.channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array),
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('My Awesome Project'),
      }),
    );
  });

  it('should handle empty optional fields', async () => {
    const showcase = {
      id: 2,
      guild_id: 'guild-123',
      author_id: 'user-789',
      name: 'Minimal Project',
      description: 'Just a description.',
      tech_stack: [],
      repo_url: null,
      live_url: null,
      upvotes: 0,
      created_at: new Date(),
    };

    mockPool.query.mockResolvedValueOnce({ rows: [showcase] }).mockResolvedValueOnce({ rows: [] });

    const interaction = createMockModalInteraction({
      showcase_name: 'Minimal Project',
      showcase_description: 'Just a description.',
      showcase_tech: '',
      showcase_repo: '',
      showcase_live: '',
    });

    await handleShowcaseModalSubmit(interaction, mockPool);

    // Should call INSERT with null for optional fields
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO showcases'),
      expect.arrayContaining([null, null]),
    );
  });
});

// ── /showcase browse ───────────────────────────────────────────────

describe('showcase browse subcommand', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    getPool.mockReturnValue(mockPool);
    getConfig.mockReturnValue({ showcase: { enabled: true } });
  });

  afterEach(() => vi.clearAllMocks());

  it('should show empty message when no projects', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ total: 0 }] });
    const interaction = createMockInteraction('browse');
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('No projects') }),
    );
  });

  it('should list projects', async () => {
    const project = {
      id: 1,
      name: 'Test Project',
      author_id: 'user-789',
      tech_stack: ['node'],
      upvotes: 3,
      created_at: new Date(),
    };
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [project] });

    const interaction = createMockInteraction('browse');
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('should filter by tag when provided', async () => {
    const project = {
      id: 2,
      name: 'React App',
      author_id: 'user-789',
      tech_stack: ['react'],
      upvotes: 1,
      created_at: new Date(),
    };
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [project] });

    const interaction = createMockInteraction('browse', { tag: 'react' });
    await execute(interaction);

    // First query should include the tag filter
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ANY(tech_stack)'),
      expect.arrayContaining(['guild-123', 'react']),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('should show empty message when no projects match tag', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ total: 0 }] });
    const interaction = createMockInteraction('browse', { tag: 'cobol' });
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('cobol') }),
    );
  });
});

// ── /showcase top ──────────────────────────────────────────────────

describe('showcase top subcommand', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    getPool.mockReturnValue(mockPool);
    getConfig.mockReturnValue({ showcase: { enabled: true } });
  });

  afterEach(() => vi.clearAllMocks());

  it('should show empty message when no projects', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const interaction = createMockInteraction('top');
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('No projects') }),
    );
  });

  it('should show top 10 projects sorted by upvotes', async () => {
    const projects = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Project ${i + 1}`,
      author_id: 'user-789',
      tech_stack: ['node'],
      upvotes: 10 - i,
    }));
    mockPool.query.mockResolvedValueOnce({ rows: projects });

    const interaction = createMockInteraction('top');
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
    // Should query ORDER BY upvotes DESC
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY upvotes DESC'),
      expect.any(Array),
    );
  });
});

// ── /showcase view ─────────────────────────────────────────────────

describe('showcase view subcommand', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    getPool.mockReturnValue(mockPool);
    getConfig.mockReturnValue({ showcase: { enabled: true } });
  });

  afterEach(() => vi.clearAllMocks());

  it('should show not found for missing project', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const interaction = createMockInteraction('view', { id: 999 });
    await execute(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('#999') }),
    );
  });

  it('should show project details', async () => {
    const showcase = {
      id: 5,
      guild_id: 'guild-123',
      author_id: 'user-789',
      name: 'My Project',
      description: 'Description here.',
      tech_stack: ['rust'],
      repo_url: null,
      live_url: null,
      upvotes: 2,
      created_at: new Date(),
    };
    mockPool.query.mockResolvedValueOnce({ rows: [showcase] });

    const interaction = createMockInteraction('view', { id: 5 });
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array),
      }),
    );
  });
});

// ── handleShowcaseUpvote ───────────────────────────────────────────

describe('handleShowcaseUpvote', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = { query: vi.fn() };
  });

  afterEach(() => vi.clearAllMocks());

  it('should reject upvote on own project', async () => {
    const showcase = {
      id: 1,
      guild_id: 'guild-123',
      author_id: 'voter-001', // same as voter
      name: 'My Project',
      upvotes: 3,
    };
    mockPool.query.mockResolvedValueOnce({ rows: [showcase] });

    const interaction = createMockButtonInteraction('showcase_upvote_1', 'voter-001');
    await handleShowcaseUpvote(interaction, mockPool);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("can't upvote your own") }),
    );
  });

  it('should reject when project does not exist', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const interaction = createMockButtonInteraction('showcase_upvote_999', 'voter-001');
    await handleShowcaseUpvote(interaction, mockPool);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('no longer exists') }),
    );
  });

  it('should add upvote when not yet voted', async () => {
    const showcase = {
      id: 2,
      guild_id: 'guild-123',
      author_id: 'author-123',
      name: 'Awesome App',
      upvotes: 4,
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [showcase] }) // SELECT showcase
      .mockResolvedValueOnce({ rows: [] }) // SELECT vote (none)
      .mockResolvedValueOnce({ rows: [] }) // INSERT vote
      .mockResolvedValueOnce({ rows: [{ upvotes: 5 }] }); // UPDATE upvotes

    const interaction = createMockButtonInteraction('showcase_upvote_2', 'voter-001');
    await handleShowcaseUpvote(interaction, mockPool);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Upvoted') }),
    );
    // Should update message button
    expect(interaction.message.edit).toHaveBeenCalledWith(
      expect.objectContaining({ components: expect.any(Array) }),
    );
  });

  it('should toggle off upvote when already voted', async () => {
    const showcase = {
      id: 3,
      guild_id: 'guild-123',
      author_id: 'author-123',
      name: 'Another App',
      upvotes: 6,
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [showcase] }) // SELECT showcase
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] }) // SELECT vote (exists)
      .mockResolvedValueOnce({ rows: [] }) // DELETE vote
      .mockResolvedValueOnce({ rows: [{ upvotes: 5 }] }); // UPDATE upvotes

    const interaction = createMockButtonInteraction('showcase_upvote_3', 'voter-001');
    await handleShowcaseUpvote(interaction, mockPool);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Removed your upvote') }),
    );
    // Should call DELETE
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM showcase_votes'),
      expect.any(Array),
    );
  });

  it('should update upvotes count in showcases table', async () => {
    const showcase = {
      id: 4,
      guild_id: 'guild-123',
      author_id: 'author-123',
      name: 'Count App',
      upvotes: 0,
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [showcase] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ upvotes: 1 }] });

    const interaction = createMockButtonInteraction('showcase_upvote_4', 'voter-002');
    await handleShowcaseUpvote(interaction, mockPool);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE showcases SET upvotes = upvotes + 1'),
      expect.arrayContaining([4]),
    );
  });

  it('should reject when no guild', async () => {
    const interaction = createMockButtonInteraction('showcase_upvote_1', 'voter-001');
    interaction.guildId = null;
    await handleShowcaseUpvote(interaction, mockPool);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('server') }),
    );
  });
});
