/**
 * Tests for src/commands/ticket.js
 * Covers /ticket command subcommands: open, close, add, remove, panel
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockOpenTicket = vi.fn();
const mockCloseTicket = vi.fn();
const mockAddMember = vi.fn();
const mockRemoveMember = vi.fn();
const mockBuildTicketPanel = vi.fn();
const mockGetTicketConfig = vi.fn();

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    permissions: { enabled: true, adminRoleId: null, usePermissions: true },
  }),
}));

vi.mock('../../src/modules/ticketHandler.js', () => ({
  openTicket: (...args) => mockOpenTicket(...args),
  closeTicket: (...args) => mockCloseTicket(...args),
  addMember: (...args) => mockAddMember(...args),
  removeMember: (...args) => mockRemoveMember(...args),
  buildTicketPanel: (...args) => mockBuildTicketPanel(...args),
  getTicketConfig: (...args) => mockGetTicketConfig(...args),
}));

vi.mock('../../src/utils/permissions.js', () => ({
  isModerator: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue(undefined),
  safeReply: vi.fn().mockResolvedValue(undefined),
  safeEditReply: vi.fn().mockResolvedValue(undefined),
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
      const sub = {
        setName: () => ({
          setDescription: () => ({
            addStringOption: function self(fn2) {
              fn2(chainable());
              return {
                addStringOption: self,
                addUserOption: self,
                addChannelOption: self,
              };
            },
            addUserOption: function self(fn2) {
              fn2(chainable());
              return {
                addStringOption: self,
                addUserOption: self,
                addChannelOption: self,
              };
            },
            addChannelOption: function self(fn2) {
              fn2(chainable());
              return {
                addStringOption: self,
                addUserOption: self,
                addChannelOption: self,
              };
            },
          }),
        }),
      };
      fn(sub);
      return this;
    }
    toJSON() {
      return { name: this.name, description: this.description };
    }
  }

  return {
    SlashCommandBuilder: MockSlashCommandBuilder,
    ChannelType: {
      GuildText: 0,
      PrivateThread: 12,
    },
    PermissionFlagsBits: {
      Administrator: 8n,
    },
  };
});

import { getConfig } from '../../src/modules/config.js';
import { isModerator } from '../../src/utils/permissions.js';
import { safeEditReply, safeSend } from '../../src/utils/safeSend.js';

// ── Helpers ──────────────────────────────────────────────────────

function createMockInteraction(overrides = {}) {
  return {
    guildId: 'guild1',
    channelId: 'channel1',
    user: { id: 'user1', tag: 'User#1234' },
    member: {
      permissions: {
        has: vi.fn().mockReturnValue(false),
      },
    },
    options: {
      getSubcommand: vi.fn().mockReturnValue('open'),
      getString: vi.fn().mockReturnValue(null),
      getUser: vi.fn().mockReturnValue(null),
      getChannel: vi.fn().mockReturnValue(null),
    },
    channel: {
      id: 'channel1',
      type: 0, // GuildText
      isThread: () => false,
    },
    guild: {
      id: 'guild1',
      tag: 'Guild#1234',
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockThread(overrides = {}) {
  return {
    id: 'thread1',
    type: 12, // PrivateThread
    isThread: () => true,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('/ticket command', () => {
  let execute;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetTicketConfig.mockReturnValue({ enabled: true });

    // Dynamically import after mocks are set up
    const mod = await import('../../src/commands/ticket.js');
    execute = mod.execute;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── /ticket open ────────────────────────────────────────────

  describe('/ticket open', () => {
    it('should create a ticket successfully', async () => {
      const interaction = createMockInteraction();
      interaction.options.getSubcommand.mockReturnValue('open');
      interaction.options.getString.mockReturnValue('Need help with bot');

      mockOpenTicket.mockResolvedValue({
        ticket: { id: 1 },
        thread: { id: 'thread1' },
      });

      await execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(mockOpenTicket).toHaveBeenCalledWith(
        interaction.guild,
        interaction.user,
        'Need help with bot',
        'channel1',
      );
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '✅ Ticket #1 created! Head to <#thread1>.',
      });
    });

    it('should create a ticket without a topic', async () => {
      const interaction = createMockInteraction();
      interaction.options.getSubcommand.mockReturnValue('open');
      interaction.options.getString.mockReturnValue(null);

      mockOpenTicket.mockResolvedValue({
        ticket: { id: 2 },
        thread: { id: 'thread2' },
      });

      await execute(interaction);

      expect(mockOpenTicket).toHaveBeenCalledWith(
        interaction.guild,
        interaction.user,
        null,
        'channel1',
      );
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '✅ Ticket #2 created! Head to <#thread2>.',
      });
    });

    it('should handle ticket creation errors', async () => {
      const interaction = createMockInteraction();
      interaction.options.getSubcommand.mockReturnValue('open');

      mockOpenTicket.mockRejectedValue(new Error('Max open tickets reached'));

      await execute(interaction);

      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '❌ Max open tickets reached',
      });
    });

    it('should return error when ticket system is disabled', async () => {
      const interaction = createMockInteraction();
      mockGetTicketConfig.mockReturnValue({ enabled: false });

      await execute(interaction);

      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '❌ The ticket system is not enabled on this server.',
      });
      expect(mockOpenTicket).not.toHaveBeenCalled();
    });
  });

  // ─── /ticket close ───────────────────────────────────────────

  describe('/ticket close', () => {
    it('should close a ticket successfully', async () => {
      const thread = createMockThread();
      const interaction = createMockInteraction({ channel: thread });
      interaction.options.getSubcommand.mockReturnValue('close');
      interaction.options.getString.mockReturnValue('Issue resolved');

      mockCloseTicket.mockResolvedValue({ id: 1 });

      await execute(interaction);

      expect(mockCloseTicket).toHaveBeenCalledWith(thread, interaction.user, 'Issue resolved');
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '✅ Ticket #1 has been closed.',
      });
    });

    it('should close a ticket without a reason', async () => {
      const thread = createMockThread();
      const interaction = createMockInteraction({ channel: thread });
      interaction.options.getSubcommand.mockReturnValue('close');
      interaction.options.getString.mockReturnValue(null);

      mockCloseTicket.mockResolvedValue({ id: 3 });

      await execute(interaction);

      expect(mockCloseTicket).toHaveBeenCalledWith(thread, interaction.user, null);
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '✅ Ticket #3 has been closed.',
      });
    });

    it('should reject close outside a ticket context', async () => {
      const interaction = createMockInteraction();
      interaction.options.getSubcommand.mockReturnValue('close');

      await execute(interaction);

      expect(mockCloseTicket).not.toHaveBeenCalled();
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '❌ This command must be used inside a ticket thread or channel.',
      });
    });

    it('should handle close errors', async () => {
      const thread = createMockThread();
      const interaction = createMockInteraction({ channel: thread });
      interaction.options.getSubcommand.mockReturnValue('close');

      mockCloseTicket.mockRejectedValue(new Error('No open ticket found'));

      await execute(interaction);

      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '❌ No open ticket found',
      });
    });
  });

  // ─── /ticket add ─────────────────────────────────────────────

  describe('/ticket add', () => {
    it('should add a user to the ticket', async () => {
      const thread = createMockThread();
      const interaction = createMockInteraction({ channel: thread });
      const targetUser = { id: 'user2', tag: 'Helper#5678' };

      interaction.options.getSubcommand.mockReturnValue('add');
      interaction.options.getUser.mockReturnValue(targetUser);

      mockAddMember.mockResolvedValue(undefined);

      await execute(interaction);

      expect(mockAddMember).toHaveBeenCalledWith(thread, targetUser);
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '✅ <@user2> has been added to the ticket.',
      });
    });

    it('should reject add outside a ticket context', async () => {
      const interaction = createMockInteraction();
      const targetUser = { id: 'user2' };

      interaction.options.getSubcommand.mockReturnValue('add');
      interaction.options.getUser.mockReturnValue(targetUser);

      await execute(interaction);

      expect(mockAddMember).not.toHaveBeenCalled();
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '❌ This command must be used inside a ticket thread or channel.',
      });
    });

    it('should handle add errors', async () => {
      const thread = createMockThread();
      const interaction = createMockInteraction({ channel: thread });
      const targetUser = { id: 'user2' };

      interaction.options.getSubcommand.mockReturnValue('add');
      interaction.options.getUser.mockReturnValue(targetUser);

      mockAddMember.mockRejectedValue(new Error('Missing permissions'));

      await execute(interaction);

      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '❌ Failed to add user: Missing permissions',
      });
    });
  });

  // ─── /ticket remove ──────────────────────────────────────────

  describe('/ticket remove', () => {
    it('should remove a user from the ticket', async () => {
      const thread = createMockThread();
      const interaction = createMockInteraction({ channel: thread });
      const targetUser = { id: 'user2', tag: 'Helper#5678' };

      interaction.options.getSubcommand.mockReturnValue('remove');
      interaction.options.getUser.mockReturnValue(targetUser);

      mockRemoveMember.mockResolvedValue(undefined);

      await execute(interaction);

      expect(mockRemoveMember).toHaveBeenCalledWith(thread, targetUser);
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '✅ <@user2> has been removed from the ticket.',
      });
    });

    it('should reject remove outside a ticket context', async () => {
      const interaction = createMockInteraction();
      const targetUser = { id: 'user2' };

      interaction.options.getSubcommand.mockReturnValue('remove');
      interaction.options.getUser.mockReturnValue(targetUser);

      await execute(interaction);

      expect(mockRemoveMember).not.toHaveBeenCalled();
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '❌ This command must be used inside a ticket thread or channel.',
      });
    });

    it('should handle remove errors', async () => {
      const thread = createMockThread();
      const interaction = createMockInteraction({ channel: thread });
      const targetUser = { id: 'user2' };

      interaction.options.getSubcommand.mockReturnValue('remove');
      interaction.options.getUser.mockReturnValue(targetUser);

      mockRemoveMember.mockRejectedValue(new Error('User not in ticket'));

      await execute(interaction);

      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '❌ Failed to remove user: User not in ticket',
      });
    });
  });

  // ─── /ticket panel ───────────────────────────────────────────

  describe('/ticket panel', () => {
    it('should post a ticket panel with admin permissions', async () => {
      const interaction = createMockInteraction();
      interaction.options.getSubcommand.mockReturnValue('panel');
      interaction.member.permissions.has.mockReturnValue(true); // Admin

      const mockEmbed = { data: { title: '🎫 Support Tickets' } };
      const mockRow = { components: [{ data: { custom_id: 'ticket_open' } }] };
      mockBuildTicketPanel.mockReturnValue({ embed: mockEmbed, row: mockRow });

      await execute(interaction);

      expect(mockBuildTicketPanel).toHaveBeenCalled();
      expect(safeSend).toHaveBeenCalledWith(interaction.channel, {
        embeds: [mockEmbed],
        components: [mockRow],
      });
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '✅ Ticket panel posted in <#channel1>.',
      });
    });

    it('should post panel to specified channel', async () => {
      const targetChannel = { id: 'channel2', tag: 'Channel2' };
      const interaction = createMockInteraction();
      interaction.options.getSubcommand.mockReturnValue('panel');
      interaction.options.getChannel.mockReturnValue(targetChannel);
      interaction.member.permissions.has.mockReturnValue(true);

      const mockEmbed = { data: {} };
      const mockRow = { components: [] };
      mockBuildTicketPanel.mockReturnValue({ embed: mockEmbed, row: mockRow });

      await execute(interaction);

      expect(safeSend).toHaveBeenCalledWith(targetChannel, {
        embeds: [mockEmbed],
        components: [mockRow],
      });
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '✅ Ticket panel posted in <#channel2>.',
      });
    });

    it('should reject panel without admin permissions', async () => {
      const interaction = createMockInteraction();
      interaction.options.getSubcommand.mockReturnValue('panel');
      interaction.member.permissions.has.mockReturnValue(false);
      isModerator.mockReturnValue(false);

      await execute(interaction);

      expect(mockBuildTicketPanel).not.toHaveBeenCalled();
      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '❌ You need administrator permissions to use this command.',
      });
    });

    it('should allow panel with moderator role', async () => {
      const interaction = createMockInteraction();
      interaction.options.getSubcommand.mockReturnValue('panel');
      interaction.member.permissions.has.mockReturnValue(false);
      isModerator.mockReturnValue(true);

      const mockEmbed = { data: {} };
      const mockRow = { components: [] };
      mockBuildTicketPanel.mockReturnValue({ embed: mockEmbed, row: mockRow });

      await execute(interaction);

      expect(mockBuildTicketPanel).toHaveBeenCalled();
      expect(safeSend).toHaveBeenCalled();
    });

    it('should handle panel posting errors', async () => {
      const interaction = createMockInteraction();
      interaction.options.getSubcommand.mockReturnValue('panel');
      interaction.member.permissions.has.mockReturnValue(true);

      mockBuildTicketPanel.mockReturnValue({ embed: {}, row: {} });
      safeSend.mockRejectedValue(new Error('Missing Permissions'));

      await execute(interaction);

      expect(safeEditReply).toHaveBeenCalledWith(interaction, {
        content: '❌ Failed to post panel: Missing Permissions',
      });
    });
  });

  // ─── Command definition ──────────────────────────────────────

  describe('command definition', () => {
    it('should have correct command structure', async () => {
      const mod = await import('../../src/commands/ticket.js');
      const { data } = mod;

      expect(data.name).toBe('ticket');
      expect(data.description).toContain('ticket');
    });
  });
});
