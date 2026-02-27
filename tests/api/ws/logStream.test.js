import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import {
  getAuthenticatedClientCount,
  setupLogStream,
  stopLogStream,
} from '../../../src/api/ws/logStream.js';
import { WebSocketTransport } from '../../../src/transports/websocket.js';

const TEST_SECRET = 'test-api-secret-for-ws';

/**
 * Generate a valid HMAC ticket for WebSocket auth.
 * Format: nonce.expiry.hmac
 */
function makeTicket(secret = TEST_SECRET, ttlMs = 60_000) {
  const nonce = randomBytes(16).toString('hex');
  const expiry = String(Date.now() + ttlMs);
  const hmac = createHmac('sha256', secret).update(`${nonce}.${expiry}`).digest('hex');
  return `${nonce}.${expiry}.${hmac}`;
}

function createTestServer() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

function connectWs(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/logs`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/**
 * Create a message queue for a WebSocket that buffers all incoming messages.
 * This prevents the race condition where multiple messages arrive in the same
 * TCP segment and fire synchronously before the next `once` handler is registered.
 */
function createMessageQueue(ws) {
  const queue = [];
  const waiters = [];

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter.resolve(msg);
    } else {
      queue.push(msg);
    }
  });

  return {
    next(timeoutMs = 3000) {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift());
      }
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

describe('WebSocket Log Stream', () => {
  let httpServer;
  let port;
  let transport;
  let clients;

  beforeEach(async () => {
    clients = [];
    vi.stubEnv('BOT_API_SECRET', TEST_SECRET);
    transport = new WebSocketTransport({ level: 'debug' });
    const result = await createTestServer();
    httpServer = result.server;
    port = result.port;
    setupLogStream(httpServer, transport);
  });

  afterEach(async () => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      }
    }
    clients = [];
    await stopLogStream();
    await new Promise((r) => httpServer.close(r));
    vi.unstubAllEnvs();
  });

  /**
   * Connect and return ws + message queue.
   */
  async function connect() {
    const ws = await connectWs(port);
    clients.push(ws);
    const mq = createMessageQueue(ws);
    return { ws, mq };
  }

  /**
   * Authenticate and consume both auth_ok and history.
   */
  async function authenticate(ws, mq) {
    sendJson(ws, { type: 'auth', ticket: makeTicket() });
    const authOk = await mq.next();
    expect(authOk.type).toBe('auth_ok');
    const history = await mq.next();
    expect(history.type).toBe('history');
    return history;
  }

  describe('authentication', () => {
    it('should accept valid auth and send auth_ok + history', async () => {
      const { ws, mq } = await connect();
      sendJson(ws, { type: 'auth', ticket: makeTicket() });

      const authOk = await mq.next();
      expect(authOk.type).toBe('auth_ok');

      const history = await mq.next();
      expect(history.type).toBe('history');
      expect(Array.isArray(history.logs)).toBe(true);
    });

    it('should reject invalid auth and close connection', async () => {
      const { ws } = await connect();
      const closePromise = waitForClose(ws);
      sendJson(ws, { type: 'auth', ticket: 'bad.ticket.value' });
      const code = await closePromise;
      expect(code).toBe(4003);
    });

    it('should reject auth when already authenticated', async () => {
      const { ws, mq } = await connect();
      await authenticate(ws, mq);

      sendJson(ws, { type: 'auth', ticket: makeTicket() });
      const errMsg = await mq.next();
      expect(errMsg.type).toBe('error');
      expect(errMsg.message).toBe('Already authenticated');
    });

    it('should track authenticated client count', async () => {
      expect(getAuthenticatedClientCount()).toBe(0);
      const { ws, mq } = await connect();
      await authenticate(ws, mq);
      expect(getAuthenticatedClientCount()).toBe(1);
    });

    it('should enforce max client limit (10)', async () => {
      for (let i = 0; i < 10; i++) {
        const { ws, mq } = await connect();
        await authenticate(ws, mq);
      }
      expect(getAuthenticatedClientCount()).toBe(10);

      const { ws: ws11 } = await connect();
      const closePromise = waitForClose(ws11);
      sendJson(ws11, { type: 'auth', ticket: makeTicket() });
      const code = await closePromise;
      expect(code).toBe(4029);
    });
  });

  describe('real-time streaming', () => {
    it('should stream logs to authenticated clients via transport', async () => {
      const { ws, mq } = await connect();
      await authenticate(ws, mq);

      transport.log(
        {
          level: 'info',
          message: 'real-time log',
          timestamp: '2026-01-01T00:00:00Z',
          module: 'test',
        },
        vi.fn(),
      );

      const logMsg = await mq.next();
      expect(logMsg.type).toBe('log');
      expect(logMsg.level).toBe('info');
      expect(logMsg.message).toBe('real-time log');
      expect(logMsg.module).toBe('test');
    });

    it('should not stream logs to unauthenticated clients', async () => {
      await connect(); // don't authenticate
      expect(transport.clients.size).toBe(0);

      const callback = vi.fn();
      transport.log({ level: 'info', message: 'should not arrive' }, callback);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('filtering', () => {
    it('should apply per-client level filter', async () => {
      const { ws, mq } = await connect();
      await authenticate(ws, mq);

      sendJson(ws, { type: 'filter', level: 'error' });
      const filterOk = await mq.next();
      expect(filterOk.type).toBe('filter_ok');
      expect(filterOk.filter.level).toBe('error');

      transport.log(
        { level: 'error', message: 'error log', timestamp: '2026-01-01T00:00:00Z' },
        vi.fn(),
      );
      const logMsg = await mq.next();
      expect(logMsg.level).toBe('error');
      expect(logMsg.message).toBe('error log');
    });

    it('should filter out logs below the requested level', async () => {
      const { ws, mq } = await connect();
      await authenticate(ws, mq);

      sendJson(ws, { type: 'filter', level: 'error' });
      await mq.next(); // filter_ok

      // Info log should be filtered; send error right after to prove it works
      transport.log(
        { level: 'info', message: 'filtered', timestamp: '2026-01-01T00:00:00Z' },
        vi.fn(),
      );
      transport.log(
        { level: 'error', message: 'arrives', timestamp: '2026-01-01T00:00:00Z' },
        vi.fn(),
      );

      const logMsg = await mq.next();
      expect(logMsg.message).toBe('arrives');
    });

    it('should reject filter from unauthenticated client', async () => {
      const { ws, mq } = await connect();
      sendJson(ws, { type: 'filter', level: 'error' });
      const errMsg = await mq.next();
      expect(errMsg.type).toBe('error');
      expect(errMsg.message).toBe('Not authenticated');
    });
  });

  describe('message handling', () => {
    it('should return error for invalid JSON', async () => {
      const { ws, mq } = await connect();
      ws.send('not json');
      const errMsg = await mq.next();
      expect(errMsg.type).toBe('error');
      expect(errMsg.message).toBe('Invalid JSON');
    });

    it('should return error for missing message type', async () => {
      const { ws, mq } = await connect();
      sendJson(ws, { data: 'hello' });
      const errMsg = await mq.next();
      expect(errMsg.type).toBe('error');
      expect(errMsg.message).toBe('Missing message type');
    });

    it('should return error for unknown message type', async () => {
      const { ws, mq } = await connect();
      sendJson(ws, { type: 'unknown' });
      const errMsg = await mq.next();
      expect(errMsg.type).toBe('error');
      expect(errMsg.message).toContain('Unknown message type');
    });
  });

  describe('client lifecycle', () => {
    it('should decrement count when client disconnects', async () => {
      const { ws, mq } = await connect();
      await authenticate(ws, mq);
      expect(getAuthenticatedClientCount()).toBe(1);

      const closed = new Promise((r) => ws.once('close', r));
      ws.close();
      await closed;
      await new Promise((r) => setTimeout(r, 50));
      expect(getAuthenticatedClientCount()).toBe(0);
    });
  });

  describe('stopLogStream', () => {
    it('should close all connections and reset state', async () => {
      const { ws, mq } = await connect();
      await authenticate(ws, mq);
      expect(getAuthenticatedClientCount()).toBe(1);

      const closePromise = waitForClose(ws);
      await stopLogStream();
      await closePromise;
      expect(getAuthenticatedClientCount()).toBe(0);
    });

    it('should handle being called when not started', async () => {
      await stopLogStream();
      await stopLogStream();
    });
  });

  describe('setupLogStream double-call', () => {
    it('should warn and restart when called while already running', async () => {
      // It's already running from beforeEach; call it again
      const result = await createTestServer();
      const server2 = result.server;

      try {
        setupLogStream(server2, transport); // should warn and restart
        // Give it a moment to restart
        await new Promise((r) => setTimeout(r, 50));
        // Connect to verify the new server works
        const ws = new WebSocket(`ws://localhost:${result.port}/ws/logs`);
        await new Promise((resolve, reject) => {
          ws.on('open', resolve);
          ws.on('error', reject);
        });
        ws.terminate();
      } finally {
        server2.close();
      }
    });
  });

  describe('auth edge cases', () => {
    it('should reject auth when BOT_API_SECRET is not configured', async () => {
      vi.unstubAllEnvs();
      // Re-setup without the secret — server will close the connection on invalid ticket
      const { ws } = await connect();
      clients.push(ws);

      const closedPromise = waitForClose(ws);
      sendJson(ws, { type: 'auth', ticket: 'some.valid.ticket' });

      // Server closes connection with 4003 when ticket is invalid (no secret = always invalid)
      const closeCode = await closedPromise;
      expect(closeCode).toBe(4003);
      // Restore for cleanup
      vi.stubEnv('BOT_API_SECRET', TEST_SECRET);
    });

    it('should reject second auth attempt on already-authenticated connection', async () => {
      const { ws, mq } = await connect();
      clients.push(ws);
      await authenticate(ws, mq);

      // Try to auth again — returns 'error' type (not 'auth_error')
      sendJson(ws, { type: 'auth', ticket: makeTicket() });

      const resp = await mq.next();
      expect(resp.type).toBe('error');
      expect(resp.message).toContain('Already authenticated');
    });

    it('should connect without wsTransport (no real-time forwarding)', async () => {
      await stopLogStream();
      const result = await createTestServer();
      const noTransportServer = result.server;

      try {
        setupLogStream(noTransportServer, null); // no transport
        const ws = new WebSocket(`ws://localhost:${result.port}/ws/logs`);
        const mq = createMessageQueue(ws);
        await new Promise((resolve, reject) => {
          ws.on('open', resolve);
          ws.on('error', reject);
        });
        clients.push(ws);

        sendJson(ws, { type: 'auth', ticket: makeTicket() });
        const resp = await mq.next();
        expect(resp.type).toBe('auth_ok');
        // History sent after (empty because no real DB)
        await mq.next(); // wait for history
      } finally {
        await stopLogStream();
        noTransportServer.close();
      }
    });
  });

  describe('filter with all string fields', () => {
    it('should set module and search filter when provided as strings', async () => {
      const { ws, mq } = await connect();
      clients.push(ws);
      await authenticate(ws, mq);

      sendJson(ws, { type: 'filter', level: null, module: 'discord', search: 'error' });
      const resp = await mq.next();
      expect(resp.type).toBe('filter_ok');
      expect(resp.filter.module).toBe('discord');
      expect(resp.filter.search).toBe('error');
    });

    it('should set null for non-string level', async () => {
      const { ws, mq } = await connect();
      clients.push(ws);
      await authenticate(ws, mq);

      sendJson(ws, { type: 'filter', level: 42, module: null, search: null });
      const resp = await mq.next();
      expect(resp.type).toBe('filter_ok');
      expect(resp.filter.level).toBeNull();
    });
  });

  describe('unauthenticated client cleanup', () => {
    it('should handle disconnect of never-authenticated client cleanly', async () => {
      const { ws } = await connect();
      clients.push(ws);
      // Close immediately without authenticating
      const closedPromise = waitForClose(ws);
      ws.close();
      await closedPromise;
      await new Promise((r) => setTimeout(r, 50));
      // Count should remain 0 — unauthenticated clients don't increment it
      expect(getAuthenticatedClientCount()).toBe(0);
    });
  });
});
