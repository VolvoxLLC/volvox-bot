/**
 * WebSocket Log Stream Server
 *
 * Manages WebSocket connections for real-time log streaming.
 * Handles auth, client lifecycle, per-client filtering, and heartbeat.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { info, error as logError, warn } from '../../logger.js';
import { queryLogs } from '../../utils/logQuery.js';

/** Maximum number of concurrent authenticated clients */
const MAX_CLIENTS = 10;

/** Heartbeat ping interval in milliseconds */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Auth timeout — clients must authenticate within this window */
const AUTH_TIMEOUT_MS = 10_000;

/** Number of historical log entries to send on connect */
const HISTORY_LIMIT = 100;

/** Sensitive metadata keys to strip before broadcasting */
const SENSITIVE_KEYS = new Set([
  'ip',
  'accessToken',
  'secret',
  'apiKey',
  'authorization',
  'password',
  'token',
  'stack',
  'cookie',
]);

/**
 * Strip sensitive keys from a metadata object.
 *
 * @param {Object} metadata - Raw metadata from log entry
 * @returns {Object} Sanitized metadata with sensitive keys removed
 */
function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SENSITIVE_KEYS.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * @type {WebSocketServer | null}
 */
let wss = null;

/**
 * @type {ReturnType<typeof setInterval> | null}
 */
let heartbeatTimer = null;

/**
 * @type {import('../../transports/websocket.js').WebSocketTransport | null}
 */
let wsTransport = null;

/**
 * Count of currently authenticated clients.
 * @type {number}
 */
let authenticatedCount = 0;

/**
 * Set up the WebSocket server for log streaming.
 * Attaches to an existing HTTP server on path `/ws/logs`.
 *
 * @param {import('node:http').Server} httpServer - The HTTP server to attach to
 * @param {import('../../transports/websocket.js').WebSocketTransport} transport - The WebSocket Winston transport
 */
export function setupLogStream(httpServer, transport) {
  // Guard against double-call — cleanup previous instance first
  if (wss) {
    warn('setupLogStream called while already running — cleaning up previous instance');
    stopLogStream();
  }

  wsTransport = transport;

  wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/logs',
  });

  wss.on('connection', handleConnection);

  // Heartbeat — ping all clients every 30s, terminate dead ones
  heartbeatTimer = setInterval(() => {
    if (!wss) return;

    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        info('Terminating dead WebSocket client', { reason: 'heartbeat timeout' });
        cleanupClient(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  if (heartbeatTimer.unref) {
    heartbeatTimer.unref();
  }

  info('WebSocket log stream server started', { path: '/ws/logs' });
}

/**
 * Handle a new WebSocket connection.
 * Client must authenticate within AUTH_TIMEOUT_MS.
 *
 * @param {import('ws').WebSocket} ws
 */
function handleConnection(ws) {
  ws.isAlive = true;
  ws.authenticated = false;
  ws.guildId = null;
  ws.logFilter = null;

  // Set auth timeout
  ws.authTimeout = setTimeout(() => {
    if (!ws.authenticated) {
      ws.close(4001, 'Authentication timeout');
    }
  }, AUTH_TIMEOUT_MS);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    handleMessage(ws, data).catch((err) => {
      logError('Unhandled error in WebSocket message handler', { error: err.message });
    });
  });

  ws.on('close', () => {
    cleanupClient(ws);
  });

  ws.on('error', (err) => {
    logError('WebSocket client error', { error: err.message });
    cleanupClient(ws);
  });
}

/**
 * Handle an incoming message from a client.
 *
 * @param {import('ws').WebSocket} ws
 * @param {Buffer|string} data
 */
async function handleMessage(ws, data) {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    sendError(ws, 'Invalid JSON');
    return;
  }

  if (!msg || typeof msg.type !== 'string') {
    sendError(ws, 'Missing message type');
    return;
  }

  switch (msg.type) {
    case 'auth':
      await handleAuth(ws, msg);
      break;

    case 'filter':
      handleFilter(ws, msg);
      break;

    default:
      sendError(ws, `Unknown message type: ${msg.type}`);
  }
}

