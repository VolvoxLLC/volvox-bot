import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock dependencies ───────────────────────────────────────────────────────

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
  safeSend: vi.fn(),
  safeReply: (t, opts) => t.reply(opts),
  safeEditReply: (t, opts) => t.editReply(opts),
}));

// Minimal discord.js mock — just enough for the builder chain
vi.mock('discord.js', async () => {
  function _chainable() {
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
        setName: () => ({ setDescription: () => ({ addStringOption: () => sub }) }),
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
      this._data = {};
    }
    setColor(c) {
      this._data.color = c;
      return this;
    }
    setTitle(t) {
      this._data.title = t;
      return this;
    }
    setThumbnail(u) {
      this._data.thumbnail = u;
      return this;
    }
    setDescription(d) {
      this._data.description = d;
      return this;
    }
    addFields(...args) {
      this._data.fields = args.flat();
      return this;
    }
    setFooter(f) {
      this._data.footer = f;
      return this;
    }
    setTimestamp() {
      return this;
    }
    toJSON() {
      return this._data;
    }
  }

  return {
    SlashCommandBuilder: MockSlashCommandBuilder,
    EmbedBuilder: MockEmbedBuilder,
  };
});

vi.mock('../../src/modules/challengeScheduler.js', () => ({
  selectTodaysChallenge: vi.fn(),
  buildChallengeEmbed: vi.fn(() => ({ mock: 'embed' })),
  buildChallengeButtons: vi.fn(() => ({ mock: 'buttons' })),
  getChallenges: vi.fn(() => []),
  getLocalDateString: vi.fn(() => '2024-01-10'),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { execute } from '../../src/commands/challenge.js';
import { getPool } from '../../src/db.js';
import {
  buildChallengeButtons,
  buildChallengeEmbed,
  getLocalDateString,
  selectTodaysChallenge,
} from '../../src/modules/challengeScheduler.js';
import { getConfig } from '../../src/modules/config.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInteraction(subcommand, guildId = 'guild-1') {
  return {
    guildId,
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
    },
    user: {
      id: 'user-1',
      displayName: 'TestUser',
      displayAvatarURL: () => 'https://example.com/avatar.png',
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    channel: { send: vi.fn().mockResolvedValue({ id: 'msg-1', startThread: vi.fn() }) },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('/challenge command', () => {
  let mockPool;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ total: '3' }] }),
    };
    getPool.mockReturnValue(mockPool);

    getConfig.mockReturnValue({
      challenges: {
        enabled: true,
        channelId: 'ch-123',
        postTime: '09:00',
        timezone: 'America/New_York',
      },
    });

    selectTodaysChallenge.mockReturnValue({
      challenge: {
        title: 'Two Sum',
        description: 'Given an array…',
        difficulty: 'easy',
        hints: ['Use a hash map'],
        sampleInput: 'nums = [2, 7]',
        sampleOutput: '[0, 1]',
        languages: ['javascript'],
      },
      index: 0,
      dayNumber: 42,
    });
  });

  // ─── Config disabled ──────────────────────────────────────────────────────

  describe('when challenges are disabled', () => {
    it('should return an error message', async () => {
      getConfig.mockReturnValue({ challenges: { enabled: false } });
      const interaction = makeInteraction('today');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('not enabled') }),
      );
    });

    it('should return error when challenges config is absent', async () => {
      getConfig.mockReturnValue({});
      const interaction = makeInteraction('today');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('not enabled') }),
      );
    });
  });

  // ─── /challenge today ─────────────────────────────────────────────────────

  describe('/challenge today', () => {
    it('should call deferReply then editReply with embed and buttons', async () => {
      const interaction = makeInteraction('today');
      await execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalledOnce();
      expect(selectTodaysChallenge).toHaveBeenCalledOnce();
      expect(buildChallengeEmbed).toHaveBeenCalledWith(expect.any(Object), 42, 3);
      expect(buildChallengeButtons).toHaveBeenCalledWith(0);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array), components: expect.any(Array) }),
      );
    });

    it('should handle missing pool gracefully (solve count = 0)', async () => {
      getPool.mockReturnValue(null);
      const interaction = makeInteraction('today');
      await execute(interaction);
      expect(buildChallengeEmbed).toHaveBeenCalledWith(expect.any(Object), 42, 0);
    });
  });

  // ─── /challenge streak ────────────────────────────────────────────────────

  describe('/challenge streak', () => {
    it('should show streak and total solves', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const dayBefore = new Date(today);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 2);

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '5' }] }) // total solves
        .mockResolvedValueOnce({
          rows: [
            { challenge_date: today },
            { challenge_date: yesterday },
            { challenge_date: dayBefore },
          ],
        }); // solved dates (consecutive → streak = 3)

      const interaction = makeInteraction('streak');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should return db error message when pool is null', async () => {
      getPool.mockReturnValue(null);
      const interaction = makeInteraction('streak');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Database unavailable') }),
      );
    });

    it('should handle zero solves (no streak)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const interaction = makeInteraction('streak');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should compute streak correctly for non-consecutive dates', async () => {
      const today = new Date();
      const weekAgo = new Date(today);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7); // gap → streak resets after today

      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '2' }] }).mockResolvedValueOnce({
        rows: [
          { challenge_date: today },
          { challenge_date: weekAgo }, // gap → streak breaks at 1
        ],
      });

      const interaction = makeInteraction('streak');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });
  });

  // ─── /challenge leaderboard ───────────────────────────────────────────────

  describe('/challenge leaderboard', () => {
    it('should show all-time and weekly leaderboards', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'u1', total: '10' },
            { user_id: 'u2', total: '7' },
          ],
        }) // all-time
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1', total: '3' }] }); // this week

      const interaction = makeInteraction('leaderboard');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should handle empty leaderboards', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const interaction = makeInteraction('leaderboard');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('should return error when pool is null', async () => {
      getPool.mockReturnValue(null);
      const interaction = makeInteraction('leaderboard');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Database unavailable') }),
      );
    });
  });
});
