/**
 * Tests for src/api/routes/conversations.js
 * Covers conversation listing, detail, search, flag CRUD, stats,
 * and conversation grouping logic (15-min gap).
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    permissions: { botOwners: [] },
  }),
  setConfigValue: vi.fn(),
}));

vi.mock('../../../src/api/middleware/oauthJwt.js', () => ({
  handleOAuthJwt: vi.fn().mockResolvedValue(false),
  stopJwtCleanup: vi.fn(),
}));

import { groupMessagesIntoConversations } from '../../../src/api/routes/conversations.js';
import { createApp } from '../../../src/api/server.js';

const TEST_SECRET = 'test-conversations-secret';

/** Wrap request with auth header */
function authed(req) {
  return req.set('x-api-secret', TEST_SECRET);
}

describe('conversations routes', () => {
  let app;
  let mockPool;

  const mockChannel = {
    id: 'ch1',
    name: 'general',
    type: 0,
  };

  const mockGuild = {
    id: 'guild1',
    name: 'Test Server',
    iconURL: () => 'https://cdn.example.com/icon.png',
    memberCount: 100,
    channels: { cache: new Map([['ch1', mockChannel]]) },
    roles: { cache: new Map() },
    members: { cache: new Map() },
  };

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn(),
    };

    const client = {
      guilds: { cache: new Map([['guild1', mockGuild]]) },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };

    app = createApp(client, mockPool);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // ─── Grouping Logic ──────────────────────────────────────────────────

  describe('groupMessagesIntoConversations', () => {
    it('should return empty array for empty input', () => {
      expect(groupMessagesIntoConversations([])).toEqual([]);
      expect(groupMessagesIntoConversations(null)).toEqual([]);
    });

    it('should group messages in the same channel within 15-minute window', () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');
      const rows = [
        {
          id: 1,
          channel_id: 'ch1',
          role: 'user',
          content: 'Hello',
          username: 'alice',
          created_at: baseTime.toISOString(),
        },
        {
          id: 2,
          channel_id: 'ch1',
          role: 'assistant',
          content: 'Hi!',
          username: 'bot',
          created_at: new Date(baseTime.getTime() + 5 * 60 * 1000).toISOString(),
        },
        {
          id: 3,
          channel_id: 'ch1',
          role: 'user',
          content: 'Thanks',
          username: 'alice',
          created_at: new Date(baseTime.getTime() + 10 * 60 * 1000).toISOString(),
        },
      ];

      const result = groupMessagesIntoConversations(rows);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].messages).toHaveLength(3);
    });

    it('should split conversations at 15-minute gap', () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');
      const rows = [
        {
          id: 1,
          channel_id: 'ch1',
          role: 'user',
          content: 'First convo',
          username: 'alice',
          created_at: baseTime.toISOString(),
        },
        {
          id: 2,
          channel_id: 'ch1',
          role: 'assistant',
          content: 'Reply',
          username: 'bot',
          created_at: new Date(baseTime.getTime() + 2 * 60 * 1000).toISOString(),
        },
        // 20-minute gap
        {
          id: 3,
          channel_id: 'ch1',
          role: 'user',
          content: 'Second convo',
          username: 'alice',
          created_at: new Date(baseTime.getTime() + 22 * 60 * 1000).toISOString(),
        },
        {
          id: 4,
          channel_id: 'ch1',
          role: 'assistant',
          content: 'Reply 2',
          username: 'bot',
          created_at: new Date(baseTime.getTime() + 24 * 60 * 1000).toISOString(),
        },
      ];

      const result = groupMessagesIntoConversations(rows);
      expect(result).toHaveLength(2);
      // Most recent first
      expect(result[0].id).toBe(3);
      expect(result[0].messages).toHaveLength(2);
      expect(result[1].id).toBe(1);
      expect(result[1].messages).toHaveLength(2);
    });

    it('should separate conversations by channel', () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');
      const rows = [
        {
          id: 1,
          channel_id: 'ch1',
          role: 'user',
          content: 'Channel 1 msg',
          username: 'alice',
          created_at: baseTime.toISOString(),
        },
        {
          id: 2,
          channel_id: 'ch2',
          role: 'user',
          content: 'Channel 2 msg',
          username: 'bob',
          created_at: baseTime.toISOString(),
        },
      ];

      const result = groupMessagesIntoConversations(rows);
      expect(result).toHaveLength(2);
    });

    it('should handle exact 15-minute boundary as new conversation', () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');
      const rows = [
        {
          id: 1,
          channel_id: 'ch1',
          role: 'user',
          content: 'msg1',
          username: 'alice',
          created_at: baseTime.toISOString(),
        },
        // Exactly 15 minutes + 1ms gap
        {
          id: 2,
          channel_id: 'ch1',
          role: 'user',
          content: 'msg2',
          username: 'alice',
          created_at: new Date(baseTime.getTime() + 15 * 60 * 1000 + 1).toISOString(),
        },
      ];

      const result = groupMessagesIntoConversations(rows);
      expect(result).toHaveLength(2);
    });

    it('should handle messages exactly at 15-minute mark as same conversation', () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');
      const rows = [
        {
          id: 1,
          channel_id: 'ch1',
          role: 'user',
          content: 'msg1',
          username: 'alice',
          created_at: baseTime.toISOString(),
        },
        // Exactly 15 minutes gap (not exceeded)
        {
          id: 2,
          channel_id: 'ch1',
          role: 'user',
          content: 'msg2',
          username: 'alice',
          created_at: new Date(baseTime.getTime() + 15 * 60 * 1000).toISOString(),
        },
      ];

      const result = groupMessagesIntoConversations(rows);
      expect(result).toHaveLength(1);
    });

    it('should sort conversations by most recent first', () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');
      const rows = [
        {
          id: 1,
          channel_id: 'ch1',
          role: 'user',
          content: 'old',
          username: 'alice',
          created_at: baseTime.toISOString(),
        },
        {
          id: 2,
          channel_id: 'ch1',
          role: 'user',
          content: 'new',
          username: 'alice',
          created_at: new Date(baseTime.getTime() + 60 * 60 * 1000).toISOString(),
        },
      ];

      const result = groupMessagesIntoConversations(rows);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2); // newer first
    });
  });

  // ─── GET /conversations — List ───────────────────────────────────────

  describe('GET /guilds/:id/conversations', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/guilds/guild1/conversations');
      expect(res.status).toBe(401);
    });

    it('should return 404 for unknown guild', async () => {
      const res = await authed(request(app).get('/api/v1/guilds/unknown/conversations'));
      expect(res.status).toBe(404);
    });

    it('should return 503 when database is not available', async () => {
      const noDbApp = createApp(
        {
          guilds: { cache: new Map([['guild1', mockGuild]]) },
          ws: { status: 0, ping: 42 },
          user: { tag: 'Bot#1234' },
        },
        null,
      );
      const res = await authed(request(noDbApp).get('/api/v1/guilds/guild1/conversations'));
      expect(res.status).toBe(503);
    });

    it('should return paginated conversations', async () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');
      // Mock returns rows in DESC order (newest first), matching ORDER BY created_at DESC.
      // The route reverses them before grouping so the conversation anchor is still the oldest message.
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            channel_id: 'ch1',
            role: 'assistant',
            content: 'Hi there!',
            username: 'bot',
            created_at: new Date(baseTime.getTime() + 60000).toISOString(),
          },
          {
            id: 1,
            channel_id: 'ch1',
            role: 'user',
            content: 'Hello world',
            username: 'alice',
            created_at: baseTime.toISOString(),
          },
        ],
      });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/conversations'));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('conversations');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body.conversations).toHaveLength(1);
      expect(res.body.conversations[0]).toHaveProperty('id', 1);
      expect(res.body.conversations[0]).toHaveProperty('channelId', 'ch1');
      expect(res.body.conversations[0]).toHaveProperty('channelName', 'general');
      expect(res.body.conversations[0]).toHaveProperty('messageCount', 2);
      expect(res.body.conversations[0]).toHaveProperty('preview');
      expect(res.body.conversations[0].participants).toBeInstanceOf(Array);
    });

    it('should support search query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/conversations?search=hello'),
      );

      expect(res.status).toBe(200);
      // Verify the search param was passed to the query
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('ILIKE');
      expect(queryCall[1]).toContain('%hello%');
    });

    it('should escape % wildcards in ILIKE search query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/conversations?search=100%25off'),
      );

      expect(res.status).toBe(200);
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('ILIKE');
      // % must be escaped to \% so it doesn't act as a wildcard
      const searchParam = queryCall[1].find((v) => typeof v === 'string' && v.includes('\\%'));
      expect(searchParam).toBeDefined();
      expect(searchParam).toBe('%100\\%off%');
    });

    it('should escape _ wildcards in ILIKE search query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/conversations?search=some_thing'),
      );

      expect(res.status).toBe(200);
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('ILIKE');
      // _ must be escaped to \_ so it doesn't act as a single-char wildcard
      const searchParam = queryCall[1].find((v) => typeof v === 'string' && v.includes('\\_'));
      expect(searchParam).toBeDefined();
      expect(searchParam).toBe('%some\\_thing%');
    });

    it('should escape backslash in ILIKE search query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // URL-encoded backslash (%5C) in search term
      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/conversations?search=path%5Cfile'),
      );

      expect(res.status).toBe(200);
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('ILIKE');
      // Backslash must be escaped to \\\\ so it does not act as an escape character in ILIKE
      const searchParam = queryCall[1].find((v) => typeof v === 'string' && v.includes('\\\\'));
      expect(searchParam).toBeDefined();
      expect(searchParam).toBe('%path\\\\file%');
    });

    it('should support channel filter', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/conversations?channel=ch1'));

      expect(res.status).toBe(200);
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('channel_id');
      expect(queryCall[1]).toContain('ch1');
    });

    it('should support user filter', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/conversations?user=alice'));

      expect(res.status).toBe(200);
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('username');
      expect(queryCall[1]).toContain('alice');
    });

    it('should support date range filters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/conversations?from=2024-01-01&to=2024-01-31'),
      );

      expect(res.status).toBe(200);
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('created_at >=');
      expect(queryCall[0]).toContain('created_at <=');
    });

    it('should handle pagination params', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/conversations?page=2&limit=10'),
      );

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
    });

    it('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const res = await authed(request(app).get('/api/v1/guilds/guild1/conversations'));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch conversations');
    });
  });

  // ─── GET /conversations/:conversationId — Detail ──────────────────────

  describe('GET /guilds/:id/conversations/:conversationId', () => {
    it('should return 400 for non-numeric conversation ID', async () => {
      const res = await authed(request(app).get('/api/v1/guilds/guild1/conversations/abc'));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid conversation ID');
    });

    it('should return 404 when conversation not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // anchor query

      const res = await authed(request(app).get('/api/v1/guilds/guild1/conversations/999'));

      expect(res.status).toBe(404);
    });

    it('should return conversation detail with messages', async () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');

      // Anchor query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, channel_id: 'ch1', created_at: baseTime.toISOString() }],
      });

      // All messages in channel
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            channel_id: 'ch1',
            role: 'user',
            content: 'Hello',
            username: 'alice',
            created_at: baseTime.toISOString(),
          },
          {
            id: 2,
            channel_id: 'ch1',
            role: 'assistant',
            content: 'Hi there! How can I help you today?',
            username: 'bot',
            created_at: new Date(baseTime.getTime() + 60000).toISOString(),
          },
        ],
      });

      // Flags query
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/conversations/1'));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('messages');
      expect(res.body.messages).toHaveLength(2);
      expect(res.body).toHaveProperty('channelId', 'ch1');
      expect(res.body).toHaveProperty('duration');
      expect(res.body).toHaveProperty('tokenEstimate');
      expect(res.body.tokenEstimate).toBeGreaterThan(0);
    });

    it('should include flag status on messages', async () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, channel_id: 'ch1', created_at: baseTime.toISOString() }],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            channel_id: 'ch1',
            role: 'user',
            content: 'Hello',
            username: 'alice',
            created_at: baseTime.toISOString(),
          },
          {
            id: 2,
            channel_id: 'ch1',
            role: 'assistant',
            content: 'Response',
            username: 'bot',
            created_at: new Date(baseTime.getTime() + 60000).toISOString(),
          },
        ],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [{ message_id: 2, status: 'open' }],
      });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/conversations/1'));

      expect(res.status).toBe(200);
      expect(res.body.messages[0].flagStatus).toBeNull();
      expect(res.body.messages[1].flagStatus).toBe('open');
    });
  });

  // ─── POST /conversations/:conversationId/flag — Flag ──────────────────

  describe('POST /guilds/:id/conversations/:conversationId/flag', () => {
    it('should return 400 for missing messageId', async () => {
      const res = await authed(
        request(app).post('/api/v1/guilds/guild1/conversations/1/flag').send({ reason: 'test' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('messageId');
    });

    it('should return 400 for missing reason', async () => {
      const res = await authed(
        request(app).post('/api/v1/guilds/guild1/conversations/1/flag').send({ messageId: 1 }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('reason');
    });

    it('should return 400 for empty reason', async () => {
      const res = await authed(
        request(app)
          .post('/api/v1/guilds/guild1/conversations/1/flag')
          .send({ messageId: 1, reason: '   ' }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 for reason exceeding 500 chars', async () => {
      const res = await authed(
        request(app)
          .post('/api/v1/guilds/guild1/conversations/1/flag')
          .send({ messageId: 1, reason: 'x'.repeat(501) }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('500');
    });

    it('should return 400 for notes exceeding 2000 chars', async () => {
      const res = await authed(
        request(app)
          .post('/api/v1/guilds/guild1/conversations/1/flag')
          .send({ messageId: 1, reason: 'test', notes: 'x'.repeat(2001) }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('2000');
    });

    it('should return 404 for non-existent message', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // msg check

      const res = await authed(
        request(app)
          .post('/api/v1/guilds/guild1/conversations/1/flag')
          .send({ messageId: 999, reason: 'inaccurate' }),
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Message not found');
    });

    it('should successfully flag a message', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 5, channel_id: 'ch1', created_at: new Date().toISOString() }],
      }); // msg check
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, channel_id: 'ch1', created_at: new Date().toISOString() }],
      }); // anchor check
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'open' }],
      }); // insert

      const res = await authed(
        request(app)
          .post('/api/v1/guilds/guild1/conversations/1/flag')
          .send({ messageId: 5, reason: 'inaccurate', notes: 'Wrong answer' }),
      );

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('flagId', 1);
      expect(res.body).toHaveProperty('status', 'open');
    });

    it('should return 400 for invalid conversation ID', async () => {
      const res = await authed(
        request(app)
          .post('/api/v1/guilds/guild1/conversations/abc/flag')
          .send({ messageId: 1, reason: 'test' }),
      );
      expect(res.status).toBe(400);
    });

    it('should handle notes as optional', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 5, channel_id: 'ch1', created_at: new Date().toISOString() }],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, channel_id: 'ch1', created_at: new Date().toISOString() }],
      }); // anchor check
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'open' }],
      });

      const res = await authed(
        request(app)
          .post('/api/v1/guilds/guild1/conversations/1/flag')
          .send({ messageId: 5, reason: 'inappropriate' }),
      );

      expect(res.status).toBe(201);
    });

    it('should reject non-string notes', async () => {
      const res = await authed(
        request(app)
          .post('/api/v1/guilds/guild1/conversations/1/flag')
          .send({ messageId: 5, reason: 'test', notes: 123 }),
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('notes');
    });
  });

  // ─── GET /conversations/flags — List flags ────────────────────────────

  describe('GET /guilds/:id/conversations/flags', () => {
    it('should return paginated flags', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] }); // count
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            guild_id: 'guild1',
            conversation_first_id: 1,
            message_id: 5,
            flagged_by: 'user1',
            reason: 'inaccurate',
            notes: null,
            status: 'open',
            resolved_by: null,
            resolved_at: null,
            created_at: '2024-01-15T10:00:00Z',
            message_content: 'Wrong answer',
            message_role: 'assistant',
            message_username: 'bot',
          },
        ],
      });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/conversations/flags'));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('flags');
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body.flags).toHaveLength(1);
      expect(res.body.flags[0]).toHaveProperty('reason', 'inaccurate');
    });

    it('should filter by status', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/conversations/flags?status=resolved'),
      );

      expect(res.status).toBe(200);
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('fm.status');
      expect(queryCall[1]).toContain('resolved');
    });

    it('should ignore invalid status values', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(
        request(app).get('/api/v1/guilds/guild1/conversations/flags?status=invalid'),
      );

      expect(res.status).toBe(200);
      // No status filter should be applied
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).not.toContain('fm.status =');
    });
  });

  // ─── GET /conversations/stats — Analytics ─────────────────────────────

  describe('GET /guilds/:id/conversations/stats', () => {
    it('should return conversation analytics', async () => {
      // Total messages
      mockPool.query.mockResolvedValueOnce({ rows: [{ total_messages: 42 }] });
      // Top users
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { username: 'alice', message_count: 20 },
          { username: 'bob', message_count: 15 },
        ],
      });
      // Daily activity
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { date: '2024-01-15', count: 10 },
          { date: '2024-01-14', count: 8 },
        ],
      });
      // Token chars
      mockPool.query.mockResolvedValueOnce({ rows: [{ total_chars: 4000 }] });
      // Conversation count (SQL window-function grouping)
      mockPool.query.mockResolvedValueOnce({ rows: [{ total_conversations: 2 }] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/conversations/stats'));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalConversations', 2);
      expect(res.body).toHaveProperty('totalMessages', 42);
      expect(res.body).toHaveProperty('avgMessagesPerConversation');
      expect(res.body).toHaveProperty('topUsers');
      expect(res.body.topUsers).toHaveLength(2);
      expect(res.body).toHaveProperty('dailyActivity');
      expect(res.body).toHaveProperty('estimatedTokens', 1000);
    });

    it('should handle empty stats gracefully', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      // Override first call for total
      mockPool.query.mockResolvedValueOnce({ rows: [{ total_messages: 0 }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ total_chars: 0 }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await authed(request(app).get('/api/v1/guilds/guild1/conversations/stats'));

      expect(res.status).toBe(200);
      expect(res.body.totalConversations).toBe(0);
      expect(res.body.totalMessages).toBe(0);
      expect(res.body.avgMessagesPerConversation).toBe(0);
      expect(res.body.estimatedTokens).toBe(0);
    });
  });

  // ─── Auth + Error handling ──────────────────────────────────────────────

  describe('authentication and error handling', () => {
    it('should require auth on all endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/v1/guilds/guild1/conversations' },
        { method: 'get', path: '/api/v1/guilds/guild1/conversations/1' },
        { method: 'get', path: '/api/v1/guilds/guild1/conversations/stats' },
        { method: 'get', path: '/api/v1/guilds/guild1/conversations/flags' },
        { method: 'post', path: '/api/v1/guilds/guild1/conversations/1/flag' },
      ];

      for (const { method, path } of endpoints) {
        const res = await request(app)[method](path);
        expect(res.status).toBe(401);
      }
    });

    it('should validate guild exists on all endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/v1/guilds/nonexistent/conversations' },
        { method: 'get', path: '/api/v1/guilds/nonexistent/conversations/1' },
        { method: 'get', path: '/api/v1/guilds/nonexistent/conversations/stats' },
        { method: 'get', path: '/api/v1/guilds/nonexistent/conversations/flags' },
        { method: 'post', path: '/api/v1/guilds/nonexistent/conversations/1/flag' },
      ];

      for (const { method, path } of endpoints) {
        const res = await authed(request(app)[method](path));
        expect(res.status).toBe(404);
      }
    });
  });
});
