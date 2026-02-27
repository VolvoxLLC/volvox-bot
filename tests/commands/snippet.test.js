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
  isModerator: vi.fn().mockReturnValue(false),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

import { autocomplete, data, execute } from '../../src/commands/snippet.js';
import { getPool } from '../../src/db.js';
import { isModerator } from '../../src/utils/permissions.js';

const mockSnippet = {
  id: 1,
  guild_id: 'guild1',
  name: 'hello-world',
  language: 'js',
  code: 'console.log("Hello, world!");',
  description: 'A simple hello world snippet',
  author_id: 'user1',
  usage_count: 5,
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
    user: { id: 'user1', tag: 'User#0001' },
    member: { id: 'user1', permissions: { has: vi.fn().mockReturnValue(false) } },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    respond: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('snippet command', () => {
  afterEach(() => {
    vi.clearAllMocks();
    isModerator.mockReturnValue(false);
  });

  it('should export data with correct name', () => {
    expect(data.name).toBe('snippet');
  });

  it('should have all subcommands', () => {
    const subcommands = data.options.map((opt) => opt.name);
    expect(subcommands).toContain('save');
    expect(subcommands).toContain('get');
    expect(subcommands).toContain('search');
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('delete');
  });

  // ── save ──────────────────────────────────────────────────────────

  describe('save subcommand', () => {
    it('should create a snippet', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('save');
      interaction.options._setString('name', 'hello-world');
      interaction.options._setString('language', 'js');
      interaction.options._setString('code', 'console.log("Hello!");');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO snippets'), [
        'guild1',
        'hello-world',
        'js',
        'console.log("Hello!");',
        null,
        'user1',
      ]);
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('✅'));
    });

    it('should reject duplicate names', async () => {
      const dupError = new Error('duplicate key value');
      dupError.code = '23505';
      const mockPool = { query: vi.fn().mockRejectedValue(dupError) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('save');
      interaction.options._setString('name', 'hello-world');
      interaction.options._setString('language', 'js');
      interaction.options._setString('code', 'console.log("Hello!");');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('already exists'));
    });

    it('should save snippet with description', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('save');
      interaction.options._setString('name', 'my-snippet');
      interaction.options._setString('language', 'python');
      interaction.options._setString('code', 'print("hi")');
      interaction.options._setString('description', 'A python snippet');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO snippets'), [
        'guild1',
        'my-snippet',
        'python',
        'print("hi")',
        'A python snippet',
        'user1',
      ]);
    });
  });

  // ── get ───────────────────────────────────────────────────────────

  describe('get subcommand', () => {
    it('should return code block with correct language', async () => {
      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [mockSnippet] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('get');
      interaction.options._setString('name', 'hello-world');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                description: expect.stringContaining('```js'),
              }),
            }),
          ]),
        }),
      );
    });

    it('should increment usage_count on get', async () => {
      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [mockSnippet] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('get');
      interaction.options._setString('name', 'hello-world');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('usage_count = usage_count + 1'),
        [mockSnippet.id],
      );
    });

    it('should return not found message for missing snippet', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('get');
      interaction.options._setString('name', 'nonexistent');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('❌'));
    });
  });

  // ── search ────────────────────────────────────────────────────────

  describe('search subcommand', () => {
    it('should find snippets by name', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [mockSnippet] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('search');
      interaction.options._setString('query', 'hello');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), [
        'guild1',
        '%hello%',
      ]);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should find snippets by description', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [mockSnippet] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('search');
      interaction.options._setString('query', 'simple');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('description ILIKE'), [
        'guild1',
        '%simple%',
      ]);
    });

    it('should return not found when no results', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('search');
      interaction.options._setString('query', 'zzznomatch');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('❌'));
    });
  });

  // ── list ──────────────────────────────────────────────────────────

  describe('list subcommand', () => {
    it('should return paginated embed with snippets', async () => {
      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ total: 1 }] })
          .mockResolvedValueOnce({ rows: [mockSnippet] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should show empty message when no snippets', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValueOnce({ rows: [{ total: 0 }] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('No snippets'));
    });

    it('should sort by popular when requested', async () => {
      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ total: 2 }] })
          .mockResolvedValueOnce({ rows: [mockSnippet] }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = createInteraction('list');
      interaction.options._setString('sort', 'popular');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('usage_count DESC'),
        expect.any(Array),
      );
    });
  });

  // ── delete ────────────────────────────────────────────────────────

  describe('delete subcommand', () => {
    it('should allow author to delete their own snippet', async () => {
      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [mockSnippet] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      getPool.mockReturnValue(mockPool);

      // user1 is the author of mockSnippet
      const interaction = createInteraction('delete', {
        user: { id: 'user1', tag: 'User#0001' },
      });
      interaction.options._setString('name', 'hello-world');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM snippets'), [
        mockSnippet.id,
      ]);
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('✅'));
    });

    it('should allow moderator to delete any snippet', async () => {
      isModerator.mockReturnValue(true);

      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [mockSnippet] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      getPool.mockReturnValue(mockPool);

      // mod2 is NOT the author but is a moderator
      const interaction = createInteraction('delete', {
        user: { id: 'mod2', tag: 'Mod#0002' },
      });
      interaction.options._setString('name', 'hello-world');
      await execute(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM snippets'), [
        mockSnippet.id,
      ]);
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('✅'));
    });

    it('should deny non-author non-mod from deleting', async () => {
      isModerator.mockReturnValue(false);

      const mockPool = {
        query: vi.fn().mockResolvedValueOnce({ rows: [mockSnippet] }),
      };
      getPool.mockReturnValue(mockPool);

      // other-user is not the author and not a mod
      const interaction = createInteraction('delete', {
        user: { id: 'other-user', tag: 'Other#0003' },
      });
      interaction.options._setString('name', 'hello-world');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('❌'));
      // Should NOT call DELETE
      const deleteCalls = mockPool.query.mock.calls.filter((c) => c[0].includes('DELETE'));
      expect(deleteCalls.length).toBe(0);
    });
  });

  // ── autocomplete ──────────────────────────────────────────────────

  describe('autocomplete', () => {
    it('should return matching snippet names for get subcommand', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [{ name: 'hello-world', language: 'js' }],
        }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = {
        guild: { id: 'guild1' },
        options: {
          getSubcommand: vi.fn().mockReturnValue('get'),
          getFocused: vi.fn().mockReturnValue({ name: 'name', value: 'hello' }),
        },
        respond: vi.fn().mockResolvedValue(undefined),
      };

      await autocomplete(interaction);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), [
        'guild1',
        '%hello%',
      ]);
      expect(interaction.respond).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ value: 'hello-world' })]),
      );
    });

    it('should return matching snippet names for delete subcommand', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [{ name: 'my-snippet', language: 'python' }],
        }),
      };
      getPool.mockReturnValue(mockPool);

      const interaction = {
        guild: { id: 'guild1' },
        options: {
          getSubcommand: vi.fn().mockReturnValue('delete'),
          getFocused: vi.fn().mockReturnValue({ name: 'name', value: 'my' }),
        },
        respond: vi.fn().mockResolvedValue(undefined),
      };

      await autocomplete(interaction);

      expect(interaction.respond).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ value: 'my-snippet' })]),
      );
    });

    it('should return language suggestions for save subcommand', async () => {
      const interaction = {
        guild: { id: 'guild1' },
        options: {
          getSubcommand: vi.fn().mockReturnValue('save'),
          getFocused: vi.fn().mockReturnValue({ name: 'language', value: 'py' }),
        },
        respond: vi.fn().mockResolvedValue(undefined),
      };

      await autocomplete(interaction);

      expect(interaction.respond).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ value: 'python' })]),
      );
    });

    it('should return empty array on error', async () => {
      getPool.mockReturnValue({
        query: vi.fn().mockRejectedValue(new Error('DB error')),
      });

      const interaction = {
        guild: { id: 'guild1' },
        options: {
          getSubcommand: vi.fn().mockReturnValue('get'),
          getFocused: vi.fn().mockReturnValue({ name: 'name', value: 'test' }),
        },
        respond: vi.fn().mockResolvedValue(undefined),
      };

      await autocomplete(interaction);

      expect(interaction.respond).toHaveBeenCalledWith([]);
    });
  });

  // ── error handling ────────────────────────────────────────────────

  it('should handle database errors gracefully', async () => {
    getPool.mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error('DB error')),
    });

    const interaction = createInteraction('get');
    interaction.options._setString('name', 'hello-world');
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Failed to execute'),
    );
  });
});
