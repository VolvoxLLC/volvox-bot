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
  safeSend: vi.fn().mockResolvedValue(undefined),
  safeReply: vi.fn().mockResolvedValue(undefined),
}));

// Mock afk command's buildPingSummary so we don't need its DB queries in handler tests
vi.mock('../../src/commands/afk.js', () => ({
  buildPingSummary: vi.fn((pings) =>
    pings.length === 0 ? '\n\nNo one pinged you.' : `\n\nPings: ${pings.length}`,
  ),
}));

import { getPool } from '../../src/db.js';
import { getConfig } from '../../src/modules/config.js';
import { safeSend } from '../../src/utils/safeSend.js';
import { clearRateLimitCache, handleAfkMentions } from '../../src/modules/afkHandler.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMessage(overrides = {}) {
  return {
    guild: { id: 'guild1' },
    author: {
      id: 'sender1',
      bot: false,
      createDM: vi.fn().mockResolvedValue({ send: vi.fn() }),
    },
    channel: { id: 'ch1', send: vi.fn() },
    content: 'hello world',
    mentions: {
      users: new Map(),
    },
    ...overrides,
  };
}

function makePool(queryImpl) {
  return { query: queryImpl ?? vi.fn().mockResolvedValue({ rows: [] }) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('afkHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearRateLimitCache();
  });

  // ── Config gate ─────────────────────────────────────────────────────────────

  describe('config gate', () => {
    it('does nothing when afk.enabled is false', async () => {
      getConfig.mockReturnValue({ afk: { enabled: false } });
      const pool = makePool();
      getPool.mockReturnValue(pool);

      const message = makeMessage();
      await handleAfkMentions(message);

      expect(pool.query).not.toHaveBeenCalled();
    });

    it('does nothing when afk config is missing', async () => {
      getConfig.mockReturnValue({});
      const pool = makePool();
      getPool.mockReturnValue(pool);

      const message = makeMessage();
      await handleAfkMentions(message);

      expect(pool.query).not.toHaveBeenCalled();
    });

    it('does nothing when message has no guild', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });
      const pool = makePool();
      getPool.mockReturnValue(pool);

      const message = makeMessage({ guild: null });
      await handleAfkMentions(message);

      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  // ── Sender is AFK ───────────────────────────────────────────────────────────

  describe('sender AFK auto-clear', () => {
    it('clears AFK and DMs sender when they send a message', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });

      const dm = { send: vi.fn() };
      const author = {
        id: 'sender1',
        bot: false,
        createDM: vi.fn().mockResolvedValue(dm),
      };

      const pool = {
        query: vi
          .fn()
          // SELECT afk_status (sender is AFK)
          .mockResolvedValueOnce({ rows: [{ id: 1, reason: 'Sleeping' }] })
          // SELECT afk_pings
          .mockResolvedValueOnce({ rows: [] })
          // DELETE afk_status
          .mockResolvedValueOnce({ rows: [] })
          // DELETE afk_pings
          .mockResolvedValueOnce({ rows: [] }),
      };
      getPool.mockReturnValue(pool);

      const message = makeMessage({ author, mentions: { users: new Map() } });
      await handleAfkMentions(message);

      // Should delete AFK status
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM afk_status'),
        ['guild1', 'sender1'],
      );

      // Should DM user
      expect(author.createDM).toHaveBeenCalled();
      expect(safeSend).toHaveBeenCalledWith(dm, expect.objectContaining({ content: expect.stringContaining('Welcome back') }));
    });

    it('does not crash if DM fails', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });

      const author = {
        id: 'sender1',
        bot: false,
        createDM: vi.fn().mockRejectedValue(new Error('DM closed')),
      };

      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      getPool.mockReturnValue(pool);

      const message = makeMessage({ author, mentions: { users: new Map() } });
      // Should NOT throw
      await expect(handleAfkMentions(message)).resolves.toBeUndefined();
    });

    it('does not clear AFK for non-AFK sender', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });

      const pool = {
        query: vi
          .fn()
          // SELECT afk_status → not found
          .mockResolvedValueOnce({ rows: [] }),
      };
      getPool.mockReturnValue(pool);

      const message = makeMessage({ mentions: { users: new Map() } });
      await handleAfkMentions(message);

      expect(pool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM afk_status'),
        expect.anything(),
      );
    });
  });

  // ── Mentioning AFK user ─────────────────────────────────────────────────────

  describe('mentioning AFK users', () => {
    it('sends inline AFK notice when an AFK user is mentioned', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });

      const afkUser = { id: 'afkUser1', bot: false, displayName: 'AFK Person', username: 'afkperson' };
      const mentions = new Map([['afkUser1', afkUser]]);

      const pool = {
        query: vi
          .fn()
          // SELECT afk_status for sender → not AFK
          .mockResolvedValueOnce({ rows: [] })
          // SELECT afk_status for mentioned user → AFK
          .mockResolvedValueOnce({
            rows: [{ id: 2, user_id: 'afkUser1', reason: 'Lunch', set_at: new Date() }],
          })
          // INSERT afk_pings
          .mockResolvedValueOnce({ rows: [] }),
      };
      getPool.mockReturnValue(pool);

      const channel = { id: 'ch1', send: vi.fn() };
      const message = makeMessage({ channel, mentions: { users: mentions } });
      await handleAfkMentions(message);

      expect(safeSend).toHaveBeenCalledWith(
        channel,
        expect.objectContaining({ content: expect.stringContaining('AFK Person') }),
      );
      expect(safeSend).toHaveBeenCalledWith(
        channel,
        expect.objectContaining({ content: expect.stringContaining('Lunch') }),
      );
    });

    it('tracks ping in afk_pings table', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });

      const afkUser = { id: 'afkUser1', bot: false, displayName: 'Test', username: 'test' };
      const mentions = new Map([['afkUser1', afkUser]]);

      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [] }) // sender not AFK
          .mockResolvedValueOnce({
            rows: [{ id: 2, user_id: 'afkUser1', reason: 'Out', set_at: new Date() }],
          })
          .mockResolvedValueOnce({ rows: [] }), // INSERT ping
      };
      getPool.mockReturnValue(pool);

      const message = makeMessage({ mentions: { users: mentions } });
      await handleAfkMentions(message);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO afk_pings'),
        expect.arrayContaining(['guild1', 'afkUser1', 'sender1', 'ch1']),
      );
    });

    it('does not notify for non-AFK users', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });

      const user = { id: 'user2', bot: false, displayName: 'RegularUser', username: 'regular' };
      const mentions = new Map([['user2', user]]);

      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [] }) // sender not AFK
          .mockResolvedValueOnce({ rows: [] }), // mentioned user not AFK
      };
      getPool.mockReturnValue(pool);

      const message = makeMessage({ mentions: { users: mentions } });
      await handleAfkMentions(message);

      expect(safeSend).not.toHaveBeenCalled();
    });

    it('skips bot users in mentions', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });

      const botUser = { id: 'bot1', bot: true, displayName: 'MyBot', username: 'mybot' };
      const mentions = new Map([['bot1', botUser]]);

      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [] }), // sender not AFK
      };
      getPool.mockReturnValue(pool);

      const message = makeMessage({ mentions: { users: mentions } });
      await handleAfkMentions(message);

      // Only one query (sender check), no mention query for bot
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('skips self-mentions', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });

      const selfUser = { id: 'sender1', bot: false, displayName: 'Me', username: 'me' };
      const mentions = new Map([['sender1', selfUser]]);

      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [] }), // sender not AFK
      };
      getPool.mockReturnValue(pool);

      const message = makeMessage({ mentions: { users: mentions } });
      await handleAfkMentions(message);

      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(safeSend).not.toHaveBeenCalled();
    });
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('only sends one AFK notice per user per channel within 5 minutes', async () => {
      getConfig.mockReturnValue({ afk: { enabled: true } });

      const afkUser = { id: 'afkUser1', bot: false, displayName: 'Away', username: 'away' };
      const mentions = new Map([['afkUser1', afkUser]]);

      const pool = {
        query: vi
          .fn()
          // Round 1: sender not AFK, user IS AFK, ping insert
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'afkUser1', reason: 'BRB', set_at: new Date() }] })
          .mockResolvedValueOnce({ rows: [] })
          // Round 2: sender not AFK, user IS AFK (rate limited — no ping insert)
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'afkUser1', reason: 'BRB', set_at: new Date() }] }),
      };
      getPool.mockReturnValue(pool);

      const message = makeMessage({ mentions: { users: mentions } });

      // First message — should send notice
      await handleAfkMentions(message);
      expect(safeSend).toHaveBeenCalledTimes(1);

      // Second message immediately after — should be rate limited
      await handleAfkMentions(message);
      expect(safeSend).toHaveBeenCalledTimes(1); // still 1
    });
  });
});
