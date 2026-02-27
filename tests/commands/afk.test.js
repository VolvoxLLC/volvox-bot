import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

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
  safeReply: vi.fn().mockResolvedValue(undefined),
  safeSend: vi.fn().mockResolvedValue(undefined),
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
      fn({
        setName: () => ({
          setDescription: () => ({
            addStringOption: (f) => {
              f(chainable());
              return { addStringOption: (f2) => { f2(chainable()); return {}; } };
            },
          }),
        }),
      });
      return this;
    }
    toJSON() {
      return { name: this.name, description: this.description };
    }
  }

  return { SlashCommandBuilder: MockSlashCommandBuilder };
});

import { getPool } from '../../src/db.js';
import { getConfig } from '../../src/modules/config.js';
import { safeReply } from '../../src/utils/safeSend.js';
import { buildPingSummary, execute } from '../../src/commands/afk.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInteraction(subcommand, opts = {}) {
  return {
    guildId: 'guild1',
    user: { id: 'user1', tag: 'User#1234' },
    guild: { id: 'guild1' },
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => opts[name] ?? null,
    },
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

function makePool(overrides = {}) {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('afk command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Config gate ─────────────────────────────────────────────────────────────

  describe('config gate', () => {
    it('replies with disabled message when afk.enabled is false', async () => {
      getConfig.mockReturnValue({ afk: { enabled: false } });
      const interaction = makeInteraction('set');

      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('not enabled') }),
      );
    });

    it('replies with disabled message when afk config is missing', async () => {
      getConfig.mockReturnValue({});
      const interaction = makeInteraction('set');

      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('not enabled') }),
      );
    });
  });

  // ── /afk set ────────────────────────────────────────────────────────────────

  describe('/afk set', () => {
    it('stores AFK status in DB with provided reason', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });
      const pool = makePool();
      getPool.mockReturnValue(pool);

      const interaction = makeInteraction('set', { reason: 'On a walk' });
      await execute(interaction);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO afk_status'),
        ['guild1', 'user1', 'On a walk'],
      );
    });

    it('uses default reason "AFK" when no reason given', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });
      const pool = makePool();
      getPool.mockReturnValue(pool);

      const interaction = makeInteraction('set', { reason: null });
      await execute(interaction);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO afk_status'),
        ['guild1', 'user1', 'AFK'],
      );
    });

    it('replies ephemerally after setting AFK', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });
      const pool = makePool();
      getPool.mockReturnValue(pool);

      const interaction = makeInteraction('set');
      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ ephemeral: true, content: expect.stringContaining('AFK') }),
      );
    });
  });

  // ── /afk clear ──────────────────────────────────────────────────────────────

  describe('/afk clear', () => {
    it('tells user they are not AFK if no record found', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });
      const pool = makePool();
      getPool.mockReturnValue(pool);

      const interaction = makeInteraction('clear');
      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining("not AFK") }),
      );
    });

    it('clears AFK and returns ping summary', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });

      const pings = [
        {
          pinger_id: 'pinger1',
          channel_id: 'ch1',
          message_preview: 'hey',
          pinged_at: new Date('2024-01-01T12:00:00Z'),
        },
      ];

      const pool = {
        query: vi
          .fn()
          // 1st call: SELECT afk_status → found
          .mockResolvedValueOnce({ rows: [{ id: 1, reason: 'Lunch' }] })
          // 2nd call: SELECT afk_pings
          .mockResolvedValueOnce({ rows: pings })
          // 3rd call: DELETE afk_status
          .mockResolvedValueOnce({ rows: [] })
          // 4th call: DELETE afk_pings
          .mockResolvedValueOnce({ rows: [] }),
      };
      getPool.mockReturnValue(pool);

      const interaction = makeInteraction('clear');
      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({
          content: expect.stringContaining('Pings while AFK'),
          ephemeral: true,
        }),
      );
    });

    it('deletes both afk_status and afk_pings rows on clear', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });

      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      getPool.mockReturnValue(pool);

      const interaction = makeInteraction('clear');
      await execute(interaction);

      const calls = pool.query.mock.calls;
      expect(calls.some(([q]) => q.includes('DELETE FROM afk_status'))).toBe(true);
      expect(calls.some(([q]) => q.includes('DELETE FROM afk_pings'))).toBe(true);
    });
  });

  // ── buildPingSummary ─────────────────────────────────────────────────────────

  describe('buildPingSummary', () => {
    it('returns no-ping message when pings array is empty', () => {
      expect(buildPingSummary([])).toContain('No one pinged you');
    });

    it('includes pinger mention and channel for each ping', () => {
      const pings = [
        {
          pinger_id: 'pinger1',
          channel_id: 'ch1',
          message_preview: 'yo',
          pinged_at: new Date(),
        },
      ];
      const summary = buildPingSummary(pings);
      expect(summary).toContain('<@pinger1>');
      expect(summary).toContain('<#ch1>');
    });

    it('caps display at 10 pings and shows overflow count', () => {
      const pings = Array.from({ length: 15 }, (_, i) => ({
        pinger_id: `p${i}`,
        channel_id: `c${i}`,
        message_preview: null,
        pinged_at: new Date(),
      }));
      const summary = buildPingSummary(pings);
      expect(summary).toContain('5 more');
    });
  });
});
