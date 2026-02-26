import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../src/db.js';
import {
  buildStarboardEmbed,
  deleteStarboardPost,
  findStarboardPost,
  getStarCount,
  handleReactionAdd,
  handleReactionRemove,
  insertStarboardPost,
  resolveStarboardConfig,
  STARBOARD_DEFAULTS,
  updateStarboardPostCount,
} from '../../src/modules/starboard.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockPool(queryResult = { rows: [] }) {
  const pool = { query: vi.fn().mockResolvedValue(queryResult) };
  getPool.mockReturnValue(pool);
  return pool;
}

function makeMockMessage(overrides = {}) {
  return {
    id: 'msg-1',
    content: 'Hello world!',
    author: {
      id: 'author-1',
      username: 'testuser',
      displayName: 'Test User',
      displayAvatarURL: () => 'https://cdn.example.com/avatar.png',
    },
    channel: { id: 'ch-1' },
    guild: { id: 'guild-1' },
    createdAt: new Date('2025-01-01'),
    attachments: new Map(),
    embeds: [],
    reactions: {
      cache: new Map(),
    },
    partial: false,
    fetch: vi.fn(),
    ...overrides,
  };
}

function makeStarboardConfig(overrides = {}) {
  return {
    starboard: {
      enabled: true,
      channelId: 'starboard-ch',
      threshold: 3,
      emoji: '⭐',
      selfStarAllowed: false,
      ignoredChannels: [],
      ...overrides,
    },
  };
}

