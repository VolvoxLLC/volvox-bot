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
  getConfig: vi.fn().mockReturnValue({}),
}));
vi.mock('../../src/utils/permissions.js', () => ({
  isModerator: vi.fn().mockReturnValue(true),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

import { autocomplete, data, execute } from '../../src/commands/help.js';
import { getPool } from '../../src/db.js';
import { isModerator } from '../../src/utils/permissions.js';

const mockTopic = {
  id: 1,
  guild_id: 'guild1',
  topic: 'rules',
  title: 'Server Rules',
  content: '1. Be respectful\n2. No spam',
  author_id: 'user1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function createInteraction(subcommand, overrides = {}) {
  const stringValues = {};
  const integerValues = {};
  return {
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getString: vi.fn((name) => stringValues[name] ?? null),
      getInteger: vi.fn((name) => integerValues[name] ?? null),
      getFocused: vi.fn().mockReturnValue(''),
      _setString(name, value) {
        stringValues[name] = value;
      },
      _setInteger(name, value) {
        integerValues[name] = value;
      },
    },
    guild: { id: 'guild1' },
    guildId: 'guild1',
    user: { id: 'mod1', tag: 'Mod#0001' },
    member: { id: 'mod1', permissions: { has: vi.fn().mockReturnValue(true) } },
    client: { user: { id: 'bot1' } },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    respond: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('help command', () => {
  afterEach(() => {
    vi.clearAllMocks();
    isModerator.mockReturnValue(true);
  });

  it('should export data with correct name', () => {
    expect(data.name).toBe('help');
  });

  it('should have all subcommands', () => {
    const subcommands = data.options.map((opt) => opt.name);
    expect(subcommands).toContain('view');
    expect(subcommands).toContain('add');
    expect(subcommands).toContain('edit');
    expect(subcommands).toContain('remove');
    expect(subcommands).toContain('list');
  });

  // ── view ───────────────────────────────────────────────────────

  describe('view subcommand', () => {
    it('should display a topic embed', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [mockTopic] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('view');
      interaction.options._setString('topic', 'rules');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [
        'guild1',
        'rules',
      ]);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should return error for unknown topic', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('view');
      interaction.options._setString('topic', 'nonexistent');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('No help topic found'),
      );
    });
  });

  // ── add ────────────────────────────────────────────────────────

  describe('add subcommand', () => {
    it('should create a new topic', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [mockTopic] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('add');
      interaction.options._setString('topic', 'faq');
      interaction.options._setString('title', 'FAQ');
      interaction.options._setString('content', 'Frequently asked questions');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT'), [
        'guild1',
        'faq',
        'FAQ',
        'Frequently asked questions',
        'mod1',
      ]);
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('created'));
    });

    it('should reject invalid topic slugs', async () => {
      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);

      const invalidSlugs = ['UPPERCASE', 'has spaces', 'trailing-', '-leading', 'a', ''];
      for (const slug of invalidSlugs) {
        const interaction = createInteraction('add');
        interaction.options._setString('topic', slug);
        interaction.options._setString('title', 'Test');
        interaction.options._setString('content', 'content');
        await execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith(
          expect.stringContaining('Topic slug must be'),
        );
        // Should NOT insert
        expect(mockPool.query).not.toHaveBeenCalledWith(
          expect.stringContaining('INSERT'),
          expect.anything(),
        );
        vi.clearAllMocks();
        isModerator.mockReturnValue(true);
      }
    });

    it('should accept valid topic slugs', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('add');
      interaction.options._setString('topic', 'my-valid-topic');
      interaction.options._setString('title', 'Valid');
      interaction.options._setString('content', 'content');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('created'));
    });

    it('should return error for duplicate topic', async () => {
      const dupeError = new Error('duplicate key');
      dupeError.code = '23505';
      const mockPool = { query: vi.fn().mockRejectedValue(dupeError) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('add');
      interaction.options._setString('topic', 'rules');
      interaction.options._setString('title', 'Rules');
      interaction.options._setString('content', 'stuff');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('already exists'));
    });

    it('should reject non-moderators', async () => {
      isModerator.mockReturnValue(false);
      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('add');
      interaction.options._setString('topic', 'test');
      interaction.options._setString('title', 'Test');
      interaction.options._setString('content', 'test');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('moderator permissions'),
      );
      // Should NOT have called INSERT
      expect(mockPool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT'),
        expect.anything(),
      );
    });
  });

  // ── edit ───────────────────────────────────────────────────────

  describe('edit subcommand', () => {
    it('should update an existing topic', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [mockTopic] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('edit');
      interaction.options._setString('topic', 'rules');
      interaction.options._setString('title', 'Updated Rules');
      interaction.options._setString('content', 'New content');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['Updated Rules', 'New content', 'guild1', 'rules']),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('updated'));
    });

    it('should return error when topic not found', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('edit');
      interaction.options._setString('topic', 'nope');
      interaction.options._setString('title', 'X');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('No help topic found'),
      );
    });

    it('should reject non-moderators', async () => {
      isModerator.mockReturnValue(false);
      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('edit');
      interaction.options._setString('topic', 'rules');
      interaction.options._setString('title', 'X');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('moderator permissions'),
      );
    });
  });

  // ── remove ─────────────────────────────────────────────────────

  describe('remove subcommand', () => {
    it('should delete a topic', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [mockTopic] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('remove');
      interaction.options._setString('topic', 'rules');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE'), [
        'guild1',
        'rules',
      ]);
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('removed'));
    });

    it('should return error when topic not found', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('remove');
      interaction.options._setString('topic', 'nope');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('No help topic found'),
      );
    });

    it('should reject non-moderators', async () => {
      isModerator.mockReturnValue(false);
      const mockPool = { query: vi.fn() };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('remove');
      interaction.options._setString('topic', 'rules');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('moderator permissions'),
      );
    });
  });

  // ── list ───────────────────────────────────────────────────────

  describe('list subcommand', () => {
    it('should list topics with pagination', async () => {
      const mockPool = {
        query: vi
          .fn()
          // seedDefaults check — guild already has topics
          .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
          // COUNT query
          .mockResolvedValueOnce({ rows: [{ total: 2 }] })
          // SELECT query
          .mockResolvedValueOnce({
            rows: [
              { topic: 'getting-started', title: 'Getting Started', content: 'Welcome!' },
              { topic: 'rules', title: 'Server Rules', content: '1. Be respectful' },
            ],
          }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should handle empty topics list', async () => {
      const mockPool = {
        query: vi
          .fn()
          // seedDefaults check — no topics yet
          .mockResolvedValueOnce({ rows: [] })
          // seedDefaults INSERTs (3 defaults)
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          // COUNT query (after seeding)
          .mockResolvedValueOnce({ rows: [{ total: 0 }] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('No help topics found'),
      );
    });

    it('should respect page parameter', async () => {
      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
          .mockResolvedValueOnce({ rows: [{ total: 15 }] })
          .mockResolvedValueOnce({
            rows: [{ topic: 'z-topic', title: 'Z Topic', content: 'Last page content' }],
          }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      interaction.options._setInteger('page', 2);
      await execute(interaction);

      // Should use OFFSET 10 for page 2
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('OFFSET'), [
        'guild1',
        10,
        10,
      ]);
    });
  });

  // ── autocomplete ───────────────────────────────────────────────

  describe('autocomplete', () => {
    it('should query DB with ILIKE filter and return matching topics', async () => {
      // DB returns only the rows that match the ILIKE filter (simulating SQL filtering)
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [{ topic: 'rules', title: 'Server Rules' }],
        }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('view');
      interaction.options.getFocused.mockReturnValue('rul');
      await autocomplete(interaction);

      // Should have passed the ILIKE pattern to the query
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), [
        'guild1',
        '%rul%',
      ]);
      expect(interaction.respond).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ value: 'rules' })]),
      );
      const call = interaction.respond.mock.calls[0][0];
      expect(call.length).toBe(1);
    });

    it('should return empty array on error', async () => {
      getPool.mockReturnValue({
        query: vi.fn().mockRejectedValue(new Error('DB error')),
      });

      const interaction = createInteraction('view');
      interaction.options.getFocused.mockReturnValue('test');
      await autocomplete(interaction);

      expect(interaction.respond).toHaveBeenCalledWith([]);
    });
  });

  // ── error handling ─────────────────────────────────────────────

  it('should handle database errors gracefully', async () => {
    getPool.mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error('DB error')),
    });

    const interaction = createInteraction('view');
    interaction.options._setString('topic', 'rules');
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Failed to execute'),
    );
  });
});