/**
 * Validate an HMAC ticket of the form `nonce.expiry.hmac` (legacy)
 * or `nonce.expiry.guildId.hmac` (guild-bound).
 *
 * @param {string} ticket - The ticket string from the client
 * @param {string} secret - The BOT_API_SECRET used to derive the HMAC
 * @returns {{ valid: boolean, guildId: string | null }} Validation result and bound guild
 */
function validateTicket(ticket, secret) {
  if (typeof ticket !== 'string' || typeof secret !== 'string') {
    return { valid: false, guildId: null };
  }

  const parts = ticket.split('.');
  if (parts.length !== 3 && parts.length !== 4) {
    return { valid: false, guildId: null };
  }

  const [nonce, expiry, maybeGuildId, maybeHmac] = parts;
  const guildId = parts.length === 4 ? maybeGuildId : null;
  const hmac = parts.length === 4 ? maybeHmac : maybeGuildId;
  if (!nonce || !expiry || !hmac) {
    return { valid: false, guildId: null };
  }
  if (parts.length === 4 && !guildId) {
    return { valid: false, guildId: null };
  }

  // Check expiry — guard against NaN from non-numeric strings
  const expiryNum = Number(expiry);
  if (!Number.isFinite(expiryNum) || expiryNum <= Date.now()) {
    return { valid: false, guildId: null };
  }

  // Re-derive HMAC and compare with timing-safe equality
  const payload = guildId ? `${nonce}.${expiry}.${guildId}` : `${nonce}.${expiry}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return {
      valid: timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hmac, 'hex')),
      guildId,
    };
  } catch {
    return { valid: false, guildId: null };
  }
}

/**
 * Authenticate a WebSocket client using a ticket and deliver recent logs.
 *
 * Validates `msg.ticket`, enforces guild-scoped tickets and client limits, marks the socket as authenticated,
 * clears the auth timeout, sends an `auth_ok` acknowledgement, transmits up to `HISTORY_LIMIT` historical log
 * entries scoped to the authenticated guild, and registers the socket with the real-time transport.
 *
 * On invalid or legacy tickets the connection is closed with code 4003; when the server is at capacity the
 * connection is closed with code 4029. Historical log delivery failures are non-fatal and result in an empty
 * history being sent.
 *
 * @param {import('ws').WebSocket} ws - The WebSocket connection to authenticate; mutated to record authentication state and filters.
 * @param {Object} msg - The incoming message object; expected to contain a `ticket` string.
 */
async function handleAuth(ws, msg) {
  if (ws.authenticated) {
    sendError(ws, 'Already authenticated');
    return;
  }

  const authResult = validateTicket(msg.ticket, process.env.BOT_API_SECRET);
  if (!authResult.valid) {
    warn('WebSocket auth failed', { reason: 'invalid ticket' });
    ws.close(4003, 'Authentication failed');
    return;
  }

  // Reject legacy tickets without guild scope
  if (!authResult.guildId) {
    warn('WebSocket auth rejected — guild-scoped ticket required', { reason: 'legacy-ticket' });
    ws.close(4003, 'Guild-scoped ticket required');
    return;
  }

  // Check max client limit
  if (authenticatedCount >= MAX_CLIENTS) {
    warn('WebSocket max clients reached', { max: MAX_CLIENTS });
    ws.close(4029, 'Too many clients');
    return;
  }

  // Auth successful
  ws.authenticated = true;
  ws.guildId = authResult.guildId;
  authenticatedCount++;

  if (ws.authTimeout) {
    clearTimeout(ws.authTimeout);
    ws.authTimeout = null;
  }

  sendJson(ws, { type: 'auth_ok' });

  info('WebSocket client authenticated', { totalClients: authenticatedCount });

  // Send historical logs BEFORE registering for real-time broadcast
  // to prevent race where live logs arrive before history and get overwritten
  try {
    const { rows } = await queryLogs({ limit: HISTORY_LIMIT, guildId: ws.guildId || undefined });
    // Reverse so oldest comes first (queryLogs returns DESC order)
    const logs = rows.reverse().map((row) => {
      const meta = sanitizeMetadata(row.metadata);
      return {
        level: row.level,
        message: row.message,
        metadata: meta,
        timestamp: row.timestamp,
        module: meta.module || null,
      };
    });
    sendJson(ws, { type: 'history', logs });
  } catch (err) {
    logError('Failed to send historical logs', { error: err.message });
    // Non-fatal — real-time streaming still works
    sendJson(ws, { type: 'history', logs: [] });
  }

  // Register with transport for real-time log broadcasting AFTER history is sent
  if (wsTransport) {
    wsTransport.addClient(ws);
  }
}

/**
 * Update the client's log filter based on a received filter message.
 *
 * If the connection is not authenticated the message is rejected. If `msg.guildId`
 * is present it must match the authenticated guild for the connection; otherwise
 * the message is rejected. On success the connection's `ws.logFilter` is set to
 * an object with the following shape and an acknowledgment `{ type: 'filter_ok', filter }`
 * is sent to the client.
 *
 * @param {import('ws').WebSocket} ws - The client's WebSocket connection.
 * @param {Object} msg - Filter message payload.
 * @param {string} [msg.guildId] - Optional guild id; if provided must match the authenticated guild.
 * @param {Array<any>} [msg.channelIds] - Optional array whose string entries become `channelIds`; empty or absent results in `null`.
 * @param {string} [msg.level] - Optional log level to filter by; non-strings become `null`.
 * @param {string} [msg.module] - Optional module name to filter by; non-strings become `null`.
 * @param {string} [msg.search] - Optional search string to filter log messages; non-strings become `null`.
 */
function handleFilter(ws, msg) {
  if (!ws.authenticated) {
    sendError(ws, 'Not authenticated');
    return;
  }

  if (msg.guildId && msg.guildId !== ws.guildId) {
    sendError(ws, 'Guild filter does not match authenticated guild');
    return;
  }

  ws.logFilter = {
    guildId: ws.guildId || null,
    channelIds:
      Array.isArray(msg.channelIds) && msg.channelIds.length > 0
        ? msg.channelIds.filter((id) => typeof id === 'string')
        : null,
    level: typeof msg.level === 'string' ? msg.level : null,
    module: typeof msg.module === 'string' ? msg.module : null,
    search: typeof msg.search === 'string' ? msg.search : null,
  };

  sendJson(ws, { type: 'filter_ok', filter: ws.logFilter });
}

/**
 * Perform cleanup for a disconnecting WebSocket client: clear its auth timeout, reset authentication state, decrement the authenticated client count, and unregister it from the broadcast transport.
 *
 * @param {import('ws').WebSocket} ws - The client WebSocket being cleaned up.
 */
function cleanupClient(ws) {
  if (ws.authTimeout) {
    clearTimeout(ws.authTimeout);
    ws.authTimeout = null;
  }

  if (ws.authenticated) {
    ws.authenticated = false;
    ws.guildId = null;
    authenticatedCount = Math.max(0, authenticatedCount - 1);

    if (wsTransport) {
      wsTransport.removeClient(ws);
    }

    info('WebSocket client disconnected', { totalClients: authenticatedCount });
  }
}

/**
 * Send a JSON message to a client.
 *
 * @param {import('ws').WebSocket} ws
 * @param {Object} data
 */
function sendJson(ws, data) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch {
    // Ignore send errors — client cleanup happens elsewhere
  }
}

/**
 * Send an error message to a client.
 *
 * @param {import('ws').WebSocket} ws
 * @param {string} message
 */
function sendError(ws, message) {
  sendJson(ws, { type: 'error', message });
}

/**
 * Shut down the WebSocket server.
 * Closes all client connections and cleans up resources.
 *
 * @returns {Promise<void>}
 */
export async function stopLogStream() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (wss) {
    // Close all connected clients
    for (const ws of wss.clients) {
      cleanupClient(ws);
      ws.close(1001, 'Server shutting down');
    }

    await new Promise((resolve) => {
      wss.close(() => resolve());
    });

    wss = null;
    wsTransport = null;
    authenticatedCount = 0;
    info('WebSocket log stream server stopped', { module: 'logStream' });
  }
}

/**
 * Get the current count of authenticated clients.
 * Useful for health checks and monitoring.
 *
 * @returns {number}
 */
export function getAuthenticatedClientCount() {
  return authenticatedCount;
}
