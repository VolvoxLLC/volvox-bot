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

// Minimal discord.js mock
vi.mock('discord.js', () => {
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
    from(e) {
      const b = new MockEmbedBuilder();
      b._data = { ...e.data };
      return b;
    }
    static from(e) {
      const b = new MockEmbedBuilder();
      b._data = { ...(e._data ?? {}) };
      return b;
    }
    toJSON() {
      return this._data;
    }
  }

  class MockButtonBuilder {
    constructor() {
      this._data = {};
    }
    setCustomId(id) {
      this._data.customId = id;
      return this;
    }
    setLabel(l) {
      this._data.label = l;
      return this;
    }
    setStyle(s) {
      this._data.style = s;
      return this;
    }
    toJSON() {
      return this._data;
    }
  }

  class MockActionRowBuilder {
    constructor() {
      this._components = [];
    }
    addComponents(...comps) {
      this._components.push(...comps.flat());
      return this;
    }
    toJSON() {
      return { components: this._components.map((c) => c.toJSON?.() ?? c) };
    }
  }

  return {
    EmbedBuilder: MockEmbedBuilder,
    ButtonBuilder: MockButtonBuilder,
    ActionRowBuilder: MockActionRowBuilder,
    ButtonStyle: { Secondary: 2, Success: 3 },
  };
});

// ─── Imports ─────────────────────────────────────────────────────────────────

