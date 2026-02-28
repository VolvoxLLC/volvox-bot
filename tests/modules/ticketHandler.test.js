/**
 * Tests for src/modules/ticketHandler.js
 * Covers openTicket, closeTicket, addMember, removeMember,
 * checkAutoClose, buildTicketPanel, getTicketConfig.
 * Tests both thread mode (default) and channel mode.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockQuery = vi.fn();
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(() => ({ query: mockQuery })),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    tickets: {
      enabled: true,
      mode: 'thread',
      supportRole: 'role1',
      category: null,
      autoCloseHours: 48,
      transcriptChannel: 'transcript-ch',
      maxOpenPerUser: 3,
    },
  }),
}));

const mockSafeSend = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: (...args) => mockSafeSend(...args),
  safeReply: vi.fn().mockResolvedValue(undefined),
  safeEditReply: vi.fn().mockResolvedValue(undefined),
}));

import { getConfig } from '../../src/modules/config.js';
import {
  addMember,
  buildTicketPanel,
  checkAutoClose,
  closeTicket,
  getTicketConfig,
  openTicket,
  removeMember,
} from '../../src/modules/ticketHandler.js';

// ── Helpers ──────────────────────────────────────────────────────

function createMockThread(overrides = {}) {
  return {
    id: 'thread1',
    isThread: () => true,
    type: 12, // PrivateThread
    guild: {
      id: 'guild1',
      channels: { cache: new Map() },
    },
    members: {
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    messages: {
      fetch: vi.fn().mockResolvedValue(new Map()),
    },
    setArchived: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockChannel(overrides = {}) {
  return {
    id: 'channel1',
    isThread: () => false,
    type: 0, // GuildText
    guild: {
      id: 'guild1',
      channels: { cache: new Map() },
    },
    permissionOverwrites: {
      edit: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    messages: {
      fetch: vi.fn().mockResolvedValue(new Map()),
    },
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockGuild(overrides = {}) {
  const botMember = {
    id: 'bot1',
    permissions: { has: () => true },
  };
  const textChannel = {
    id: 'ch1',
    type: 0, // GuildText
    permissionsFor: () => ({ has: () => true }),
    threads: {
      create: vi.fn().mockResolvedValue(createMockThread()),
    },
  };
  const role = {
    members: new Map([['member1', { id: 'member1' }]]),
  };

  return {
    id: 'guild1',
    channels: {
      cache: new Map([['ch1', textChannel]]),
      fetch: vi.fn(),
      create: vi.fn().mockResolvedValue(createMockChannel()),
    },
    roles: { cache: new Map([['role1', role]]) },
    members: { me: botMember },
    ...overrides,
  };
}

function createMockUser(overrides = {}) {
  return {
    id: 'user1',
    tag: 'User#1234',
    username: 'testuser',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('ticketHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── getTicketConfig ─────────────────────────────────────────

  describe('getTicketConfig', () => {
    it('should merge defaults with guild config', () => {
      const config = getTicketConfig('guild1');
      expect(config.enabled).toBe(true);
      expect(config.mode).toBe('thread');
      expect(config.supportRole).toBe('role1');
      expect(config.autoCloseHours).toBe(48);
      expect(config.maxOpenPerUser).toBe(3);
    });

    it('should use defaults when no tickets config', () => {
      getConfig.mockReturnValueOnce({});
      const config = getTicketConfig('guild2');
      expect(config.enabled).toBe(false);
      expect(config.mode).toBe('thread');
      expect(config.supportRole).toBeNull();
      expect(config.autoCloseHours).toBe(48);
      expect(config.maxOpenPerUser).toBe(3);
    });
  });

  // ─── buildTicketPanel ─────────────────────────────────────────

  describe('buildTicketPanel', () => {
    it('should return embed and button row', () => {
      const { embed, row } = buildTicketPanel();
      expect(embed).toBeDefined();
      expect(embed.data.title).toBe('🎫 Support Tickets');
      expect(row).toBeDefined();
      expect(row.components).toHaveLength(1);
      expect(row.components[0].data.custom_id).toBe('ticket_open');
    });

    it('should use channel-mode copy when guild ticket mode is channel', () => {
      getConfig.mockReturnValueOnce({
        tickets: {
          enabled: true,
          mode: 'channel',
        },
      });

      const { embed } = buildTicketPanel('guild1');
      expect(embed.data.description).toContain('A private channel will be created');
    });
  });

  // ─── openTicket (thread mode) ─────────────────────────────────

  describe('openTicket (thread mode)', () => {
    it('should create a ticket successfully', async () => {
      const guild = createMockGuild();
      const user = createMockUser();

      // Count query: 0 open tickets
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      // Insert query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, guild_id: 'guild1', user_id: 'user1', topic: 'test', thread_id: 'thread1' },
        ],
      });

      const result = await openTicket(guild, user, 'test', 'ch1');
      expect(result.ticket.id).toBe(1);
      expect(result.thread).toBeDefined();
    });

    it('should throw when user has max open tickets', async () => {
      const guild = createMockGuild();
      const user = createMockUser();

      mockQuery.mockResolvedValueOnce({ rows: [{ count: 3 }] });

      await expect(openTicket(guild, user, 'test')).rejects.toThrow(
        'You already have 3 open tickets',
      );
    });

    it('should throw when database is not available', async () => {
      const { getPool: getPoolFn } = await import('../../src/db.js');
      getPoolFn.mockReturnValueOnce(null);

      const guild = createMockGuild();
      const user = createMockUser();

      await expect(openTicket(guild, user, 'test')).rejects.toThrow('Database not available');
    });

    it('should add support role members to thread', async () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const thread = createMockThread();
      guild.channels.cache.get('ch1').threads.create.mockResolvedValue(thread);

      mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, guild_id: 'guild1', user_id: 'user1', topic: 'test', thread_id: 'thread1' },
        ],
      });

      await openTicket(guild, user, 'test', 'ch1');

      // Should add the user + support role member
      expect(thread.members.add).toHaveBeenCalledWith('user1');
      expect(thread.members.add).toHaveBeenCalledWith('member1');
    });

    it('should work without topic', async () => {
      const guild = createMockGuild();
      const user = createMockUser();

      mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 2, guild_id: 'guild1', user_id: 'user1', topic: null, thread_id: 'thread1' }],
      });

      const result = await openTicket(guild, user, null, 'ch1');
      expect(result.ticket.id).toBe(2);
    });
  });

  // ─── openTicket (channel mode) ────────────────────────────────

  describe('openTicket (channel mode)', () => {
    beforeEach(() => {
      getConfig.mockReturnValue({
        tickets: {
          enabled: true,
          mode: 'channel',
          supportRole: 'role1',
          category: 'cat1',
          autoCloseHours: 48,
          transcriptChannel: null,
          maxOpenPerUser: 3,
        },
      });
    });

    it('should create a text channel with permission overrides', async () => {
      const categoryChannel = { id: 'cat1', type: 4 };
      const createdChannel = createMockChannel({ id: 'ticket-ch' });

      const guild = createMockGuild();
      guild.channels.cache.set('cat1', categoryChannel);
      guild.channels.create.mockResolvedValue(createdChannel);

      const user = createMockUser();

      mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            guild_id: 'guild1',
            user_id: 'user1',
            topic: 'help',
            thread_id: 'ticket-ch',
          },
        ],
      });

      const result = await openTicket(guild, user, 'help', 'ch1');

      expect(result.ticket.id).toBe(10);
      expect(result.thread.id).toBe('ticket-ch');

      // Verify guild.channels.create was called with correct params
      expect(guild.channels.create).toHaveBeenCalledTimes(1);
      const createCall = guild.channels.create.mock.calls[0][0];
      expect(createCall.name).toBe('ticket-testuser-help');
      expect(createCall.type).toBe(0); // GuildText
      expect(createCall.parent).toBe('cat1');
      expect(createCall.reason).toContain('User#1234');

      // Verify permission overrides include @everyone deny, user allow, bot allow, role allow
      const overwrites = createCall.permissionOverwrites;
      expect(overwrites).toHaveLength(4); // everyone + user + bot + support role

      // @everyone deny ViewChannel
      const everyoneOverwrite = overwrites.find((o) => o.id === 'guild1');
      expect(everyoneOverwrite).toBeDefined();

      // User allow
      const userOverwrite = overwrites.find((o) => o.id === 'user1');
      expect(userOverwrite).toBeDefined();

      // Bot allow
      const botOverwrite = overwrites.find((o) => o.id === 'bot1');
      expect(botOverwrite).toBeDefined();

      // Support role allow
      const roleOverwrite = overwrites.find((o) => o.id === 'role1');
      expect(roleOverwrite).toBeDefined();
    });

    it('should not call thread.members.add in channel mode', async () => {
      const createdChannel = createMockChannel({ id: 'ticket-ch' });
      const guild = createMockGuild();
      guild.channels.create.mockResolvedValue(createdChannel);

      const user = createMockUser();

      mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 11,
            guild_id: 'guild1',
            user_id: 'user1',
            topic: null,
            thread_id: 'ticket-ch',
          },
        ],
      });

      await openTicket(guild, user, null, 'ch1');

      // Thread mode would call thread.members.add, channel mode should not
      const threadInCache = guild.channels.cache.get('ch1');
      expect(threadInCache.threads.create).not.toHaveBeenCalled();
    });

    it('should work without a category configured', async () => {
      getConfig.mockReturnValue({
        tickets: {
          enabled: true,
          mode: 'channel',
          supportRole: null,
          category: null,
          autoCloseHours: 48,
          transcriptChannel: null,
          maxOpenPerUser: 3,
        },
      });

      const createdChannel = createMockChannel({ id: 'ticket-ch2' });
      const guild = createMockGuild();
      guild.channels.create.mockResolvedValue(createdChannel);

      const user = createMockUser();

      mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 12,
            guild_id: 'guild1',
            user_id: 'user1',
            topic: null,
            thread_id: 'ticket-ch2',
          },
        ],
      });

      const result = await openTicket(guild, user, null, 'ch1');
      expect(result.ticket.id).toBe(12);

      // parent should be undefined when no category
      const createCall = guild.channels.create.mock.calls[0][0];
      expect(createCall.parent).toBeUndefined();

      // No support role → only 3 overwrites (everyone + user + bot)
      expect(createCall.permissionOverwrites).toHaveLength(3);
    });
  });

  // ─── closeTicket (thread mode) ────────────────────────────────

  describe('closeTicket (thread mode)', () => {
    beforeEach(() => {
      getConfig.mockReturnValue({
        tickets: {
          enabled: true,
          mode: 'thread',
          supportRole: 'role1',
          category: null,
          autoCloseHours: 48,
          transcriptChannel: 'transcript-ch',
          maxOpenPerUser: 3,
        },
      });
    });

    it('should close a ticket and save transcript', async () => {
      const closer = createMockUser({ id: 'closer1', tag: 'Closer#1234' });
      const messages = new Map([
        [
          'msg1',
          {
            author: { tag: 'User#1234', id: 'user1' },
            content: 'Hello',
            createdAt: new Date('2024-01-01'),
          },
        ],
        [
          'msg2',
          {
            author: { tag: 'Staff#5678', id: 'staff1' },
            content: 'How can I help?',
            createdAt: new Date('2024-01-01T00:01:00'),
          },
        ],
      ]);

      const transcriptChannel = {
        id: 'transcript-ch',
      };

      const thread = createMockThread({
        guild: {
          id: 'guild1',
          channels: { cache: new Map([['transcript-ch', transcriptChannel]]) },
        },
      });
      thread.messages.fetch.mockResolvedValue(messages);

      // SELECT ticket
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            guild_id: 'guild1',
            user_id: 'user1',
            topic: 'test',
            thread_id: 'thread1',
          },
        ],
      });
      // UPDATE ticket
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            status: 'closed',
            closed_by: 'closer1',
            close_reason: 'Resolved',
          },
        ],
      });

      const result = await closeTicket(thread, closer, 'Resolved');
      expect(result.status).toBe('closed');
      expect(result.closed_by).toBe('closer1');

      // Verify transcript was saved
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE tickets');
      const transcript = JSON.parse(updateCall[1][2]);
      expect(transcript).toHaveLength(2);
    });

    it('should throw when no open ticket found', async () => {
      const thread = createMockThread();
      const closer = createMockUser();

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(closeTicket(thread, closer, 'Done')).rejects.toThrow('No open ticket found');
    });

    it('should archive the thread after closing', async () => {
      const thread = createMockThread({
        guild: {
          id: 'guild1',
          channels: { cache: new Map() },
        },
      });
      const closer = createMockUser();

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, guild_id: 'guild1', user_id: 'user1', thread_id: 'thread1' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'closed' }],
      });

      await closeTicket(thread, closer, null);
      expect(thread.setArchived).toHaveBeenCalledWith(true);
    });

    it('should handle thread archive failure gracefully', async () => {
      const thread = createMockThread({
        guild: { id: 'guild1', channels: { cache: new Map() } },
      });
      thread.setArchived.mockRejectedValue(new Error('Cannot archive'));
      const closer = createMockUser();

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, guild_id: 'guild1', user_id: 'user1', thread_id: 'thread1' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'closed' }],
      });

      // Should not throw
      const result = await closeTicket(thread, closer, null);
      expect(result.status).toBe('closed');
    });
  });

  // ─── closeTicket (channel mode) ───────────────────────────────

  describe('closeTicket (channel mode)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      getConfig.mockReturnValue({
        tickets: {
          enabled: true,
          mode: 'channel',
          supportRole: null,
          category: null,
          autoCloseHours: 48,
          transcriptChannel: null,
          maxOpenPerUser: 3,
        },
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should delete the channel after a delay instead of archiving', async () => {
      const channel = createMockChannel({
        guild: { id: 'guild1', channels: { cache: new Map() } },
      });
      const closer = createMockUser();

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, guild_id: 'guild1', user_id: 'user1', thread_id: 'channel1' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, status: 'closed' }],
      });

      const result = await closeTicket(channel, closer, 'Done');
      expect(result.status).toBe('closed');

      // Channel should NOT be deleted immediately
      expect(channel.delete).not.toHaveBeenCalled();

      // Advance timers past the 10s delay
      await vi.advanceTimersByTimeAsync(11_000);

      expect(channel.delete).toHaveBeenCalledWith('Ticket #5 closed');
    });

    it('should handle channel delete failure gracefully', async () => {
      const channel = createMockChannel({
        guild: { id: 'guild1', channels: { cache: new Map() } },
      });
      channel.delete.mockRejectedValue(new Error('Missing Permissions'));
      const closer = createMockUser();

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 6, guild_id: 'guild1', user_id: 'user1', thread_id: 'channel1' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 6, status: 'closed' }],
      });

      const result = await closeTicket(channel, closer, null);
      expect(result.status).toBe('closed');

      // Should not throw when delete fails
      await vi.advanceTimersByTimeAsync(11_000);
      expect(channel.delete).toHaveBeenCalled();
    });

    it('should not call setArchived for channel mode', async () => {
      const channel = createMockChannel({
        guild: { id: 'guild1', channels: { cache: new Map() } },
      });
      // Add setArchived to ensure it's not called
      channel.setArchived = vi.fn();
      const closer = createMockUser();

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 7, guild_id: 'guild1', user_id: 'user1', thread_id: 'channel1' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 7, status: 'closed' }],
      });

      await closeTicket(channel, closer, null);
      expect(channel.setArchived).not.toHaveBeenCalled();
    });
  });

  // ─── addMember (thread mode) ──────────────────────────────────

  describe('addMember (thread mode)', () => {
    it('should add a user to the thread', async () => {
      const thread = createMockThread();
      const user = createMockUser({ id: 'newuser' });

      await addMember(thread, user);
      expect(thread.members.add).toHaveBeenCalledWith('newuser');
      expect(mockSafeSend).toHaveBeenCalled();
    });
  });

  // ─── addMember (channel mode) ─────────────────────────────────

  describe('addMember (channel mode)', () => {
    it('should update permission overrides to grant access', async () => {
      const channel = createMockChannel();
      const user = createMockUser({ id: 'newuser' });

      await addMember(channel, user);

      expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith('newuser', {
        ViewChannel: true,
        SendMessages: true,
      });
      expect(mockSafeSend).toHaveBeenCalled();
    });
  });

  // ─── removeMember (thread mode) ───────────────────────────────

  describe('removeMember (thread mode)', () => {
    it('should remove a user from the thread', async () => {
      const thread = createMockThread();
      const user = createMockUser({ id: 'olduser' });

      await removeMember(thread, user);
      expect(thread.members.remove).toHaveBeenCalledWith('olduser');
      expect(mockSafeSend).toHaveBeenCalled();
    });
  });

  // ─── removeMember (channel mode) ──────────────────────────────

  describe('removeMember (channel mode)', () => {
    it('should delete permission override to revoke access', async () => {
      const channel = createMockChannel();
      const user = createMockUser({ id: 'olduser' });

      await removeMember(channel, user);

      expect(channel.permissionOverwrites.delete).toHaveBeenCalledWith('olduser');
      expect(mockSafeSend).toHaveBeenCalled();
    });
  });

  // ─── checkAutoClose ───────────────────────────────────────────

  describe('checkAutoClose', () => {
    it('should skip tickets in guilds where tickets are disabled', async () => {
      getConfig.mockReturnValue({ tickets: { enabled: false } });

      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, guild_id: 'guild1', thread_id: 'thread1', created_at: new Date().toISOString() },
        ],
      });

      const client = {
        guilds: { cache: new Map([['guild1', createMockGuild()]]) },
        user: { id: 'bot1' },
      };

      await checkAutoClose(client);

      // Should not have made any more queries (no close)
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should close tickets that exceed total threshold', async () => {
      getConfig.mockReturnValue({
        tickets: { enabled: true, autoCloseHours: 48 },
      });

      const oldDate = new Date(Date.now() - 80 * 60 * 60 * 1000); // 80 hours ago

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            guild_id: 'guild1',
            thread_id: 'thread1',
            created_at: oldDate.toISOString(),
          },
        ],
      });

      const thread = createMockThread({
        guild: { id: 'guild1', channels: { cache: new Map() } },
      });
      const lastMsg = {
        createdAt: oldDate,
      };
      thread.messages.fetch.mockResolvedValue(new Map([['msg1', lastMsg]]));

      const guild = createMockGuild();
      guild.channels.fetch = vi.fn().mockResolvedValue(thread);

      const client = {
        guilds: { cache: new Map([['guild1', guild]]) },
        user: { id: 'bot1', tag: 'Bot#1234' },
      };

      // closeTicket will query for the ticket and update it
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, guild_id: 'guild1', user_id: 'user1', thread_id: 'thread1' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'closed' }],
      });

      await checkAutoClose(client);

      // The update query should have been called
      const updateCalls = mockQuery.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('UPDATE tickets'),
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    it('should auto-close channel-mode tickets (text channel)', async () => {
      getConfig.mockReturnValue({
        tickets: { enabled: true, mode: 'channel', autoCloseHours: 48 },
      });

      const oldDate = new Date(Date.now() - 80 * 60 * 60 * 1000);

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 20,
            guild_id: 'guild1',
            thread_id: 'ticket-ch1',
            created_at: oldDate.toISOString(),
          },
        ],
      });

      const channel = createMockChannel({
        id: 'ticket-ch1',
        guild: { id: 'guild1', channels: { cache: new Map() } },
      });
      const lastMsg = { createdAt: oldDate };
      channel.messages.fetch.mockResolvedValue(new Map([['msg1', lastMsg]]));

      const guild = createMockGuild();
      guild.channels.fetch = vi.fn().mockResolvedValue(channel);

      const client = {
        guilds: { cache: new Map([['guild1', guild]]) },
        user: { id: 'bot1', tag: 'Bot#1234' },
      };

      // closeTicket queries
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 20, guild_id: 'guild1', user_id: 'user1', thread_id: 'ticket-ch1' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 20, status: 'closed' }],
      });

      await checkAutoClose(client);

      const updateCalls = mockQuery.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('UPDATE tickets'),
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    it('should send warning for tickets past autoCloseHours but not total threshold', async () => {
      getConfig.mockReturnValue({
        tickets: { enabled: true, autoCloseHours: 48 },
      });

      const almostOldDate = new Date(Date.now() - 50 * 60 * 60 * 1000); // 50 hours ago

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            guild_id: 'guild1',
            thread_id: 'thread2',
            created_at: almostOldDate.toISOString(),
          },
        ],
      });

      const lastMsg = {
        createdAt: almostOldDate,
      };

      const thread = createMockThread({ id: 'thread2' });
      thread.messages.fetch.mockResolvedValueOnce(new Map([['msg1', lastMsg]])); // limit: 10

      const guild = createMockGuild();
      guild.channels.fetch = vi.fn().mockResolvedValue(thread);

      const client = {
        guilds: { cache: new Map([['guild1', guild]]) },
        user: { id: 'bot1' },
      };

      await checkAutoClose(client);

      // Should have sent the warning message
      expect(mockSafeSend).toHaveBeenCalledWith(
        thread,
        expect.objectContaining({
          content: expect.stringContaining('auto-close'),
        }),
      );
    });

    it('should handle deleted threads by closing in DB', async () => {
      getConfig.mockReturnValue({
        tickets: { enabled: true, autoCloseHours: 48 },
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 3,
            guild_id: 'guild1',
            thread_id: 'thread-gone',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const guild = createMockGuild();
      guild.channels.fetch = vi.fn().mockRejectedValue(new Error('Unknown Channel'));

      const client = {
        guilds: { cache: new Map([['guild1', guild]]) },
        user: { id: 'bot1' },
      };

      // DB close for deleted thread
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await checkAutoClose(client);

      const closeCalls = mockQuery.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('UPDATE tickets'),
      );
      expect(closeCalls.length).toBe(1);
      expect(closeCalls[0][0]).toContain('Thread deleted');
    });

    it('should skip if pool is not available', async () => {
      const { getPool: getPoolFn } = await import('../../src/db.js');
      getPoolFn.mockReturnValueOnce(null);

      const client = { guilds: { cache: new Map() }, user: { id: 'bot1' } };
      // Should not throw
      await checkAutoClose(client);
    });

    it('should skip tickets in unknown guilds', async () => {
      getConfig.mockReturnValue({
        tickets: { enabled: true, autoCloseHours: 48 },
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 4,
            guild_id: 'unknown-guild',
            thread_id: 'thread4',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const client = {
        guilds: { cache: new Map() }, // No guilds
        user: { id: 'bot1' },
      };

      await checkAutoClose(client);
      // checkAutoClose returns early (no guilds) before any query
      expect(mockQuery).toHaveBeenCalledTimes(0);
    });

    it('should handle message-fetch errors per ticket without throwing', async () => {
      getConfig.mockReturnValue({
        tickets: { enabled: true, autoCloseHours: 48 },
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 8,
            guild_id: 'guild1',
            thread_id: 'thread8',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const thread = createMockThread({ id: 'thread8' });
      thread.messages.fetch.mockRejectedValue(new Error('cannot fetch messages'));

      const guild = createMockGuild();
      guild.channels.fetch = vi.fn().mockResolvedValue(thread);

      const client = {
        guilds: { cache: new Map([['guild1', guild]]) },
        user: { id: 'bot1' },
      };

      await expect(checkAutoClose(client)).resolves.toBeUndefined();
    });

    it('should continue when ticket processing throws inside loop', async () => {
      getConfig.mockImplementation(() => {
        throw new Error('config failure');
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 88,
            guild_id: 'guild1',
            thread_id: 'thread88',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const guild = createMockGuild();
      const client = {
        guilds: { cache: new Map([['guild1', guild]]) },
        user: { id: 'bot1' },
      };

      await expect(checkAutoClose(client)).resolves.toBeUndefined();
    });

    it('should support discord Collection.find path for recent messages', async () => {
      getConfig.mockReturnValue({
        tickets: { enabled: true, autoCloseHours: 48 },
      });

      const almostOldDate = new Date(Date.now() - 50 * 60 * 60 * 1000);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 9,
            guild_id: 'guild1',
            thread_id: 'thread9',
            created_at: almostOldDate.toISOString(),
          },
        ],
      });

      const thread = createMockThread({ id: 'thread9' });
      const recentMessagesLikeCollection = {
        find: vi.fn((predicate) => {
          const msgs = [
            { author: { bot: true }, createdAt: new Date() },
            { author: { bot: false }, createdAt: almostOldDate },
          ];
          return msgs.find(predicate);
        }),
      };
      thread.messages.fetch.mockResolvedValue(recentMessagesLikeCollection);

      const guild = createMockGuild();
      guild.channels.fetch = vi.fn().mockResolvedValue(thread);

      const client = {
        guilds: { cache: new Map([['guild1', guild]]) },
        user: { id: 'bot1' },
      };

      await checkAutoClose(client);

      expect(recentMessagesLikeCollection.find).toHaveBeenCalledTimes(1);
      expect(mockSafeSend).toHaveBeenCalledWith(
        thread,
        expect.objectContaining({ content: expect.stringContaining('auto-closed in') }),
      );
    });

    it('should skip ticket when fetched channel is null', async () => {
      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rows: [] });
      getConfig.mockReturnValue({ tickets: { enabled: true, autoCloseHours: 48 } });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            guild_id: 'guild1',
            thread_id: 'missing-channel',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const guild = createMockGuild();
      guild.channels.fetch = vi.fn().mockResolvedValue(null);

      await checkAutoClose({
        guilds: { cache: new Map([['guild1', guild]]) },
        user: { id: 'bot1' },
      });

      expect(guild.channels.fetch).toHaveBeenCalledTimes(1);
      expect(mockSafeSend).not.toHaveBeenCalled();
    });

    it('should skip unsupported non-thread, non-text channels', async () => {
      getConfig.mockReturnValue({ tickets: { enabled: true, autoCloseHours: 48 } });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 11,
            guild_id: 'guild1',
            thread_id: 'voice1',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const voiceLikeChannel = {
        id: 'voice1',
        type: 2,
        isThread: () => false,
        messages: { fetch: vi.fn() },
      };

      const guild = createMockGuild();
      guild.channels.fetch = vi.fn().mockResolvedValue(voiceLikeChannel);

      await checkAutoClose({
        guilds: { cache: new Map([['guild1', guild]]) },
        user: { id: 'bot1' },
      });

      expect(voiceLikeChannel.messages.fetch).not.toHaveBeenCalled();
    });

    it('should not send duplicate warnings once warning was already sent', async () => {
      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rows: [] });
      getConfig.mockReturnValue({ tickets: { enabled: true, autoCloseHours: 48 } });
      const almostOldDate = new Date(Date.now() - 50 * 60 * 60 * 1000);

      const ticketRow = {
        id: 12,
        guild_id: 'guild1',
        thread_id: 'thread12',
        created_at: almostOldDate.toISOString(),
      };

      mockQuery.mockResolvedValue({ rows: [ticketRow] });

      const thread = createMockThread({ id: 'thread12' });
      thread.messages.fetch.mockResolvedValue(new Map([['msg1', { createdAt: almostOldDate }]]));

      const guild = createMockGuild();
      guild.channels.fetch = vi.fn().mockResolvedValue(thread);
      const client = {
        guilds: { cache: new Map([['guild1', guild]]) },
        user: { id: 'bot1' },
      };

      await checkAutoClose(client);
      expect(mockSafeSend).toHaveBeenCalledTimes(1);

      mockSafeSend.mockClear();
      await checkAutoClose(client);
      expect(mockSafeSend).not.toHaveBeenCalled();
    });
  });

  describe('openTicket edge paths', () => {
    it('should throw when no suitable thread parent channel can be resolved', async () => {
      getConfig.mockReturnValue({
        tickets: {
          enabled: true,
          mode: 'thread',
          supportRole: null,
          category: null,
          autoCloseHours: 48,
          transcriptChannel: null,
          maxOpenPerUser: 3,
        },
      });

      const guild = {
        id: 'guild1',
        channels: {
          cache: {
            get: vi.fn().mockReturnValue(undefined),
            find: vi.fn().mockReturnValue(undefined),
          },
        },
        roles: { cache: new Map() },
        members: { me: { id: 'bot1' } },
      };

      const user = createMockUser();

      mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });

      await expect(openTicket(guild, user, 'help', null)).rejects.toThrow(
        'No suitable channel found to create a ticket thread.',
      );
    });
  });

  describe('closeTicket edge paths', () => {
    it('should swallow transcript channel send errors', async () => {
      getConfig.mockReturnValue({
        tickets: {
          enabled: true,
          mode: 'thread',
          supportRole: null,
          category: null,
          autoCloseHours: 48,
          transcriptChannel: 'transcript-ch',
          maxOpenPerUser: 3,
        },
      });

      const transcriptChannel = { id: 'transcript-ch' };
      const thread = createMockThread({
        guild: {
          id: 'guild1',
          channels: { cache: new Map([['transcript-ch', transcriptChannel]]) },
        },
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 16, guild_id: 'guild1', user_id: 'user1', thread_id: 'thread1' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 16, status: 'closed' }],
      });

      mockSafeSend.mockImplementation((target) => {
        if (target?.id === 'transcript-ch') {
          return Promise.reject(new Error('missing perms'));
        }
        return Promise.resolve(undefined);
      });

      await expect(closeTicket(thread, createMockUser({ id: 'closer2' }), 'Done')).resolves.toEqual(
        expect.objectContaining({ id: 16 }),
      );
    });

    it('should skip transcript send when configured channel is missing', async () => {
      getConfig.mockReturnValue({
        tickets: {
          enabled: true,
          mode: 'thread',
          supportRole: null,
          category: null,
          autoCloseHours: 48,
          transcriptChannel: 'transcript-ch',
          maxOpenPerUser: 3,
        },
      });

      const thread = createMockThread({
        guild: {
          id: 'guild1',
          channels: { cache: new Map() },
        },
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 15, guild_id: 'guild1', user_id: 'user1', thread_id: 'thread1' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 15, status: 'closed' }],
      });

      await closeTicket(thread, createMockUser({ id: 'closer1' }), 'Done');

      // Only one safeSend call: close embed in current ticket channel.
      expect(mockSafeSend).toHaveBeenCalledTimes(1);
      expect(mockSafeSend).toHaveBeenCalledWith(
        thread,
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });
  });
});
