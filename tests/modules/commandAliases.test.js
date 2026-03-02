/**
 * Tests for src/modules/commandAliases.js
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

// Track mock calls via module-level refs
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockPost = vi.fn().mockResolvedValue({ id: 'discord-cmd-123' });

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal();
  function MockREST() {
    const self = { delete: mockDelete, post: mockPost };
    self.setToken = () => self;
    return self;
  }
  return {
    ...actual,
    REST: MockREST,
    Routes: {
      ...actual.Routes,
      applicationGuildCommands: vi.fn(
        (clientId, guildId) => `/applications/${clientId}/guilds/${guildId}/commands`,
      ),
      applicationGuildCommand: vi.fn(
        (clientId, guildId, cmdId) =>
          `/applications/${clientId}/guilds/${guildId}/commands/${cmdId}`,
      ),
    },
  };
});

import {
  _resetForTesting,
  addAlias,
  listAliases,
  loadAliasesFromDb,
  removeAlias,
  resolveAlias,
} from '../../src/modules/commandAliases.js';

/** Create a minimal mock Pool */
function makePool(rows = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  };
}

/** A minimal SlashCommandBuilder-like data object */
function makeCommandData(name = 'warn', description = 'Warn a user') {
  return {
    toJSON: () => ({
      name,
      description,
      options: [],
    }),
  };
}

describe('commandAliases module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ id: 'discord-cmd-123' });
    mockDelete.mockResolvedValue(undefined);
    process.env.DISCORD_TOKEN = 'test-token';
    _resetForTesting();
  });

  // ── loadAliasesFromDb ────────────────────────────────────────────────────

  describe('loadAliasesFromDb', () => {
    it('loads aliases into the in-memory cache', async () => {
      const pool = makePool([
        { guild_id: 'guild-load-1', alias: 'w', target_command: 'warn' },
        { guild_id: 'guild-load-1', alias: 'b', target_command: 'ban' },
        { guild_id: 'guild-load-2', alias: 'k', target_command: 'kick' },
      ]);

      await loadAliasesFromDb(pool);

      expect(resolveAlias('guild-load-1', 'w')).toBe('warn');
      expect(resolveAlias('guild-load-1', 'b')).toBe('ban');
      expect(resolveAlias('guild-load-2', 'k')).toBe('kick');
    });

    it('handles empty result set gracefully', async () => {
      const pool = makePool([]);
      await loadAliasesFromDb(pool);
      expect(resolveAlias('guild-empty', 'w')).toBeNull();
    });

    it('warns and does not throw when the query fails', async () => {
      const pool = { query: vi.fn().mockRejectedValue(new Error('table not found')) };
      await expect(loadAliasesFromDb(pool)).resolves.toBeUndefined();

      const { warn } = await import('../../src/logger.js');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load command aliases'),
        expect.any(Object),
      );
    });
  });

  // ── resolveAlias ─────────────────────────────────────────────────────────

  describe('resolveAlias', () => {
    beforeEach(async () => {
      const pool = makePool([{ guild_id: 'guild-resolve', alias: 'w', target_command: 'warn' }]);
      await loadAliasesFromDb(pool);
    });

    it('returns target command for a known alias', () => {
      expect(resolveAlias('guild-resolve', 'w')).toBe('warn');
    });

    it('returns null for an unknown alias', () => {
      expect(resolveAlias('guild-resolve', 'unknown')).toBeNull();
    });

    it('returns null for an unknown guild', () => {
      expect(resolveAlias('guild-not-here', 'w')).toBeNull();
    });
  });

  // ── listAliases ──────────────────────────────────────────────────────────

  describe('listAliases', () => {
    beforeEach(async () => {
      const pool = makePool([
        { guild_id: 'guild-list', alias: 'w', target_command: 'warn' },
        { guild_id: 'guild-list', alias: 'b', target_command: 'ban' },
      ]);
      await loadAliasesFromDb(pool);
    });

    it('returns all aliases for a guild', () => {
      const result = listAliases('guild-list');
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ alias: 'w', targetCommand: 'warn' });
      expect(result).toContainEqual({ alias: 'b', targetCommand: 'ban' });
    });

    it('returns empty array for a guild with no aliases', () => {
      expect(listAliases('guild-no-aliases')).toEqual([]);
    });
  });

  // ── addAlias ─────────────────────────────────────────────────────────────

  describe('addAlias', () => {
    it('registers with Discord and persists to DB', async () => {
      const pool = makePool([]);
      pool.query = vi.fn().mockResolvedValue({ rows: [] });

      await addAlias({
        pool,
        guildId: 'guild-add-1',
        alias: 'w',
        targetCommand: 'warn',
        createdBy: 'user-123',
        clientId: 'client-abc',
        targetCommandData: makeCommandData('warn'),
      });

      // Discord registration — post called with alias name
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('guild-add-1'),
        expect.objectContaining({
          body: expect.objectContaining({ name: 'w' }),
        }),
      );

      // DB persistence
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO guild_command_aliases'),
        expect.arrayContaining(['guild-add-1', 'w', 'warn', 'discord-cmd-123', 'user-123']),
      );

      // Cache updated
      expect(resolveAlias('guild-add-1', 'w')).toBe('warn');
    });

    it('throws when Discord registration fails', async () => {
      mockPost.mockRejectedValueOnce(new Error('Discord API error'));

      const pool = makePool([]);
      await expect(
        addAlias({
          pool,
          guildId: 'guild-err',
          alias: 'x',
          targetCommand: 'kick',
          createdBy: 'user-1',
          clientId: 'client-1',
          targetCommandData: makeCommandData('kick'),
        }),
      ).rejects.toThrow('Failed to register alias with Discord');
    });
  });

  // ── removeAlias ──────────────────────────────────────────────────────────

  describe('removeAlias', () => {
    beforeEach(async () => {
      // Pre-load an alias so cache has something
      const pool = makePool([{ guild_id: 'guild-remove', alias: 'w', target_command: 'warn' }]);
      await loadAliasesFromDb(pool);
    });

    it('deregisters from Discord, removes from DB, and clears cache', async () => {
      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ discord_command_id: 'cmd-456' }] }) // SELECT
          .mockResolvedValueOnce({ rows: [] }), // DELETE
      };

      await removeAlias({
        pool,
        guildId: 'guild-remove',
        alias: 'w',
        clientId: 'client-abc',
      });

      expect(mockDelete).toHaveBeenCalledWith(expect.stringContaining('cmd-456'));

      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE FROM guild_command_aliases'),
        expect.arrayContaining(['guild-remove', 'w']),
      );

      expect(resolveAlias('guild-remove', 'w')).toBeNull();
    });

    it('throws when alias is not found in DB', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };

      await expect(
        removeAlias({ pool, guildId: 'guild-remove', alias: 'nonexistent', clientId: 'c1' }),
      ).rejects.toThrow('Alias "/nonexistent" not found');
    });

    it('continues with DB removal even when Discord deregistration fails', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Discord 404'));
      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ discord_command_id: 'cmd-789' }] })
          .mockResolvedValueOnce({ rows: [] }),
      };

      await expect(
        removeAlias({ pool, guildId: 'guild-remove', alias: 'w', clientId: 'client-1' }),
      ).resolves.toBeUndefined();

      // DB delete still called even though Discord failed
      expect(pool.query).toHaveBeenCalledTimes(2);
    });
  });
});
