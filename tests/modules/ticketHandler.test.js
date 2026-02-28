/**
 * Tests for src/modules/ticketHandler.js
 * Covers openTicket, closeTicket, addMember, removeMember,
 * checkAutoClose, buildTicketPanel, getTicketConfig.
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
import { getPool } from '../../src/db.js';
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

function createMockGuild(overrides = {}) {
  const botMember = {
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
      expect(config.supportRole).toBe('role1');
      expect(config.autoCloseHours).toBe(48);
      expect(config.maxOpenPerUser).toBe(3);
    });

    it('should use defaults when no tickets config', () => {
      getConfig.mockReturnValueOnce({});
      const config = getTicketConfig('guild2');
      expect(config.enabled).toBe(false);
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
  });

  // ─── openTicket ───────────────────────────────────────────────

  describe('openTicket', () => {
    it('should create a ticket successfully', async () => {
      const guild = createMockGuild();
      const user = createMockUser();

      // Count query: 0 open tickets
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      // Insert query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, guild_id: 'guild1', user_id: 'user1', topic: 'test', thread_id: 'thread1' }],
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
        rows: [{ id: 1, guild_id: 'guild1', user_id: 'user1', topic: 'test', thread_id: 'thread1' }],
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

  // ─── closeTicket ──────────────────────────────────────────────

  describe('closeTicket', () => {
    it('should close a ticket and save transcript', async () => {
      const closer = createMockUser({ id: 'closer1', tag: 'Closer#1234' });
      const messages = new Map([
        ['msg1', {
          author: { tag: 'User#1234', id: 'user1' },
          content: 'Hello',
          createdAt: new Date('2024-01-01'),
        }],
        ['msg2', {
          author: { tag: 'Staff#5678', id: 'staff1' },
          content: 'How can I help?',
          createdAt: new Date('2024-01-01T00:01:00'),
        }],
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
        rows: [{
          id: 1,
          guild_id: 'guild1',
          user_id: 'user1',
          topic: 'test',
          thread_id: 'thread1',
        }],
      });
      // UPDATE ticket
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          status: 'closed',
          closed_by: 'closer1',
          close_reason: 'Resolved',
        }],
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

      await expect(closeTicket(thread, closer, 'Done')).rejects.toThrow(
        'No open ticket found',
      );
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

  // ─── addMember / removeMember ─────────────────────────────────

  describe('addMember', () => {
    it('should add a user to the thread', async () => {
      const thread = createMockThread();
      const user = createMockUser({ id: 'newuser' });

      await addMember(thread, user);
      expect(thread.members.add).toHaveBeenCalledWith('newuser');
      expect(mockSafeSend).toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('should remove a user from the thread', async () => {
      const thread = createMockThread();
      const user = createMockUser({ id: 'olduser' });

      await removeMember(thread, user);
      expect(thread.members.remove).toHaveBeenCalledWith('olduser');
      expect(mockSafeSend).toHaveBeenCalled();
    });
  });

  // ─── checkAutoClose ───────────────────────────────────────────

  describe('checkAutoClose', () => {
    it('should skip tickets in guilds where tickets are disabled', async () => {
      getConfig.mockReturnValue({ tickets: { enabled: false } });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, guild_id: 'guild1', thread_id: 'thread1', created_at: new Date().toISOString() }],
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
        rows: [{
          id: 1,
          guild_id: 'guild1',
          thread_id: 'thread1',
          created_at: oldDate.toISOString(),
        }],
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

    it('should send warning for tickets past autoCloseHours but not total threshold', async () => {
      getConfig.mockReturnValue({
        tickets: { enabled: true, autoCloseHours: 48 },
      });

      const almostOldDate = new Date(Date.now() - 50 * 60 * 60 * 1000); // 50 hours ago

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 2,
          guild_id: 'guild1',
          thread_id: 'thread2',
          created_at: almostOldDate.toISOString(),
        }],
      });

      const lastMsg = {
        createdAt: almostOldDate,
      };

      const thread = createMockThread({ id: 'thread2' });
      thread.messages.fetch
        .mockResolvedValueOnce(new Map([['msg1', lastMsg]])) // limit: 1
        .mockResolvedValueOnce(new Map()); // limit: 5 (no warning yet)

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
        rows: [{ id: 3, guild_id: 'guild1', thread_id: 'thread-gone', created_at: new Date().toISOString() }],
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
        rows: [{ id: 4, guild_id: 'unknown-guild', thread_id: 'thread4', created_at: new Date().toISOString() }],
      });

      const client = {
        guilds: { cache: new Map() }, // No guilds
        user: { id: 'bot1' },
      };

      await checkAutoClose(client);
      // Should not throw and should not call any more queries
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });
});
