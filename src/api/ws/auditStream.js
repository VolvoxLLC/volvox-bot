/**
 * WebSocket Audit Log Stream
 *
 * Broadcasts real-time audit log entries to connected, authenticated dashboard clients.
 * Clients connect to /ws/audit-log, authenticate with an HMAC ticket, and receive
 * new audit entries as they are written.
 *
 * Protocol (JSON messages):
 *   Client → Server:
 *     { type: 'auth', ticket: '<nonce>.<expiry>.<hmac>' }
 *     { type: 'filter', guildId: '...', action: '...', userId: '...' }
 *
 *   Server → Client:
 *     { type: 'auth_ok' }
 *     { type: 'entry', entry: { ... } }
 *     { type: 'error', message: '...' }
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { info, error as logError, warn } from '../../logger.js';

/** Maximum concurrent authenticated audit stream clients */
const MAX_CLIENTS = 10;

/** Heartbeat interval in milliseconds */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Auth timeout — clients must authenticate within this window (configurable via env) */
function getAuthTimeoutMs() {
  return Number(process.env.AUDIT_STREAM_AUTH_TIMEOUT_MS) || 10_000;
}

/** @type {WebSocketServer | null} */
let wss = null;

/** @type {ReturnType<typeof setInterval> | null} */
let heartbeatTimer = null;

/** @type {number} */
let authenticatedCount = 0;

/**
 * Validate an HMAC ticket of the form `nonce.expiry.hmac`.
 *
 * @param {string} ticket
 * @param {string} secret
 * @returns {boolean}
 */
