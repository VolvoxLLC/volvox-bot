/**
 * Tests for src/api/ws/auditStream.js
 * Covers connection lifecycle, auth, filtering, and broadcast.
 */
import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import {
  broadcastAuditEntry,
  getAuditStreamClientCount,
  setupAuditStream,
  stopAuditStream,
} from '../../../src/api/ws/auditStream.js';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const TEST_SECRET = 'audit-stream-test-secret';

function makeTicket(guildId = 'guild1', secret = TEST_SECRET, ttlMs = 60_000) {
  const nonce = randomBytes(16).toString('hex');
  const expiry = String(Date.now() + ttlMs);
  const hmac = createHmac('sha256', secret)
    .update(`${nonce}.${expiry}.${guildId}`)
    .digest('hex');
  return `${nonce}.${expiry}.${guildId}.${hmac}`;
}

function createTestServer() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

function connectWs(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/audit-log`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function createMessageQueue(ws) {
  const queue = [];
  const waiters = [];

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (waiters.length > 0) {
      waiters.shift().resolve(msg);
    } else {
      queue.push(msg);
    }
  });

  return {
    next(timeoutMs = 3000) {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve: (msg) => {
            clearTimeout(timer);
            resolve(msg);
          },
        };
        const timer = setTimeout(() => {
          const idx = waiters.indexOf(waiter);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error('Message timeout'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
  };
}

function waitForClose(ws, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve(1000);
    const timer = setTimeout(() => reject(new Error('Close timeout')), timeoutMs);
    ws.once('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function sendJson(ws, data) {
  ws.send(JSON.stringify(data));
}

describe('Audit Log WebSocket Stream', () => {
  let httpServer;
  let port;

  beforeEach(async () => {
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);
    // Use short auth timeout for faster tests (100ms instead of 10s)
    vi.stubEnv('AUDIT_STREAM_AUTH_TIMEOUT_MS', '100');
    const result = await createTestServer();
    httpServer = result.server;
    port = result.port;
    await setupAuditStream(httpServer);
  });

  afterEach(async () => {
    await stopAuditStream();
    await new Promise((resolve) => httpServer.close(resolve));
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  // ─── Connection lifecycle ─────────────────────────────────────────────────

  it('should accept WebSocket connections on /ws/audit-log', async () => {
    const ws = await connectWs(port);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('should close unauthenticated clients after auth timeout', async () => {
    const ws = await connectWs(port);
    // We don't send auth — wait for close with code 4001 (uses 100ms timeout from env)
    const code = await waitForClose(ws, 500);
    expect(code).toBe(4001);
  }, 2_000);

  // ─── Authentication ───────────────────────────────────────────────────────

  it('should authenticate with a valid ticket', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    const msg = await q.next();
    expect(msg.type).toBe('auth_ok');
    expect(getAuditStreamClientCount()).toBe(1);
    ws.close();
    await waitForClose(ws);
  });

  it('should reject an invalid ticket', async () => {
    const ws = await connectWs(port);
    sendJson(ws, { type: 'auth', ticket: 'bad.ticket.here' });
    const code = await waitForClose(ws);
    expect(code).toBe(4003);
  });

  it('should reject an expired ticket', async () => {
    const ws = await connectWs(port);
    const expired = makeTicket('guild1', TEST_SECRET, -1000);
    sendJson(ws, { type: 'auth', ticket: expired });
    const code = await waitForClose(ws);
    expect(code).toBe(4003);
  });

  it('should reject double auth', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    await q.next(); // auth_ok
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    const msg = await q.next();
    expect(msg.type).toBe('error');
    ws.close();
    await waitForClose(ws);
  });

  it('should reject tickets with malformed HMAC bytes', async () => {
    const ws = await connectWs(port);
    const parts = makeTicket().split('.');
    sendJson(ws, { type: 'auth', ticket: `${parts[0]}.${parts[1]}.${parts[2]}.zz` });
    const code = await waitForClose(ws);
    expect(code).toBe(4003);
  });

  it('should decrement client count on disconnect', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    await q.next(); // auth_ok
    expect(getAuditStreamClientCount()).toBe(1);
    ws.close();
    await waitForClose(ws);
    await new Promise((r) => setTimeout(r, 50)); // allow cleanup
    expect(getAuditStreamClientCount()).toBe(0);
  });

  // ─── Filter ───────────────────────────────────────────────────────────────

  it('should handle filter message after auth', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    await q.next(); // auth_ok
    sendJson(ws, { type: 'filter', guildId: 'guild1', action: 'config.update' });
    const msg = await q.next();
    expect(msg.type).toBe('filter_ok');
    expect(msg.filter.guildId).toBe('guild1');
    expect(msg.filter.action).toBe('config.update');
    ws.close();
    await waitForClose(ws);
  });

  it('should reject filter before auth', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'filter', guildId: 'guild1' });
    const msg = await q.next();
    expect(msg.type).toBe('error');
    ws.close();
    await waitForClose(ws);
  });

  it('should normalize non-string filter values to null', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    await q.next();

    sendJson(ws, { type: 'filter', action: 42, userId: { nope: true } });
    const msg = await q.next();

    expect(msg).toEqual({
      type: 'filter_ok',
      filter: { guildId: 'guild1', action: null, userId: null },
    });

    ws.close();
    await waitForClose(ws);
  });

  // ─── broadcastAuditEntry ─────────────────────────────────────────────────

  it('should broadcast entry to authenticated clients for their authenticated guild with no filter', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    await q.next(); // auth_ok

    const entry = {
      id: 1,
      guild_id: 'guild1',
      user_id: 'user1',
      action: 'config.update',
      created_at: new Date().toISOString(),
    };
    broadcastAuditEntry(entry);

    const msg = await q.next();
    expect(msg.type).toBe('entry');
    expect(msg.entry.action).toBe('config.update');
    ws.close();
    await waitForClose(ws);
  });

  it('should NOT broadcast entries from other guilds without filter', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket('guild1') });
    await q.next(); // auth_ok

    broadcastAuditEntry({
      id: 200,
      guild_id: 'guild2',
      user_id: 'user1',
      action: 'config.update',
      created_at: new Date().toISOString(),
    });

    await expect(q.next(500)).rejects.toThrow('Message timeout');
    ws.close();
    await waitForClose(ws);
  });

  it('should broadcast to client with matching guildId filter', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    await q.next(); // auth_ok
    sendJson(ws, { type: 'filter', guildId: 'guild1' });
    await q.next(); // filter_ok

    const entry = {
      id: 2,
      guild_id: 'guild1',
      user_id: 'user1',
      action: 'members.delete',
      created_at: new Date().toISOString(),
    };
    broadcastAuditEntry(entry);

    const msg = await q.next();
    expect(msg.type).toBe('entry');
    expect(msg.entry.guild_id).toBe('guild1');
    ws.close();
    await waitForClose(ws);
  });

  it('should ignore a rejected guild filter and keep the authenticated guild scope', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    await q.next(); // auth_ok
    sendJson(ws, { type: 'filter', guildId: 'guild2' });
    const filterError = await q.next();
    expect(filterError).toEqual({
      type: 'error',
      message: 'Guild filter does not match authenticated guild',
    });

    broadcastAuditEntry({
      id: 300,
      guild_id: 'guild2',
      user_id: 'user2',
      action: 'config.update',
      created_at: new Date().toISOString(),
    });
    await expect(q.next(500)).rejects.toThrow('Message timeout');

    broadcastAuditEntry({
      id: 3,
      guild_id: 'guild1',
      user_id: 'user1',
      action: 'config.update',
      created_at: new Date().toISOString(),
    });

    const msg = await q.next();
    expect(msg.type).toBe('entry');
    expect(msg.entry.guild_id).toBe('guild1');
    ws.close();
    await waitForClose(ws);
  });

  it('should filter by action', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    await q.next(); // auth_ok
    sendJson(ws, { type: 'filter', action: 'moderation.create' });
    await q.next(); // filter_ok

    // This one should NOT arrive
    broadcastAuditEntry({
      id: 4,
      guild_id: 'guild1',
      user_id: 'u',
      action: 'config.update',
      created_at: new Date().toISOString(),
    });
    // This one SHOULD arrive
    broadcastAuditEntry({
      id: 5,
      guild_id: 'guild1',
      user_id: 'u',
      action: 'moderation.create',
      created_at: new Date().toISOString(),
    });

    const msg = await q.next();
    expect(msg.entry.action).toBe('moderation.create');
    ws.close();
    await waitForClose(ws);
  });

  it('should filter by user id', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    await q.next();
    sendJson(ws, { type: 'filter', userId: 'user-2' });
    await q.next();

    broadcastAuditEntry({
      id: 41,
      guild_id: 'guild1',
      user_id: 'user-1',
      action: 'config.update',
      created_at: new Date().toISOString(),
    });
    broadcastAuditEntry({
      id: 42,
      guild_id: 'guild1',
      user_id: 'user-2',
      action: 'config.update',
      created_at: new Date().toISOString(),
    });

    const msg = await q.next();
    expect(msg.entry.id).toBe(42);

    ws.close();
    await waitForClose(ws);
  });

  it('should not broadcast to unauthenticated clients', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    // Don't authenticate
    broadcastAuditEntry({
      id: 6,
      guild_id: 'guild1',
      user_id: 'u',
      action: 'config.update',
      created_at: new Date().toISOString(),
    });
    await expect(q.next(300)).rejects.toThrow('Message timeout');
    ws.close();
  });

  it('should handle unknown message type', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'unknown_type', data: 'test' });
    const msg = await q.next();
    expect(msg.type).toBe('error');
    ws.close();
    await waitForClose(ws);
  });

  it('should handle invalid JSON', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    ws.send('not json at all');
    const msg = await q.next();
    expect(msg.type).toBe('error');
    ws.close();
    await waitForClose(ws);
  });

  it('should handle missing message type', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { nope: true });
    const msg = await q.next();
    expect(msg).toEqual({ type: 'error', message: 'Missing message type' });
    ws.close();
    await waitForClose(ws);
  });

  // ─── broadcastAuditEntry with no wss ─────────────────────────────────────

  it('should not throw if broadcastAuditEntry called before setup', async () => {
    await stopAuditStream(); // force wss to null
    expect(() => broadcastAuditEntry({ id: 99, guild_id: 'x', action: 'y' })).not.toThrow();
  });

  it('should reject filter guildId that differs from authenticated guild', async () => {
    const ws = await connectWs(port);
    const q = createMessageQueue(ws);
    sendJson(ws, { type: 'auth', ticket: makeTicket('guild1') });
    await q.next(); // auth_ok

    sendJson(ws, { type: 'filter', guildId: 'guild2', action: 'config.update' });
    const msg = await q.next();
    expect(msg.type).toBe('error');
    expect(msg.message).toContain('Guild filter does not match authenticated guild');

    ws.close();
    await waitForClose(ws);
  });

  it('should enforce the max authenticated client limit', async () => {
    const sockets = [];

    for (let i = 0; i < 10; i++) {
      const ws = await connectWs(port);
      const q = createMessageQueue(ws);
      sendJson(ws, { type: 'auth', ticket: makeTicket(`guild${i}`) });
      const msg = await q.next();
      expect(msg.type).toBe('auth_ok');
      sockets.push(ws);
    }

    const overflow = await connectWs(port);
    sendJson(overflow, { type: 'auth', ticket: makeTicket('guild-overflow') });
    const code = await waitForClose(overflow);
    expect(code).toBe(4029);

    for (const ws of sockets) {
      ws.close();
      await waitForClose(ws);
    }
  });
});
