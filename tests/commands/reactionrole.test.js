/**
 * Tests for src/commands/reactionrole.js
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn(async (channel, opts) => {
    if (typeof channel?.send === 'function') {
      return channel.send(opts);
    }
    return { id: 'mock-msg' };
  }),
  safeEditReply: vi.fn(async (interaction, payload) => {
    if (typeof interaction?.editReply === 'function') {
      return interaction.editReply(payload);
    }
    return payload;
  }),
}));

vi.mock('../../src/modules/reactionRoles.js', () => ({
  buildReactionRoleEmbed: vi.fn(() => ({ toJSON: () => ({}) })),
  insertReactionRoleMenu: vi.fn(),
  findMenuByMessageId: vi.fn(),
  listMenusForGuild: vi.fn(),
  deleteMenu: vi.fn(),
  getEntriesForMenu: vi.fn().mockResolvedValue([]),
  upsertReactionRoleEntry: vi.fn(),
  removeReactionRoleEntry: vi.fn(),
  resolveEmojiString: vi.fn((e) => e.name ?? e),
}));

import { execute } from '../../src/commands/reactionrole.js';
import { getPool } from '../../src/db.js';
import {
  deleteMenu,
  findMenuByMessageId,
  insertReactionRoleMenu,
  listMenusForGuild,
  removeReactionRoleEntry,
  upsertReactionRoleEntry,
} from '../../src/modules/reactionRoles.js';
import { safeEditReply } from '../../src/utils/safeSend.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePool() {
  const pool = {};
  getPool.mockReturnValue(pool);
  return pool;
}

function makeInteraction(subcommand, options = {}) {
  const strings = options.strings ?? {};
  const channel = options.channel ?? null;
  const role = options.role ?? null;

  const fakeChannel = {
    id: 'ch-1',
    isTextBased: () => true,
    send: vi.fn().mockResolvedValue({ id: 'msg-new' }),
  };

  const fakeGuild = {
    id: options.guildId ?? 'guild-1',
    ownerId: options.ownerId ?? 'owner-1',
    channels: {
      fetch: vi.fn().mockResolvedValue(fakeChannel),
    },
    members: {
      fetchMe: vi.fn().mockResolvedValue({
        roles: { highest: { position: 100 } },
      }),
      fetch: vi.fn().mockResolvedValue({
        id: options.userId ?? 'user-1',
        roles: { highest: { position: options.memberHighestRolePosition ?? 50 } },
      }),
    },
  };

  return {
    guildId: options.guildId ?? 'guild-1',
    user: { id: options.userId ?? 'user-1' },
    guild: fakeGuild,
    channel: fakeChannel,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: {
      getSubcommand: () => subcommand,
      getString: (key) => strings[key] ?? null,
      getChannel: (key) => (key === 'channel' ? channel : null),
      getRole: (key) => (key === 'role' ? role : null),
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('/reactionrole command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('database unavailable', () => {
    it('replies with error when pool is null', async () => {
      getPool.mockReturnValue(null);
      const interaction = makeInteraction('list');
      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Database') }),
      );
    });
  });

  describe('create', () => {
    it('posts a menu message and persists to DB', async () => {
      makePool();
      insertReactionRoleMenu.mockResolvedValue({ id: 1 });

      const interaction = makeInteraction('create', {
        strings: { title: 'Get a Role!' },
      });

      await execute(interaction);

      expect(interaction.guild.channels.fetch).not.toHaveBeenCalled(); // used current channel
      expect(insertReactionRoleMenu).toHaveBeenCalledWith(
        'guild-1',
        'ch-1',
        'msg-new',
        'Get a Role!',
        null,
      );
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('msg-new') }),
      );
    });

    it('rejects non-text target channel', async () => {
      makePool();
      const nonTextChannel = { id: 'vc-1', isTextBased: () => false };
      const interaction = makeInteraction('create', {
        strings: { title: 'Roles' },
        channel: nonTextChannel,
      });

      await execute(interaction);

      expect(insertReactionRoleMenu).not.toHaveBeenCalled();
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('text channel') }),
      );
    });
  });

  describe('add', () => {
    it('replies with error when menu not found', async () => {
      makePool();
      findMenuByMessageId.mockResolvedValue(null);

      const interaction = makeInteraction('add', {
        strings: { message_id: 'ghost-id', emoji: '⭐' },
        role: { id: 'r-1', name: 'Star', position: 5 },
      });

      await execute(interaction);

      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('No reaction-role menu') }),
      );
    });

    it('rejects when menu belongs to different guild', async () => {
      makePool();
      findMenuByMessageId.mockResolvedValue({ id: 1, guild_id: 'other-guild', channel_id: 'ch-1' });

      const interaction = makeInteraction('add', {
        strings: { message_id: 'msg-1', emoji: '⭐' },
        role: { id: 'r-1', name: 'Star', position: 5 },
        guildId: 'my-guild',
      });

      await execute(interaction);

      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('does not belong') }),
      );
    });

    it('upserts entry and replies success', async () => {
      makePool();
      const menu = {
        id: 7,
        guild_id: 'guild-1',
        channel_id: 'ch-1',
        message_id: 'msg-1',
        title: 'T',
        description: null,
      };
      findMenuByMessageId.mockResolvedValue(menu);
      upsertReactionRoleEntry.mockResolvedValue({ id: 1 });

      const role = { id: 'r-star', name: 'Star', position: 5 };
      const interaction = makeInteraction('add', {
        strings: { message_id: 'msg-1', emoji: '⭐' },
        role,
      });

      await execute(interaction);

      expect(upsertReactionRoleEntry).toHaveBeenCalledWith(7, '⭐', 'r-star');
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Added') }),
      );
    });

    it('rejects when invoker cannot manage target role', async () => {
      makePool();
      const menu = {
        id: 7,
        guild_id: 'guild-1',
        channel_id: 'ch-1',
        message_id: 'msg-1',
        title: 'T',
        description: null,
      };
      findMenuByMessageId.mockResolvedValue(menu);

      const role = { id: 'r-admin', name: 'Admin', position: 80 };
      const interaction = makeInteraction('add', {
        strings: { message_id: 'msg-1', emoji: '⭐' },
        role,
        memberHighestRolePosition: 50,
      });

      await execute(interaction);

      expect(upsertReactionRoleEntry).not.toHaveBeenCalled();
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining("can't configure") }),
      );
    });

    it('allows guild owner to configure higher roles', async () => {
      makePool();
      const menu = {
        id: 7,
        guild_id: 'guild-1',
        channel_id: 'ch-1',
        message_id: 'msg-1',
        title: 'T',
        description: null,
      };
      findMenuByMessageId.mockResolvedValue(menu);
      upsertReactionRoleEntry.mockResolvedValue({ id: 1 });

      const role = { id: 'r-admin', name: 'Admin', position: 80 };
      const interaction = makeInteraction('add', {
        strings: { message_id: 'msg-1', emoji: '⭐' },
        role,
        userId: 'owner-1',
        ownerId: 'owner-1',
        memberHighestRolePosition: 10,
      });

      await execute(interaction);

      expect(upsertReactionRoleEntry).toHaveBeenCalledWith(7, '⭐', 'r-admin');
    });
  });

  describe('remove', () => {
    it('replies with error when menu not found', async () => {
      makePool();
      findMenuByMessageId.mockResolvedValue(null);
      const interaction = makeInteraction('remove', {
        strings: { message_id: 'ghost', emoji: '⭐' },
      });
      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('No reaction-role menu') }),
      );
    });

    it('replies with error when emoji mapping not found', async () => {
      makePool();
      findMenuByMessageId.mockResolvedValue({
        id: 1,
        guild_id: 'guild-1',
        channel_id: 'ch-1',
        message_id: 'msg-1',
      });
      removeReactionRoleEntry.mockResolvedValue(false);

      const interaction = makeInteraction('remove', {
        strings: { message_id: 'msg-1', emoji: '🦄' },
      });
      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('No mapping found') }),
      );
    });

    it('removes entry and replies success', async () => {
      makePool();
      findMenuByMessageId.mockResolvedValue({
        id: 1,
        guild_id: 'guild-1',
        channel_id: 'ch-1',
        message_id: 'msg-1',
        title: 'T',
        description: null,
      });
      removeReactionRoleEntry.mockResolvedValue(true);

      const interaction = makeInteraction('remove', {
        strings: { message_id: 'msg-1', emoji: '⭐' },
      });
      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Removed') }),
      );
    });
  });

  describe('delete', () => {
    it('replies with error when menu not found', async () => {
      makePool();
      findMenuByMessageId.mockResolvedValue(null);
      const interaction = makeInteraction('delete', { strings: { message_id: 'ghost' } });
      await execute(interaction);
      expect(deleteMenu).not.toHaveBeenCalled();
    });

    it('deletes menu and replies success', async () => {
      makePool();
      findMenuByMessageId.mockResolvedValue({
        id: 3,
        guild_id: 'guild-1',
        channel_id: 'ch-1',
        message_id: 'msg-del',
      });
      deleteMenu.mockResolvedValue(true);

      const interaction = makeInteraction('delete', { strings: { message_id: 'msg-del' } });
      // Mock the channel.messages.fetch chain
      const mockMsg = { delete: vi.fn().mockResolvedValue(undefined) };
      interaction.guild.channels.fetch.mockResolvedValue({
        isTextBased: () => true,
        messages: { fetch: vi.fn().mockResolvedValue(mockMsg) },
      });

      await execute(interaction);
      expect(deleteMenu).toHaveBeenCalledWith(3);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('deleted') }),
      );
    });
  });

  describe('list', () => {
    it('shows "none" message when no menus', async () => {
      makePool();
      listMenusForGuild.mockResolvedValue([]);
      const interaction = makeInteraction('list');
      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('No reaction-role menus') }),
      );
    });

    it('lists menus when some exist', async () => {
      makePool();
      listMenusForGuild.mockResolvedValue([
        { id: 1, title: 'Colors', channel_id: 'ch-1', message_id: 'msg-1' },
        { id: 2, title: 'Games', channel_id: 'ch-2', message_id: 'msg-2' },
      ]);
      const interaction = makeInteraction('list');
      await execute(interaction);
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Colors') }),
      );
    });
  });

  // ── Emoji trimming (regression: normaliseInputEmoji removed, emojiInput.trim() used) ──

  describe('emoji trimming in add', () => {
    it('stores trimmed emoji key when emoji has leading/trailing spaces', async () => {
      makePool();
      const menu = {
        id: 9,
        guild_id: 'guild-1',
        channel_id: 'ch-1',
        message_id: 'msg-1',
        title: 'T',
        description: null,
      };
      findMenuByMessageId.mockResolvedValue(menu);
      upsertReactionRoleEntry.mockResolvedValue({ id: 1 });

      const role = { id: 'r-1', name: 'Star', position: 5 };
      const interaction = makeInteraction('add', {
        strings: { message_id: 'msg-1', emoji: '  ⭐  ' },
        role,
      });

      await execute(interaction);

      // Emoji key must be trimmed — not the raw spaced input
      expect(upsertReactionRoleEntry).toHaveBeenCalledWith(9, '⭐', 'r-1');
    });

    it('stores emoji unchanged when already trimmed', async () => {
      makePool();
      const menu = {
        id: 10,
        guild_id: 'guild-1',
        channel_id: 'ch-1',
        message_id: 'msg-2',
        title: 'T',
        description: null,
      };
      findMenuByMessageId.mockResolvedValue(menu);
      upsertReactionRoleEntry.mockResolvedValue({ id: 2 });

      const role = { id: 'r-2', name: 'Fire', position: 5 };
      const interaction = makeInteraction('add', {
        strings: { message_id: 'msg-2', emoji: '🔥' },
        role,
      });

      await execute(interaction);

      expect(upsertReactionRoleEntry).toHaveBeenCalledWith(10, '🔥', 'r-2');
    });
  });

  describe('emoji trimming in remove', () => {
    it('removes entry using trimmed emoji key when input has spaces', async () => {
      makePool();
      findMenuByMessageId.mockResolvedValue({
        id: 11,
        guild_id: 'guild-1',
        channel_id: 'ch-1',
        message_id: 'msg-3',
        title: 'T',
        description: null,
      });
      removeReactionRoleEntry.mockResolvedValue(true);

      const interaction = makeInteraction('remove', {
        strings: { message_id: 'msg-3', emoji: '  🎉  ' },
      });
      await execute(interaction);

      // Key passed to removeReactionRoleEntry must be trimmed
      expect(removeReactionRoleEntry).toHaveBeenCalledWith(11, '🎉');
      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Removed') }),
      );
    });
  });

  describe('safeSend usage in create', () => {
    it('uses safeSend (not channel.send directly) to post the menu message', async () => {
      const { safeSend } = await import('../../src/utils/safeSend.js');
      makePool();
      insertReactionRoleMenu.mockResolvedValue({ id: 5 });

      const interaction = makeInteraction('create', {
        strings: { title: 'Pick a Role' },
      });

      await execute(interaction);

      expect(safeSend).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ch-1' }),
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });
  });
});