function validateTicket(ticket, secret) {
  if (typeof ticket !== 'string' || typeof secret !== 'string') return false;
  const parts = ticket.split('.');
  if (parts.length !== 3) return false;
  const [nonce, expiry, hmac] = parts;
  if (!nonce || !expiry || !hmac) return false;
  const expiryNum = Number(expiry);
  if (!Number.isFinite(expiryNum) || expiryNum <= Date.now()) return false;
  const expected = createHmac('sha256', secret).update(`${nonce}.${expiry}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hmac, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Send JSON to a WebSocket client (safe — swallows errors).
 *
 * @param {WebSocket} ws
 * @param {Object} data
 */
function sendJson(ws, data) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch {
    // Ignore send errors — cleanup handled elsewhere
  }
}

/**
 * Clean up a disconnecting client.
 *
 * @param {WebSocket} ws
 */
function cleanupClient(ws) {
  if (ws.authTimeout) {
    clearTimeout(ws.authTimeout);
    ws.authTimeout = null;
  }
  if (ws.authenticated) {
    ws.authenticated = false;
    authenticatedCount = Math.max(0, authenticatedCount - 1);
    info('Audit stream client disconnected', { totalClients: authenticatedCount });
  }
}

/**
 * Handle auth message.
 *
 * @param {WebSocket} ws
 * @param {Object} msg
 */
function handleAuth(ws, msg) {
  if (ws.authenticated) {
    sendJson(ws, { type: 'error', message: 'Already authenticated' });
    return;
  }

  if (!validateTicket(msg.ticket, process.env.BOT_API_SECRET)) {
    warn('Audit stream auth failed', { reason: 'invalid ticket' });
    ws.close(4003, 'Authentication failed');
    return;
  }

  if (authenticatedCount >= MAX_CLIENTS) {
    warn('Audit stream max clients reached', { max: MAX_CLIENTS });
    ws.close(4029, 'Too many clients');
    return;
  }

  ws.authenticated = true;
  authenticatedCount++;

  if (ws.authTimeout) {
    clearTimeout(ws.authTimeout);
    ws.authTimeout = null;
  }

  sendJson(ws, { type: 'auth_ok' });
  info('Audit stream client authenticated', { totalClients: authenticatedCount });
}

/**
 * Handle filter message.
 * Clients can subscribe to a specific guildId and optionally narrow by action or userId.
 *
 * @param {WebSocket} ws
 * @param {Object} msg
 */
function handleFilter(ws, msg) {
  if (!ws.authenticated) {
    sendJson(ws, { type: 'error', message: 'Not authenticated' });
    return;
  }

  ws.auditFilter = {
    guildId: typeof msg.guildId === 'string' ? msg.guildId : null,
    action: typeof msg.action === 'string' ? msg.action : null,
    userId: typeof msg.userId === 'string' ? msg.userId : null,
  };

  sendJson(ws, { type: 'filter_ok', filter: ws.auditFilter });
}

/**
 * Handle incoming message from a client.
 *
 * @param {WebSocket} ws
 * @param {Buffer|string} data
 */
function handleMessage(ws, data) {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    sendJson(ws, { type: 'error', message: 'Invalid JSON' });
    return;
  }

  if (!msg || typeof msg.type !== 'string') {
    sendJson(ws, { type: 'error', message: 'Missing message type' });
    return;
  }

  switch (msg.type) {
    case 'auth':
      handleAuth(ws, msg);
      break;
    case 'filter':
      handleFilter(ws, msg);
      break;
    default:
      sendJson(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
  }
}

/**
 * Handle a new WebSocket connection.
 *
 * @param {WebSocket} ws
 */
function handleConnection(ws) {
  ws.isAlive = true;
  ws.authenticated = false;
  ws.auditFilter = null;

  ws.authTimeout = setTimeout(() => {
    if (!ws.authenticated) {
      ws.close(4001, 'Authentication timeout');
    }
  }, getAuthTimeoutMs());

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    handleMessage(ws, data);
  });

  ws.on('close', () => {
    cleanupClient(ws);
  });

  ws.on('error', (err) => {
    logError('Audit stream client error', { error: err.message });
    cleanupClient(ws);
  });
}

/**
 * Check whether an entry matches a client's filter.
 *
 * @param {Object} filter - Client's active filter (may be null)
 * @param {Object} entry - Audit log entry
 * @returns {boolean}
 */
function matchesFilter(filter, entry) {
  if (!filter) return true; // No filter → receive everything
  if (filter.guildId && entry.guild_id !== filter.guildId) return false;
  if (filter.action && entry.action !== filter.action) return false;
  if (filter.userId && entry.user_id !== filter.userId) return false;
  return true;
}

/**
 * Broadcast a new audit log entry to all connected, authenticated clients
 * whose filter matches the entry.
 *
 * Called by the audit log middleware after a successful DB insert.
 *
 * @param {Object} entry - Audit log entry (same shape as DB row)
 */
export function broadcastAuditEntry(entry) {
  if (!wss) return;

  for (const ws of wss.clients) {
    if (ws.authenticated && matchesFilter(ws.auditFilter, entry)) {
      sendJson(ws, { type: 'entry', entry });
    }
  }
}

/**
 * Set up the audit log WebSocket server on the provided HTTP server.
 * Attaches to path `/ws/audit-log`.
 *
 * @param {import('node:http').Server} httpServer
 * @returns {Promise<void>}
 */
export async function setupAuditStream(httpServer) {
  if (wss) {
    warn('setupAuditStream called while already running — cleaning up previous instance');
    await stopAuditStream();
  }

  wss = new WebSocketServer({ server: httpServer, path: '/ws/audit-log' });
  wss.on('connection', handleConnection);

  heartbeatTimer = setInterval(() => {
    if (!wss) return;
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        info('Terminating dead audit stream client', { reason: 'heartbeat timeout' });
        cleanupClient(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      // Guard ping() with readyState check and try/catch to avoid crashing the interval
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      } catch (err) {
        logError('Audit stream ping failed', { error: err.message });
        cleanupClient(ws);
        try {
          ws.terminate();
        } catch {
          // Ignore terminate errors
        }
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  if (heartbeatTimer.unref) heartbeatTimer.unref();

  info('Audit log WebSocket stream started', { path: '/ws/audit-log' });
}

/**
 * Stop the audit log WebSocket server and disconnect all clients.
 *
 * @returns {Promise<void>}
 */
export async function stopAuditStream() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (wss) {
    for (const ws of wss.clients) {
      cleanupClient(ws);
      ws.close(1001, 'Server shutting down');
    }

    await new Promise((resolve) => {
      wss.close(() => resolve());
    });

    wss = null;
    authenticatedCount = 0;
    info('Audit log WebSocket stream stopped');
  }
}

/**
 * Get the current count of authenticated audit stream clients.
 *
 * @returns {number}
 */
export function getAuditStreamClientCount() {
  return authenticatedCount;
}
