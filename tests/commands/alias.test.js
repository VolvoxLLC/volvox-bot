/**
 * Tests for src/commands/alias.js
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeReply: vi.fn().mockResolvedValue(undefined),
  safeEditReply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/modules/commandAliases.js', () => ({
  addAlias: vi.fn().mockResolvedValue({ alias: 'w', targetCommand: 'warn' }),
  removeAlias: vi.fn().mockResolvedValue(undefined),
  listAliases: vi.fn().mockReturnValue([]),
  resolveAlias: vi.fn().mockReturnValue(null),
}));

import { adminOnly, data, execute } from '../../src/commands/alias.js';
import { getPool } from '../../src/db.js';
import { addAlias, listAliases, removeAlias } from '../../src/modules/commandAliases.js';
import { safeReply } from '../../src/utils/safeSend.js';

/** Helper: build a mock interaction */
function makeInteraction({
  subcommand = 'list',
  alias = 'w',
  command = 'warn',
  guildId = 'guild-1',
  hasPool = true,
  commands = new Map([['warn', { data: { toJSON: () => ({ name: 'warn', options: [] }) } }]]),
} = {}) {
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);

  const pool = hasPool ? { query: vi.fn() } : null;
  if (hasPool) {
    getPool.mockReturnValue(pool);
  } else {
    getPool.mockImplementation(() => {
      throw new Error('No DB');
    });
  }

  return {
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getString: vi.fn().mockImplementation((name) => {
        if (name === 'alias') return alias;
        if (name === 'command') return command;
        return null;
      }),
    },
    guildId,
    user: { id: 'user-123', tag: 'Admin#0001' },
    client: {
      user: { id: 'client-abc' },
      commands,
    },
    deferReply,
    editReply,
    replied: false,
    deferred: false,
  };
}

describe('alias command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has adminOnly flag set', () => {
    expect(adminOnly).toBe(true);
  });

  it('has the correct command name and subcommands', () => {
    const json = data.toJSON();
    expect(json.name).toBe('alias');
    expect(json.options.map((o) => o.name)).toContain('add');
    expect(json.options.map((o) => o.name)).toContain('remove');
    expect(json.options.map((o) => o.name)).toContain('list');
  });

  // ── list ─────────────────────────────────────────────────────────────────

  describe('/alias list', () => {
    it('replies with "no aliases" when list is empty', async () => {
      listAliases.mockReturnValue([]);
      const interaction = makeInteraction({ subcommand: 'list' });
      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('No command aliases') }),
      );
    });

    it('lists existing aliases', async () => {
      listAliases.mockReturnValue([
        { alias: 'w', targetCommand: 'warn' },
        { alias: 'b', targetCommand: 'ban' },
      ]);
      const interaction = makeInteraction({ subcommand: 'list' });
      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('/w') }),
      );
    });
  });

  // ── add ──────────────────────────────────────────────────────────────────

  describe('/alias add', () => {
    it('creates an alias successfully', async () => {
      const interaction = makeInteraction({ subcommand: 'add', alias: 'w', command: 'warn' });
      await execute(interaction);

      expect(addAlias).toHaveBeenCalledWith(
        expect.objectContaining({
          alias: 'w',
          targetCommand: 'warn',
          guildId: 'guild-1',
        }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('✅') }),
      );
    });

    it('rejects invalid alias names', async () => {
      const interaction = makeInteraction({
        subcommand: 'add',
        alias: 'BAD NAME!',
        command: 'warn',
      });
      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Invalid alias name') }),
      );
      expect(addAlias).not.toHaveBeenCalled();
    });

    it('rejects aliasing a built-in command name', async () => {
      // 'warn' is in the commands map
      const interaction = makeInteraction({ subcommand: 'add', alias: 'warn', command: 'ban' });
      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('already a built-in command') }),
      );
    });

    it('rejects unknown target command', async () => {
      const interaction = makeInteraction({
        subcommand: 'add',
        alias: 'x',
        command: 'nonexistent-command',
      });
      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Unknown command') }),
      );
    });

    it('rejects aliasing the alias command itself', async () => {
      const commands = new Map([
        ['alias', { data: { toJSON: () => ({ name: 'alias', options: [] }) } }],
        ['warn', { data: { toJSON: () => ({ name: 'warn', options: [] }) } }],
      ]);
      const interaction = makeInteraction({
        subcommand: 'add',
        alias: 'a',
        command: 'alias',
        commands,
      });
      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Cannot create an alias') }),
      );
    });

    it('shows error when addAlias throws', async () => {
      addAlias.mockRejectedValueOnce(new Error('Discord API error'));
      const interaction = makeInteraction({ subcommand: 'add', alias: 'w', command: 'warn' });
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Failed to create alias') }),
      );
    });

    it('replies with no DB message when DB unavailable', async () => {
      const interaction = makeInteraction({ subcommand: 'add', hasPool: false });
      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Database is not available') }),
      );
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────

  describe('/alias remove', () => {
    it('removes an alias successfully', async () => {
      const interaction = makeInteraction({ subcommand: 'remove', alias: 'w' });
      await execute(interaction);

      expect(removeAlias).toHaveBeenCalledWith(
        expect.objectContaining({ alias: 'w', guildId: 'guild-1' }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('✅') }),
      );
    });

    it('shows error when alias not found', async () => {
      removeAlias.mockRejectedValueOnce(new Error('Alias "/x" not found for this server.'));
      const interaction = makeInteraction({ subcommand: 'remove', alias: 'x' });
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('not found') }),
      );
    });
  });
});
