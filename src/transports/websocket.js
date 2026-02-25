/**
 * WebSocket Winston Transport
 *
 * Custom Winston transport that broadcasts log entries to connected
 * WebSocket clients in real-time. Zero overhead when no clients are connected.
 */

import WebSocket from 'ws';
import Transport from 'winston-transport';

/**
 * Log level severity ordering (lower = more severe).
 * Used for per-client level filtering.
 */
const LEVEL_SEVERITY = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Custom Winston transport that broadcasts log entries to authenticated
 * WebSocket clients. Supports per-client filtering by level, module, and search.
 */
export class WebSocketTransport extends Transport {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.level='info'] - Minimum log level
   */
  constructor(opts = {}) {
    super(opts);

    /**
     * Set of authenticated WebSocket clients.
     * Each client has a `logFilter` property for per-client filtering.
     * @type {Set<import('ws').WebSocket>}
     */
    this.clients = new Set();
  }

  /**
   * Register an authenticated client for log broadcasting.
   *
   * @param {import('ws').WebSocket} ws - Authenticated WebSocket client
   */
  addClient(ws) {
    this.clients.add(ws);
  }

  /**
   * Remove a client from log broadcasting.
   *
   * @param {import('ws').WebSocket} ws - WebSocket client to remove
   */
  removeClient(ws) {
    this.clients.delete(ws);
  }

  /**
   * Check if a log entry passes a client's filter.
   *
   * @param {Object} entry - Log entry
   * @param {Object} filter - Client's active filter
   * @returns {boolean} True if entry passes the filter
   */
  passesFilter(entry, filter) {
    if (!filter) return true;

    // Level filter — only show logs at or above the client's requested level
    if (filter.level) {
      const entrySeverity = LEVEL_SEVERITY[entry.level] ?? 3;
      const filterSeverity = LEVEL_SEVERITY[filter.level] ?? 3;
      if (entrySeverity > filterSeverity) return false;
    }

    // Module filter — match metadata.module
    if (filter.module && entry.module !== filter.module) {
      return false;
    }

    // Search filter — case-insensitive substring match on message
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      const messageStr = String(entry.message ?? '');
      if (!messageStr.toLowerCase().includes(searchLower)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Winston transport log method.
   * Broadcasts log entries to all authenticated clients that pass their filter.
   *
   * @param {Object} info - Winston log info object
   * @param {Function} callback - Callback to signal completion
   */
  log(info, callback) {
    // Zero overhead when no clients connected
    if (this.clients.size === 0) {
      callback();
      return;
    }

    const { level, message, timestamp } = info;
    const messageText = typeof message === 'string' ? message : String(message ?? '');

    // Extract metadata (exclude Winston internal properties + splat symbol)
    const EXCLUDED_KEYS = new Set(['level', 'message', 'timestamp', 'splat']);
    const metadata = {};
    for (const key of Object.keys(info)) {
      if (!EXCLUDED_KEYS.has(key)) {
        metadata[key] = info[key];
      }
    }

    const entry = {
      type: 'log',
      level: level || 'info',
      message: messageText,
      metadata,
      timestamp: timestamp || new Date().toISOString(),
      module: metadata.module || null,
    };

    let payload;
    try {
      payload = JSON.stringify(entry);
    } catch {
      // Non-serializable metadata — send without it
      payload = JSON.stringify({
        type: 'log',
        level: entry.level,
        message: messageText,
        metadata: {},
        timestamp: entry.timestamp,
        module: null,
      });
    }

    for (const ws of this.clients) {
      try {
        if (ws.readyState === WebSocket.OPEN && this.passesFilter(entry, ws.logFilter)) {
          ws.send(payload);
        }
      } catch {
        // Client send failed — will be cleaned up by heartbeat
      }
    }

    callback();
  }

  /**
   * Close the transport and disconnect all clients.
   */
  close() {
    this.clients.clear();
  }
}
