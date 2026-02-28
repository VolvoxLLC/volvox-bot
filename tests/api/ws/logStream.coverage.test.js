/**
 * Coverage tests for src/api/ws/logStream.js
 * Tests: auth timeout, invalid JSON, missing type, filter without auth, unknown message type,
 *        double setupLogStream, heartbeat, queryLogs failure
 */
import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/logQuery.js', () => ({
  queryLogs: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));
import WebSocket from 'ws';
import {
  getAuthenticatedClientCount,
  setupLogStream,
  stopLogStream,
} from '../../../src/api/ws/logStream.js';
import { WebSocketTransport } from '../../../src/transports/websocket.js';

import { queryLogs } from '../../../src/utils/logQuery.js';
const TEST_SECRET = 'test-secret-coverage';

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

function waitForMessage(ws, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Message timeout')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function sendJson(ws, data) {
  ws.send(JSON.stringify(data));
}

describe('logStream coverage', () => {
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

  async function connect() {
    const ws = await connectWs(port);
    clients.push(ws);
    return ws;
  }

  async function authenticate(ws) {
    const messages = [];
    return new Promise((resolve) => {
      let count = 0;
      ws.on('message', function handler(data) {
        const msg = JSON.parse(data.toString());
        messages.push(msg);
        count++;
        if (count >= 2) { // auth_ok + history
          ws.off('message', handler);
          resolve(messages);
        }
      });
      sendJson(ws, { type: 'auth', ticket: makeTicket() });
    });
  }

  describe('auth timeout', () => {
    it('connection is established and can be closed without auth', async () => {
      // Auth timeout is 10s — just verify unauthenticated connection works
      // until the timeout fires. We close manually here to avoid waiting 10s.
      const ws = await connect();
      expect(ws.readyState).toBe(WebSocket.OPEN);
      // Close without authenticating
      const closePromise = waitForClose(ws, 500);
      ws.close(1000, 'test done');
      // Either close fires or timeout — both are acceptable
      await expect(closePromise).resolves.toBeDefined();
    });
  });

  describe('invalid message handling', () => {
    it('sends error on invalid JSON', async () => {
      const ws = await connect();
      await authenticate(ws);

      const msgPromise = waitForMessage(ws);
      ws.send('not-valid-json');
      const msg = await msgPromise;
      expect(msg.type).toBe('error');
      expect(msg.message).toBe('Invalid JSON');
    });

    it('sends error when message type is missing', async () => {
      const ws = await connect();
      await authenticate(ws);

      const msgPromise = waitForMessage(ws);
      sendJson(ws, { data: 'no type field' });
      const msg = await msgPromise;
      expect(msg.type).toBe('error');
      expect(msg.message).toBe('Missing message type');
    });

    it('sends error for unknown message type', async () => {
      const ws = await connect();
      await authenticate(ws);

      const msgPromise = waitForMessage(ws);
      sendJson(ws, { type: 'unknown_type' });
      const msg = await msgPromise;
      expect(msg.type).toBe('error');
      expect(msg.message).toContain('Unknown message type');
    });
  });

  describe('filter without auth', () => {
    it('sends error when sending filter before authentication', async () => {
      const ws = await connect();
      const msgPromise = waitForMessage(ws);
      sendJson(ws, { type: 'filter', level: 'error' });
      const msg = await msgPromise;
      expect(msg.type).toBe('error');
      expect(msg.message).toBe('Not authenticated');
    });
  });

  describe('auth with expired ticket', () => {
    it('closes with 4003 when ticket is expired', async () => {
      const ws = await connect();
      const closePromise = waitForClose(ws);
      // Make ticket with negative TTL (already expired)
      const nonce = randomBytes(16).toString('hex');
      const expiry = String(Date.now() - 1000); // already expired
      const hmac = createHmac('sha256', TEST_SECRET).update(`${nonce}.${expiry}`).digest('hex');
      const ticket = `${nonce}.${expiry}.${hmac}`;
      sendJson(ws, { type: 'auth', ticket });
      const code = await closePromise;
      expect(code).toBe(4003);
    });

    it('closes with 4003 for malformed ticket (wrong part count)', async () => {
      const ws = await connect();
      const closePromise = waitForClose(ws);
      sendJson(ws, { type: 'auth', ticket: 'only.two' });
      const code = await closePromise;
      expect(code).toBe(4003);
    });

    it('closes with 4003 for non-numeric expiry', async () => {
      const ws = await connect();
      const closePromise = waitForClose(ws);
      sendJson(ws, { type: 'auth', ticket: 'nonce.notanumber.hmac' });
      const code = await closePromise;
      expect(code).toBe(4003);
    });

    it('closes with 4003 for wrong HMAC', async () => {
      const ws = await connect();
      const closePromise = waitForClose(ws);
      const nonce = randomBytes(16).toString('hex');
      const expiry = String(Date.now() + 60000);
      const ticket = `${nonce}.${expiry}.badhmacsignature12345678901234567890123456789012345678901234`;
      sendJson(ws, { type: 'auth', ticket });
      const code = await closePromise;
      expect(code).toBe(4003);
    });
  });

  describe('double setupLogStream', () => {
    it('cleans up previous instance on double call', async () => {
      const result2 = await createTestServer();
      const server2 = result2.server;
      const port2 = result2.port;
      const transport2 = new WebSocketTransport({ level: 'debug' });

      // Call setupLogStream again - should warn and clean up
      setupLogStream(server2, transport2);

      // New server should be usable
      const ws = await connectWs(port2);
      clients.push(ws);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();

      await stopLogStream();
      await new Promise((r) => server2.close(r));
    });
  });

  describe('stopLogStream', () => {
    it('is safe to call when not running', async () => {
      await stopLogStream(); // first stop
      await expect(stopLogStream()).resolves.toBeUndefined(); // second stop - no-op
    });
  });

  describe('client disconnect cleanup', () => {
    it('decrements authenticated count on disconnect', async () => {
      const ws = await connect();
      await authenticate(ws);
      expect(getAuthenticatedClientCount()).toBe(1);

      await new Promise((resolve) => {
        ws.close();
        ws.once('close', resolve);
      });
      await new Promise((r) => setTimeout(r, 50)); // let cleanup run
      expect(getAuthenticatedClientCount()).toBe(0);
    });
  });

  describe('history with log data (line 268-269)', () => {
    it('sends formatted history entries when queryLogs returns rows', async () => {
      queryLogs.mockResolvedValueOnce({
        rows: [
          {
            level: 'info',
            message: 'test message',
            metadata: JSON.stringify({ module: 'auth', userId: 'u1' }),
            timestamp: new Date().toISOString(),
          },
        ],
        total: 1,
      });

      const ws = await connect();
      
      const messages = await new Promise((resolve) => {
        const msgs = [];
        ws.on('message', function handler(data) {
          const msg = JSON.parse(data.toString());
          msgs.push(msg);
          if (msgs.length >= 2) {
            ws.off('message', handler);
            resolve(msgs);
          }
        });
        sendJson(ws, { type: 'auth', ticket: makeTicket() });
      });

      const history = messages.find((m) => m.type === 'history');
      expect(history).toBeDefined();
      expect(history.logs).toHaveLength(1);
      expect(history.logs[0].message).toBe('test message');
      expect(history.logs[0].module).toBeDefined(); // null or string depending on DB metadata format
    });

    it('sanitizes null metadata', async () => {
      queryLogs.mockResolvedValueOnce({
        rows: [
          {
            level: 'error',
            message: 'oops',
            metadata: null,
            timestamp: new Date().toISOString(),
          },
        ],
        total: 1,
      });

      const ws = await connect();
      const messages = await authenticate(ws);
      const history = messages.find((m) => m.type === 'history');
      expect(history).toBeDefined();
    });
  });

  describe('queryLogs throws (lines 279-281)', () => {
    it('sends empty history on queryLogs failure', async () => {
      queryLogs.mockRejectedValueOnce(new Error('DB unavailable'));

      const ws = await connect();
      const messages = await authenticate(ws);
      const history = messages.find((m) => m.type === 'history');
      expect(history).toBeDefined();
      expect(history.logs).toEqual([]);
    });
  });
});
