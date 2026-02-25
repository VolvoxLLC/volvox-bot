/**
 * WebSocket Log Stream Server
 *
 * Manages WebSocket connections for real-time log streaming.
 * Handles auth, client lifecycle, per-client filtering, and heartbeat.
 */

import { WebSocketServer } from 'ws';
import { info, error as logError, warn } from '../../logger.js';
import { queryLogs } from '../../utils/logQuery.js';
import { isValidSecret } from '../middleware/auth.js';

/** Maximum number of concurrent authenticated clients */
const MAX_CLIENTS = 10;

/** Heartbeat ping interval in milliseconds */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Auth timeout — clients must authenticate within this window */
const AUTH_TIMEOUT_MS = 10_000;

/** Number of historical log entries to send on connect */
const HISTORY_LIMIT = 100;

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
    handleMessage(ws, data);
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
function handleMessage(ws, data) {
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
      handleAuth(ws, msg);
      break;

    case 'filter':
      handleFilter(ws, msg);
      break;

    default:
      sendError(ws, `Unknown message type: ${msg.type}`);
  }
}

/**
 * Handle auth message. Validates the secret and sends historical logs.
 *
 * @param {import('ws').WebSocket} ws
 * @param {Object} msg
 */
async function handleAuth(ws, msg) {
  if (ws.authenticated) {
    sendError(ws, 'Already authenticated');
    return;
  }

  if (!msg.secret || !isValidSecret(msg.secret)) {
    warn('WebSocket auth failed', { reason: 'invalid secret' });
    ws.close(4003, 'Authentication failed');
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
  authenticatedCount++;

  if (ws.authTimeout) {
    clearTimeout(ws.authTimeout);
    ws.authTimeout = null;
  }

  // Register with transport for real-time log broadcasting
  if (wsTransport) {
    wsTransport.addClient(ws);
  }

  sendJson(ws, { type: 'auth_ok' });

  info('WebSocket client authenticated', { totalClients: authenticatedCount });

  // Send historical logs
  try {
    const { rows } = await queryLogs({ limit: HISTORY_LIMIT });
    // Reverse so oldest comes first (queryLogs returns DESC order)
    const logs = rows.reverse().map((row) => ({
      level: row.level,
      message: row.message,
      metadata: row.metadata || {},
      timestamp: row.timestamp,
      module: row.metadata?.module || null,
    }));
    sendJson(ws, { type: 'history', logs });
  } catch (err) {
    logError('Failed to send historical logs', { error: err.message });
    // Non-fatal — real-time streaming still works
    sendJson(ws, { type: 'history', logs: [] });
  }
}

/**
 * Handle filter message. Updates per-client filter.
 *
 * @param {import('ws').WebSocket} ws
 * @param {Object} msg
 */
function handleFilter(ws, msg) {
  if (!ws.authenticated) {
    sendError(ws, 'Not authenticated');
    return;
  }

  ws.logFilter = {
    level: typeof msg.level === 'string' ? msg.level : null,
    module: typeof msg.module === 'string' ? msg.module : null,
    search: typeof msg.search === 'string' ? msg.search : null,
  };

  sendJson(ws, { type: 'filter_ok', filter: ws.logFilter });
}

/**
 * Clean up a disconnecting client.
 *
 * @param {import('ws').WebSocket} ws
 */
function cleanupClient(ws) {
  if (ws.authTimeout) {
    clearTimeout(ws.authTimeout);
    ws.authTimeout = null;
  }

  if (ws.authenticated) {
    ws.authenticated = false;
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
    if (ws.readyState === 1) {
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
    authenticatedCount = 0;
    info('WebSocket log stream server stopped');
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
