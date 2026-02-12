import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
}));

// Mock config module
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    moderation: {
      logging: {
        channels: {
          default: '111',
          purges: '222',
        },
      },
    },
  }),
}));

// Mock moderation module
vi.mock('../../src/modules/moderation.js', () => ({
  createCase: vi.fn().mockResolvedValue({ case_number: 42, id: 42, action: 'purge' }),
  sendModLogEmbed: vi.fn().mockResolvedValue(null),
}));

import { adminOnly, data, execute } from '../../src/commands/purge.js';
import { createCase, sendModLogEmbed } from '../../src/modules/moderation.js';

/**
 * Helper to create a mock message with the given properties.
 * @param {Object} opts
 * @returns {[string, Object]}
 */
function mockMessage(opts = {}) {
  const id = opts.id || String(Math.random());
  return [
    id,
    {
      id,
      content: opts.content || '',
      author: { id: opts.authorId || '100', bot: opts.bot || false },
      createdTimestamp: opts.createdTimestamp || Date.now(),
      attachments: { size: opts.attachmentCount || 0 },
    },
  ];
}

/**
 * Create a Map that behaves like Discord's Collection with a filter method.
 * @param {Array} entries
 * @returns {Map}
 */
function mockCollection(entries) {
  const map = new Map(entries);
  map.filter = function (fn) {
    const filtered = new Map();
    for (const [k, v] of this) {
      if (fn(v, k, this)) filtered.set(k, v);
    }
    filtered.filter = map.filter.bind(filtered);
    return filtered;
  };
  return map;
}

describe('purge command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with correct name', () => {
    expect(data.name).toBe('purge');
  });

  it('should export adminOnly flag', () => {
    expect(adminOnly).toBe(true);
  });

  it('should have all 6 subcommands', () => {
    const subcommands = data.options.map((opt) => opt.name);
    expect(subcommands).toContain('all');
    expect(subcommands).toContain('user');
    expect(subcommands).toContain('bot');
    expect(subcommands).toContain('contains');
    expect(subcommands).toContain('links');
    expect(subcommands).toContain('attachments');
    expect(subcommands).toHaveLength(6);
  });

  describe('execute', () => {
    /**
     * Build a mock interaction for purge tests.
     */
    function buildInteraction(subcommand, opts = {}) {
      const deletedCollection = mockCollection([]);
      const fetchedMessages =
        opts.messages ||
        mockCollection([mockMessage({ content: 'hello' }), mockMessage({ content: 'world' })]);

      return {
        interaction: {
          options: {
            getSubcommand: vi.fn().mockReturnValue(subcommand),
            getInteger: vi.fn().mockReturnValue(opts.count || 10),
            getUser: vi.fn().mockReturnValue(opts.user || { id: '100', tag: 'User#0001' }),
            getString: vi.fn().mockReturnValue(opts.text || 'test'),
          },
          deferReply: vi.fn().mockResolvedValue(undefined),
          editReply: vi.fn().mockResolvedValue(undefined),
          channel: {
            id: '999',
            name: 'general',
            messages: { fetch: vi.fn().mockResolvedValue(fetchedMessages) },
            bulkDelete: vi.fn().mockResolvedValue(opts.deletedResult || deletedCollection),
          },
          guild: { id: '123' },
          user: { id: '456', tag: 'Mod#0001' },
          client: {
            channels: { fetch: vi.fn() },
          },
        },
      };
    }

    it('should delete all messages with "all" subcommand', async () => {
      const messages = mockCollection([
        mockMessage({ content: 'msg1' }),
        mockMessage({ content: 'msg2' }),
      ]);
      const deleted = mockCollection([...messages]);
      const { interaction } = buildInteraction('all', { messages, deletedResult: deleted });

      await execute(interaction);

      expect(interaction.channel.bulkDelete).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('2'));
    });

    it('should filter by user with "user" subcommand', async () => {
      const messages = mockCollection([
        mockMessage({ authorId: '100', content: 'from target' }),
        mockMessage({ authorId: '200', content: 'from other' }),
      ]);
      const { interaction } = buildInteraction('user', {
        messages,
        user: { id: '100', tag: 'Target#0001' },
      });

      await execute(interaction);

      const bulkDeleteCall = interaction.channel.bulkDelete.mock.calls[0][0];
      expect(bulkDeleteCall.size).toBe(1);
      for (const [, msg] of bulkDeleteCall) {
        expect(msg.author.id).toBe('100');
      }
    });

    it('should filter bot messages with "bot" subcommand', async () => {
      const messages = mockCollection([
        mockMessage({ bot: true, content: 'bot message' }),
        mockMessage({ bot: false, content: 'human message' }),
      ]);
      const { interaction } = buildInteraction('bot', { messages });

      await execute(interaction);

      const bulkDeleteCall = interaction.channel.bulkDelete.mock.calls[0][0];
      expect(bulkDeleteCall.size).toBe(1);
    });

    it('should filter by text with "contains" subcommand', async () => {
      const messages = mockCollection([
        mockMessage({ content: 'this has TEST word' }),
        mockMessage({ content: 'no match here' }),
      ]);
      const { interaction } = buildInteraction('contains', { messages, text: 'test' });

      await execute(interaction);

      const bulkDeleteCall = interaction.channel.bulkDelete.mock.calls[0][0];
      expect(bulkDeleteCall.size).toBe(1);
    });

    it('should filter links with "links" subcommand', async () => {
      const messages = mockCollection([
        mockMessage({ content: 'check https://example.com' }),
        mockMessage({ content: 'no link here' }),
      ]);
      const { interaction } = buildInteraction('links', { messages });

      await execute(interaction);

      const bulkDeleteCall = interaction.channel.bulkDelete.mock.calls[0][0];
      expect(bulkDeleteCall.size).toBe(1);
    });

    it('should filter attachments with "attachments" subcommand', async () => {
      const messages = mockCollection([
        mockMessage({ attachmentCount: 2, content: 'has file' }),
        mockMessage({ attachmentCount: 0, content: 'no file' }),
      ]);
      const { interaction } = buildInteraction('attachments', { messages });

      await execute(interaction);

      const bulkDeleteCall = interaction.channel.bulkDelete.mock.calls[0][0];
      expect(bulkDeleteCall.size).toBe(1);
    });

    it('should filter out messages older than 14 days', async () => {
      const old = Date.now() - 15 * 86400 * 1000;
      const messages = mockCollection([
        mockMessage({ content: 'recent' }),
        mockMessage({ content: 'old', createdTimestamp: old }),
      ]);
      const { interaction } = buildInteraction('all', { messages });

      await execute(interaction);

      const bulkDeleteCall = interaction.channel.bulkDelete.mock.calls[0][0];
      expect(bulkDeleteCall.size).toBe(1);
    });

    it('should create a case and send shared mod log embed on success', async () => {
      const messages = mockCollection([mockMessage({ content: 'msg' })]);
      const deleted = mockCollection([...messages]);
      const { interaction } = buildInteraction('all', {
        messages,
        deletedResult: deleted,
      });

      await execute(interaction);

      expect(createCase).toHaveBeenCalledWith(
        '123',
        expect.objectContaining({
          action: 'purge',
          targetId: '999',
          targetTag: '#general',
        }),
      );
      expect(sendModLogEmbed).toHaveBeenCalled();
    });

    it('should handle bulkDelete error gracefully', async () => {
      const messages = mockCollection([mockMessage({ content: 'msg' })]);
      const { interaction } = buildInteraction('all', { messages });
      interaction.channel.bulkDelete.mockRejectedValue(new Error('API error'));

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete messages'),
      );
    });
  });
});
