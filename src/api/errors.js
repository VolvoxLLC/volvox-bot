/**
 * Centralised API error helpers.
 *
 * Keeps error responses consistent across all routes:
 *   { error: '<message>' }
 *
 * Usage:
 *   import { send503, send500 } from '../errors.js';
 *   if (!dbPool) return send503(res);
 *   catch (err) { send500(res, 'Failed to fetch stats', err, logError, { guild: guildId }); }
 */

/**
 * Send a 400 Bad Request response.
 * @param {import('express').Response} res
 * @param {string} message
 */
export function send400(res, message) {
  return res.status(400).json({ error: message });
}

/**
 * Send a 401 Unauthorized response.
 * @param {import('express').Response} res
 * @param {string} [message]
 */
export function send401(res, message = 'Unauthorized') {
  return res.status(401).json({ error: message });
}

/**
 * Send a 403 Forbidden response.
 * @param {import('express').Response} res
 * @param {string} [message]
 */
export function send403(res, message = 'Forbidden') {
  return res.status(403).json({ error: message });
}

/**
 * Send a 404 Not Found response.
 * @param {import('express').Response} res
 * @param {string} [message]
 */
export function send404(res, message = 'Not found') {
  return res.status(404).json({ error: message });
}

/**
 * Send a 500 Internal Server Error and optionally log the underlying error.
 * @param {import('express').Response} res
 * @param {string} message - Human-readable error description
 * @param {Error} [err] - Original error (for logging)
 * @param {Function} [logFn] - Logger function (e.g. `error` from logger.js)
 * @param {Record<string, unknown>} [context] - Additional log context
 */
export function send500(res, message, err, logFn, context = {}) {
  if (logFn && err) {
    logFn(message, { error: err.message, ...context });
  }
  return res.status(500).json({ error: message });
}

/**
 * Send a 503 Service Unavailable (typically: DB pool not available).
 * @param {import('express').Response} res
 * @param {string} [message]
 */
export function send503(res, message = 'Database not available') {
  return res.status(503).json({ error: message });
}