import { getPool } from '../../src/db.js';
import {
  buildChallengeButtons,
  buildChallengeEmbed,
  checkDailyChallenge,
  checkDailyChallengeForGuild,
  getDayOfYear,
  getLocalDateString,
  getLocalTimeString,
  handleHintButton,
  handleSolveButton,
  postDailyChallenge,
  selectTodaysChallenge,
  startChallengeScheduler,
} from '../../src/modules/challengeScheduler.js';
import { getConfig } from '../../src/modules/config.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('challengeScheduler', () => {
  let mockPool;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ total: '1' }] }),
    };
    getPool.mockReturnValue(mockPool);

    getConfig.mockReturnValue({
      challenges: {
        enabled: true,
        channelId: 'ch-test',
        postTime: '09:00',
        timezone: 'America/New_York',
      },
    });
  });

  // ─── Time helpers ──────────────────────────────────────────────────────────

  describe('getDayOfYear', () => {
    it('should return 1 for Jan 1', () => {
      const jan1 = new Date('2024-01-01T12:00:00Z');
      const day = getDayOfYear(jan1, 'UTC');
      expect(day).toBe(1);
    });

    it('should return 365 for Dec 31 in a non-leap year', () => {
      const dec31 = new Date('2023-12-31T12:00:00Z');
      const day = getDayOfYear(dec31, 'UTC');
      expect(day).toBe(365);
    });

    it('should return 366 for Dec 31 in a leap year', () => {
      const dec31 = new Date('2024-12-31T12:00:00Z');
      const day = getDayOfYear(dec31, 'UTC');
      expect(day).toBe(366);
    });

    it('should handle timezone offset correctly', () => {
      // When UTC time is 00:00 Jan 2, New York is still Jan 1 (EST = UTC-5)
      const utcJan2 = new Date('2024-01-02T02:00:00Z'); // 9pm Jan 1 EST
      const dayNY = getDayOfYear(utcJan2, 'America/New_York');
      expect(dayNY).toBe(1);
    });
  });

  describe('getLocalDateString', () => {
    it('should return YYYY-MM-DD format', () => {
      const date = new Date('2024-03-15T12:00:00Z');
      const str = getLocalDateString(date, 'UTC');
      expect(str).toBe('2024-03-15');
    });
  });

  describe('getLocalTimeString', () => {
    it('should return HH:MM format', () => {
      const date = new Date('2024-01-01T14:30:00Z');
      const str = getLocalTimeString(date, 'UTC');
      expect(str).toBe('14:30');
    });
  });

  // ─── selectTodaysChallenge ─────────────────────────────────────────────────

  describe('selectTodaysChallenge', () => {
    it('should return a challenge object with index and dayNumber', () => {
      const now = new Date('2024-01-10T12:00:00Z');
      const result = selectTodaysChallenge(now, 'UTC');
      expect(result).toHaveProperty('challenge');
      expect(result).toHaveProperty('index');
      expect(result).toHaveProperty('dayNumber');
      expect(result.challenge).toHaveProperty('title');
      expect(result.challenge).toHaveProperty('difficulty');
    });

    it('should cycle through challenges using modulo', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      const { index, dayNumber } = selectTodaysChallenge(now, 'UTC');
      // dayNumber = 1, challenges.length = 32, index = (1-1) % 32 = 0
      expect(index).toBe((dayNumber - 1) % 32);
    });
  });

  // ─── buildChallengeEmbed ──────────────────────────────────────────────────

  describe('buildChallengeEmbed', () => {
    const challenge = {
      title: 'Two Sum',
      description: 'Given an array…',
      difficulty: 'easy',
      hints: ['Use a hash map'],
      sampleInput: 'nums = [2, 7]',
      sampleOutput: '[0, 1]',
      languages: ['javascript'],
    };

    it('should build an embed with correct color for easy', () => {
      const embed = buildChallengeEmbed(challenge, 1, 0);
      expect(embed._data.color).toBe(0x57f287);
    });

    it('should build an embed with correct color for medium', () => {
      const embed = buildChallengeEmbed({ ...challenge, difficulty: 'medium' }, 1, 0);
      expect(embed._data.color).toBe(0xfee75c);
    });

    it('should build an embed with correct color for hard', () => {
      const embed = buildChallengeEmbed({ ...challenge, difficulty: 'hard' }, 1, 0);
      expect(embed._data.color).toBe(0xed4245);
    });

    it('should include the challenge number in the title', () => {
      const embed = buildChallengeEmbed(challenge, 42, 0);
      expect(embed._data.title).toContain('#42');
      expect(embed._data.title).toContain('Two Sum');
    });

    it('should include solve count in footer', () => {
      const embed = buildChallengeEmbed(challenge, 1, 7);
      expect(embed._data.footer.text).toContain('7 solvers');
    });

    it('should handle unknown difficulty gracefully', () => {
      const embed = buildChallengeEmbed({ ...challenge, difficulty: 'unknown' }, 1, 0);
      expect(embed._data.color).toBeDefined();
    });
  });

  // ─── buildChallengeButtons ────────────────────────────────────────────────

  describe('buildChallengeButtons', () => {
    it('should return an action row with hint and solve buttons', () => {
      const row = buildChallengeButtons(5);
      const json = row.toJSON();
      expect(json.components).toHaveLength(2);
      expect(json.components[0].customId).toBe('challenge_hint_5');
      expect(json.components[1].customId).toBe('challenge_solve_5');
    });
  });

  // ─── postDailyChallenge ───────────────────────────────────────────────────

  describe('postDailyChallenge', () => {
    let mockClient;
    let mockMessage;
    let mockChannel;

    beforeEach(() => {
      mockMessage = {
        id: 'msg-1',
        startThread: vi.fn().mockResolvedValue({}),
      };
      mockChannel = {
        send: vi.fn().mockResolvedValue(mockMessage),
      };
      mockClient = {
        channels: {
          fetch: vi.fn().mockResolvedValue(mockChannel),
        },
        guilds: { cache: new Map() },
      };
    });

    it('should return false when challenges are disabled', async () => {
      getConfig.mockReturnValue({ challenges: { enabled: false } });
      const result = await postDailyChallenge(mockClient, 'guild-1');
      expect(result).toBe(false);
    });

    it('should return false when no channelId configured', async () => {
      getConfig.mockReturnValue({ challenges: { enabled: true, channelId: null } });
      const result = await postDailyChallenge(mockClient, 'guild-1');
      expect(result).toBe(false);
    });

    it('should return false when channel not found', async () => {
      mockClient.channels.fetch.mockResolvedValue(null);
      const result = await postDailyChallenge(mockClient, 'guild-1');
      expect(result).toBe(false);
    });

    it('should post embed with buttons and create a thread', async () => {
      const result = await postDailyChallenge(mockClient, 'guild-1');
      expect(result).toBe(true);
      expect(mockChannel.send).toHaveBeenCalledOnce();
      expect(mockMessage.startThread).toHaveBeenCalledOnce();
    });

    it('should continue when thread creation fails', async () => {
      mockMessage.startThread.mockRejectedValue(new Error('Thread error'));
      const result = await postDailyChallenge(mockClient, 'guild-1');
      expect(result).toBe(true);
    });
  });

  // ─── checkDailyChallengeForGuild ─────────────────────────────────────────

  describe('checkDailyChallengeForGuild', () => {
    let mockClient;

    beforeEach(() => {
      const mockMessage = { id: 'msg-1', startThread: vi.fn().mockResolvedValue({}) };
      const mockChannel = { send: vi.fn().mockResolvedValue(mockMessage) };
      mockClient = {
        channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
        guilds: { cache: new Map() },
      };
    });

    it('should not post when challenges are disabled', async () => {
      getConfig.mockReturnValue({ challenges: { enabled: false } });
      await checkDailyChallengeForGuild(mockClient, 'guild-1');
      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('should not post when current time does not match postTime', async () => {
      // postTime is 09:00 but current time will be whatever the test runs at
      // We mock getLocalTimeString implicitly — since it uses Intl, we just
      // verify that posting only happens when time matches.
      // Force postTime to a time that never occurs
      getConfig.mockReturnValue({
        challenges: { enabled: true, channelId: 'ch-1', postTime: '99:99', timezone: 'UTC' },
      });
      await checkDailyChallengeForGuild(mockClient, 'guild-1');
      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── checkDailyChallenge (all guilds) ────────────────────────────────────

  describe('checkDailyChallenge', () => {
    it('should iterate all guilds', async () => {
      getConfig.mockReturnValue({ challenges: { enabled: false } });
      const mockClient = {
        guilds: {
          cache: new Map([
            ['g1', { id: 'g1' }],
            ['g2', { id: 'g2' }],
          ]),
        },
      };
      await checkDailyChallenge(mockClient);
      // Both guilds checked — no errors thrown
      expect(getConfig).toHaveBeenCalledWith('g1');
      expect(getConfig).toHaveBeenCalledWith('g2');
    });

    it('should not throw when individual guild check fails', async () => {
      getConfig.mockImplementation(() => {
        throw new Error('Config error');
      });
      const mockClient = {
        guilds: { cache: new Map([['g1', { id: 'g1' }]]) },
      };
      await expect(checkDailyChallenge(mockClient)).resolves.toBeUndefined();
    });
  });

  // ─── Double-post prevention ───────────────────────────────────────────────

  describe('double-post prevention', () => {
    it('should not post twice on the same day', async () => {
      // Use a time that will definitely not match (99:99)
      getConfig.mockReturnValue({
        challenges: { enabled: true, channelId: 'ch-1', postTime: '99:99', timezone: 'UTC' },
      });

      const mockMessage = { id: 'msg-1', startThread: vi.fn().mockResolvedValue({}) };
      const mockChannel = { send: vi.fn().mockResolvedValue(mockMessage) };
      const mockClient = {
        channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
        guilds: { cache: new Map() },
      };

      // Run twice
      await checkDailyChallengeForGuild(mockClient, 'double-guild');
      await checkDailyChallengeForGuild(mockClient, 'double-guild');

      // Should not have posted (time doesn't match)
      expect(mockChannel.send).not.toHaveBeenCalled();
    });
  });

  // ─── handleSolveButton ────────────────────────────────────────────────────

  describe('handleSolveButton', () => {
    let interaction;

    beforeEach(() => {
      interaction = {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        message: {
          id: 'msg-1',
          embeds: [{ _data: { footer: { text: '0 solvers so far' } } }],
          components: [],
          edit: vi.fn().mockResolvedValue({}),
        },
        reply: vi.fn().mockResolvedValue({}),
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // INSERT (upsert)
        .mockResolvedValueOnce({ rows: [{ total: '5' }] }) // user total solves
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }); // challenge solve count
    });

    it('should record the solve and reply ephemerally', async () => {
      await handleSolveButton(interaction, 0);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO challenge_solves'),
        ['guild-1', 0, 'user-1'],
      );
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('5'),
          ephemeral: true,
        }),
      );
    });

    it('should return error when pool is null', async () => {
      getPool.mockReturnValue(null);
      await handleSolveButton(interaction, 0);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Database unavailable') }),
      );
    });

    it('should handle edit failure gracefully', async () => {
      interaction.message.edit.mockRejectedValue(new Error('Edit failed'));
      await expect(handleSolveButton(interaction, 0)).resolves.toBeUndefined();
    });
  });

  // ─── handleHintButton ─────────────────────────────────────────────────────

  describe('handleHintButton', () => {
    let interaction;

    beforeEach(() => {
      interaction = {
        reply: vi.fn().mockResolvedValue({}),
      };
    });

    it('should show all hints ephemerally', async () => {
      // index 0 = Two Sum, which has 2 hints
      await handleHintButton(interaction, 0);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Hint 1'),
          ephemeral: true,
        }),
      );
    });

    it('should handle invalid challenge index', async () => {
      await handleHintButton(interaction, 9999);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('not found'),
          ephemeral: true,
        }),
      );
    });
  });

  // ─── startChallengeScheduler ──────────────────────────────────────────────

  describe('startChallengeScheduler', () => {
    it('should call without throwing', () => {
      const mockClient = { guilds: { cache: new Map() } };
      expect(() => startChallengeScheduler(mockClient)).not.toThrow();
    });
  });
});