function makeMockReaction(message, emojiName = '⭐', count = 3) {
  const users = new Map();
  return {
    emoji: { name: emojiName },
    count,
    message,
    partial: false,
    fetch: vi.fn(),
    users: {
      fetch: vi.fn().mockResolvedValue(users),
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('starboard module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── resolveStarboardConfig ──────────────────────────────────────────

  describe('resolveStarboardConfig', () => {
    it('should return defaults when no starboard config exists', () => {
      const result = resolveStarboardConfig({});
      expect(result).toEqual(STARBOARD_DEFAULTS);
    });

    it('should merge provided config with defaults', () => {
      const result = resolveStarboardConfig({
        starboard: { enabled: true, threshold: 5 },
      });
      expect(result.enabled).toBe(true);
      expect(result.threshold).toBe(5);
      expect(result.emoji).toBe('⭐');
    });
  });

  // ── buildStarboardEmbed ─────────────────────────────────────────────

  describe('buildStarboardEmbed', () => {
    it('should build a gold embed with message content', () => {
      const message = makeMockMessage();
      const embed = buildStarboardEmbed(message, 5);
      const json = embed.toJSON();

      expect(json.color).toBe(0xffd700);
      expect(json.author.name).toBe('Test User');
      expect(json.description).toBe('Hello world!');
      expect(json.fields).toHaveLength(3);
      expect(json.fields[0].value).toBe('<#ch-1>');
      expect(json.fields[1].value).toBe('⭐ 5');
      expect(json.fields[2].value).toContain('discord.com/channels/guild-1/ch-1/msg-1');
    });

    it('should handle message with no content', () => {
      const message = makeMockMessage({ content: '' });
      const embed = buildStarboardEmbed(message, 3);
      const json = embed.toJSON();

      expect(json.description).toBeUndefined();
    });

    it('should include image from attachment', () => {
      const attachments = new Map();
      attachments.set('att-1', {
        contentType: 'image/png',
        url: 'https://cdn.example.com/img.png',
      });
      // Make attachments iterable with .find()
      attachments.find = (fn) => {
        for (const v of attachments.values()) {
          if (fn(v)) return v;
        }
        return undefined;
      };
      const message = makeMockMessage({ attachments });
      const embed = buildStarboardEmbed(message, 3);
      const json = embed.toJSON();

      expect(json.image.url).toBe('https://cdn.example.com/img.png');
    });

    it('should include image from embed when no attachment', () => {
      const embeds = [{ image: { url: 'https://cdn.example.com/embed-img.png' } }];
      embeds.find = Array.prototype.find.bind(embeds);
      const attachments = new Map();
      attachments.find = () => undefined;
      const message = makeMockMessage({ attachments, embeds });
      const embed = buildStarboardEmbed(message, 3);
      const json = embed.toJSON();

      expect(json.image.url).toBe('https://cdn.example.com/embed-img.png');
    });

    it('should handle missing author info gracefully', () => {
      const message = makeMockMessage({
        author: {
          id: 'a1',
          username: undefined,
          displayName: undefined,
          displayAvatarURL: undefined,
        },
      });
      const embed = buildStarboardEmbed(message, 2);
      const json = embed.toJSON();
      expect(json.author.name).toBe('Unknown');
    });
  });

  // ── Database functions ──────────────────────────────────────────────

  describe('findStarboardPost', () => {
    it('should return the row when found', async () => {
      const row = { source_message_id: 'msg-1', starboard_message_id: 'sb-1', star_count: 5 };
      mockPool({ rows: [row] });
      const result = await findStarboardPost('msg-1');
      expect(result).toEqual(row);
    });

    it('should return null when not found', async () => {
      mockPool({ rows: [] });
      const result = await findStarboardPost('nonexistent');
      expect(result).toBeNull();
    });

    it('should return null on DB error', async () => {
      getPool.mockReturnValue({
        query: vi.fn().mockRejectedValue(new Error('db error')),
      });
      const result = await findStarboardPost('msg-1');
      expect(result).toBeNull();
    });
  });

  describe('insertStarboardPost', () => {
    it('should call INSERT with correct params', async () => {
      const pool = mockPool();
      await insertStarboardPost({
        guildId: 'g1',
        sourceMessageId: 'msg-1',
        sourceChannelId: 'ch-1',
        starboardMessageId: 'sb-1',
        starCount: 3,
      });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO starboard_posts'),
        ['g1', 'msg-1', 'ch-1', 'sb-1', 3],
      );
    });
  });

  describe('updateStarboardPostCount', () => {
    it('should call UPDATE with correct params', async () => {
      const pool = mockPool();
      await updateStarboardPostCount('msg-1', 7);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE starboard_posts'), [
        7,
        'msg-1',
      ]);
    });
  });

  describe('deleteStarboardPost', () => {
    it('should call DELETE with correct params', async () => {
      const pool = mockPool();
      await deleteStarboardPost('msg-1');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM starboard_posts'),
        ['msg-1'],
      );
    });
  });

  // ── getStarCount ────────────────────────────────────────────────────

  describe('getStarCount', () => {
    it('should return 0 when no matching reaction', async () => {
      const message = makeMockMessage();
      const count = await getStarCount(message, '⭐', false);
      expect(count).toBe(0);
    });

    it('should return reaction count when selfStarAllowed', async () => {
      const reactions = new Map();
      reactions.set('⭐', {
        emoji: { name: '⭐' },
        count: 5,
        users: { fetch: vi.fn().mockResolvedValue(new Map()) },
      });
      reactions.find = (fn) => {
        for (const v of reactions.values()) {
          if (fn(v)) return v;
        }
        return undefined;
      };
      const message = makeMockMessage({
        reactions: { cache: reactions },
      });

      const count = await getStarCount(message, '⭐', true);
      expect(count).toBe(5);
    });

    it('should subtract self-star when not allowed', async () => {
      const users = new Map();
      users.set('author-1', { id: 'author-1' });

      const reactions = new Map();
      reactions.set('⭐', {
        emoji: { name: '⭐' },
        count: 4,
        users: { fetch: vi.fn().mockResolvedValue(users) },
      });
      reactions.find = (fn) => {
        for (const v of reactions.values()) {
          if (fn(v)) return v;
        }
        return undefined;
      };
      const message = makeMockMessage({
        reactions: { cache: reactions },
      });

      const count = await getStarCount(message, '⭐', false);
      expect(count).toBe(3);
    });

    it('should not go below 0', async () => {
      const users = new Map();
      users.set('author-1', { id: 'author-1' });

      const reactions = new Map();
      reactions.set('⭐', {
        emoji: { name: '⭐' },
        count: 1,
        users: { fetch: vi.fn().mockResolvedValue(users) },
      });
      reactions.find = (fn) => {
        for (const v of reactions.values()) {
          if (fn(v)) return v;
        }
        return undefined;
      };
      const message = makeMockMessage({
        reactions: { cache: reactions },
      });

      const count = await getStarCount(message, '⭐', false);
      expect(count).toBe(0);
    });
  });

  // ── handleReactionAdd ───────────────────────────────────────────────

  describe('handleReactionAdd', () => {
    it('should do nothing when starboard is disabled', async () => {
      const pool = mockPool();
      const message = makeMockMessage();
      const reaction = makeMockReaction(message);
      const client = { channels: { fetch: vi.fn() } };

      await handleReactionAdd(reaction, { id: 'user-1', bot: false }, client, {});
      expect(client.channels.fetch).not.toHaveBeenCalled();
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('should ignore non-star emoji', async () => {
      const message = makeMockMessage();
      const reaction = makeMockReaction(message, '🎉', 5);
      const client = { channels: { fetch: vi.fn() } };

      await handleReactionAdd(
        reaction,
        { id: 'user-1', bot: false },
        client,
        makeStarboardConfig(),
      );
      expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    it('should ignore messages in ignored channels', async () => {
      const message = makeMockMessage({ channel: { id: 'ignored-ch' } });
      const reaction = makeMockReaction(message);
      const client = { channels: { fetch: vi.fn() } };

      await handleReactionAdd(
        reaction,
        { id: 'user-1', bot: false },
        client,
        makeStarboardConfig({ ignoredChannels: ['ignored-ch'] }),
      );
      expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    it('should ignore self-star when not allowed', async () => {
      const message = makeMockMessage();
      const reaction = makeMockReaction(message);
      const client = { channels: { fetch: vi.fn() } };

      await handleReactionAdd(
        reaction,
        { id: 'author-1', bot: false },
        client,
        makeStarboardConfig({ selfStarAllowed: false }),
      );
      expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    it('should not post when below threshold', async () => {
      // Set up reaction with count below threshold
      const reactions = new Map();
      reactions.set('⭐', {
        emoji: { name: '⭐' },
        count: 2,
        users: { fetch: vi.fn().mockResolvedValue(new Map()) },
      });
      reactions.find = (fn) => {
        for (const v of reactions.values()) {
          if (fn(v)) return v;
        }
        return undefined;
      };
      const message = makeMockMessage({ reactions: { cache: reactions } });
      const reaction = { emoji: { name: '⭐' }, count: 2, message, partial: false };
      const client = { channels: { fetch: vi.fn() } };

      await handleReactionAdd(
        reaction,
        { id: 'user-1', bot: false },
        client,
        makeStarboardConfig({ threshold: 3 }),
      );
      expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    it('should create new starboard post when threshold reached', async () => {
      const pool = mockPool({ rows: [] });
      const reactions = new Map();
      reactions.set('⭐', {
        emoji: { name: '⭐' },
        count: 3,
        users: { fetch: vi.fn().mockResolvedValue(new Map()) },
      });
      reactions.find = (fn) => {
        for (const v of reactions.values()) {
          if (fn(v)) return v;
        }
        return undefined;
      };
      const message = makeMockMessage({ reactions: { cache: reactions } });
      const reaction = { emoji: { name: '⭐' }, count: 3, message, partial: false };

      const mockSend = vi.fn().mockResolvedValue({ id: 'sb-msg-1' });
      const client = {
        channels: {
          fetch: vi.fn().mockResolvedValue({ send: mockSend, messages: { fetch: vi.fn() } }),
        },
      };

      await handleReactionAdd(
        reaction,
        { id: 'user-1', bot: false },
        client,
        makeStarboardConfig(),
      );

      expect(client.channels.fetch).toHaveBeenCalledWith('starboard-ch');
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('3'),
          embeds: expect.any(Array),
        }),
      );
      // Should have called SELECT (findStarboardPost) + INSERT (insertStarboardPost)
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('should update existing starboard post when already posted', async () => {
      const existingRow = {
        source_message_id: 'msg-1',
        starboard_message_id: 'sb-msg-1',
        star_count: 3,
      };
      const pool = mockPool({ rows: [existingRow] });

      const reactions = new Map();
      reactions.set('⭐', {
        emoji: { name: '⭐' },
        count: 5,
        users: { fetch: vi.fn().mockResolvedValue(new Map()) },
      });
      reactions.find = (fn) => {
        for (const v of reactions.values()) {
          if (fn(v)) return v;
        }
        return undefined;
      };
      const message = makeMockMessage({ reactions: { cache: reactions } });
      const reaction = { emoji: { name: '⭐' }, count: 5, message, partial: false };

      const mockEdit = vi.fn().mockResolvedValue({});
      const mockFetchMessage = vi.fn().mockResolvedValue({ edit: mockEdit });
      const client = {
        channels: {
          fetch: vi.fn().mockResolvedValue({
            messages: { fetch: mockFetchMessage },
            send: vi.fn(),
          }),
        },
      };

      await handleReactionAdd(
        reaction,
        { id: 'user-1', bot: false },
        client,
        makeStarboardConfig(),
      );

      expect(mockFetchMessage).toHaveBeenCalledWith('sb-msg-1');
      expect(mockEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('5'),
        }),
      );
      // SELECT + UPDATE
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('should handle partial reactions', async () => {
      mockPool({ rows: [] });
      const reactions = new Map();
      reactions.set('⭐', {
        emoji: { name: '⭐' },
        count: 3,
        users: { fetch: vi.fn().mockResolvedValue(new Map()) },
      });
      reactions.find = (fn) => {
        for (const v of reactions.values()) {
          if (fn(v)) return v;
        }
        return undefined;
      };
      const message = makeMockMessage({ reactions: { cache: reactions } });

      const fetchedReaction = {
        emoji: { name: '⭐' },
        count: 3,
        message,
        partial: false,
      };
      const reaction = {
        emoji: { name: '⭐' },
        count: 3,
        message,
        partial: true,
        fetch: vi.fn().mockResolvedValue(fetchedReaction),
      };

      const mockSend = vi.fn().mockResolvedValue({ id: 'sb-msg-1' });
      const client = {
        channels: {
          fetch: vi.fn().mockResolvedValue({ send: mockSend, messages: { fetch: vi.fn() } }),
        },
      };

      await handleReactionAdd(
        reaction,
        { id: 'user-1', bot: false },
        client,
        makeStarboardConfig(),
      );

      expect(reaction.fetch).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalled();
    });
  });

  // ── handleReactionRemove ────────────────────────────────────────────

  describe('handleReactionRemove', () => {
    it('should do nothing when starboard is disabled', async () => {
      const message = makeMockMessage();
      const reaction = makeMockReaction(message);
      const client = { channels: { fetch: vi.fn() } };

      await handleReactionRemove(reaction, { id: 'user-1', bot: false }, client, {});
      expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    it('should do nothing when no existing starboard post', async () => {
      mockPool({ rows: [] });
      const message = makeMockMessage();
      const reaction = { emoji: { name: '⭐' }, message, partial: false };
      const client = { channels: { fetch: vi.fn() } };

      await handleReactionRemove(
        reaction,
        { id: 'user-1', bot: false },
        client,
        makeStarboardConfig(),
      );
      expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    it('should delete starboard post when below threshold', async () => {
      const existingRow = {
        source_message_id: 'msg-1',
        starboard_message_id: 'sb-msg-1',
        star_count: 3,
      };
      const pool = mockPool({ rows: [existingRow] });

      // After removal, count is 2 (below threshold of 3)
      const reactions = new Map();
      reactions.set('⭐', {
        emoji: { name: '⭐' },
        count: 2,
        users: { fetch: vi.fn().mockResolvedValue(new Map()) },
      });
      reactions.find = (fn) => {
        for (const v of reactions.values()) {
          if (fn(v)) return v;
        }
        return undefined;
      };
      const message = makeMockMessage({ reactions: { cache: reactions } });
      const reaction = { emoji: { name: '⭐' }, message, partial: false };

      const mockDelete = vi.fn().mockResolvedValue({});
      const mockFetchMessage = vi.fn().mockResolvedValue({ delete: mockDelete });
      const client = {
        channels: {
          fetch: vi.fn().mockResolvedValue({ messages: { fetch: mockFetchMessage } }),
        },
      };

      await handleReactionRemove(
        reaction,
        { id: 'user-1', bot: false },
        client,
        makeStarboardConfig(),
      );

      expect(mockDelete).toHaveBeenCalled();
      // SELECT + DELETE
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(pool.query).toHaveBeenLastCalledWith(
        expect.stringContaining('DELETE FROM starboard_posts'),
        ['msg-1'],
      );
    });

    it('should update count when still above threshold', async () => {
      const existingRow = {
        source_message_id: 'msg-1',
        starboard_message_id: 'sb-msg-1',
        star_count: 5,
      };
      const pool = mockPool({ rows: [existingRow] });

      const reactions = new Map();
      reactions.set('⭐', {
        emoji: { name: '⭐' },
        count: 4,
        users: { fetch: vi.fn().mockResolvedValue(new Map()) },
      });
      reactions.find = (fn) => {
        for (const v of reactions.values()) {
          if (fn(v)) return v;
        }
        return undefined;
      };
      const message = makeMockMessage({ reactions: { cache: reactions } });
      const reaction = { emoji: { name: '⭐' }, message, partial: false };

      const mockEdit = vi.fn().mockResolvedValue({});
      const mockFetchMessage = vi.fn().mockResolvedValue({ edit: mockEdit });
      const client = {
        channels: {
          fetch: vi.fn().mockResolvedValue({ messages: { fetch: mockFetchMessage } }),
        },
      };

      await handleReactionRemove(
        reaction,
        { id: 'user-1', bot: false },
        client,
        makeStarboardConfig(),
      );

      expect(mockEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('4'),
        }),
      );
      // SELECT + UPDATE
      expect(pool.query).toHaveBeenCalledTimes(2);
    });
  });
});
