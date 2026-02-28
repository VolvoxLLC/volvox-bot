/**
 * Audit Log Middleware
 * Intercepts mutating requests (POST/PUT/PATCH/DELETE) on authenticated routes
 * and records audit entries non-blockingly.
 */

import { info, error as logError } from '../../logger.js';
import { getConfig } from '../../modules/config.js';
import { maskSensitiveFields } from '../utils/configAllowlist.js';

/** HTTP methods considered mutating */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Derive an action string from the HTTP method and request path.
 *
 * @param {string} method - HTTP method (e.g. 'PUT')
 * @param {string} path - Request path (e.g. '/api/v1/guilds/123/config')
 * @returns {string} Dot-separated action identifier
 */
export function deriveAction(method, path) {
  // Normalise: strip /api/v1 prefix and trailing slash
  const cleaned = path.replace(/^\/api\/v1\/?/, '').replace(/\/$/, '');
  const segments = cleaned.split('/').filter(Boolean);

  // Common patterns:
  //   guilds/:id/config → config.update
  //   guilds/:id/members/:memberId/xp → member.xp_adjust
  //   moderation/... → moderation.<action>

  if (segments.length === 0) return `${method.toLowerCase()}.unknown`;

  // Skip 'guilds' + guild ID prefix when present
  let i = 0;
  if (segments[0] === 'guilds' && segments.length > 1) {
    i = 2; // skip 'guilds' and guild ID
  }

  const rest = segments.slice(i);
  if (rest.length === 0) return 'guild.update';

  const resource = rest[0];
  const sub = rest.length > 2 ? rest[rest.length - 1] : null;

  const methodVerb =
    method === 'POST'
      ? 'create'
      : method === 'PUT' || method === 'PATCH'
        ? 'update'
        : method === 'DELETE'
          ? 'delete'
          : method.toLowerCase();

  if (sub) {
    return `${resource}.${sub}_${methodVerb}`;
  }

  return `${resource}.${methodVerb}`;
}

/**
 * Extract the guild ID from the request path if present.
 *
 * @param {string} path - Request path
 * @returns {string|null} Guild ID or null
 */
function extractGuildId(path) {
  const match = path.match(/\/guilds\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Compute a shallow diff between two objects, returning only changed keys.
 *
 * @param {Object} before - Previous state
 * @param {Object} after - New state
 * @returns {Object} Object with `before` and `after` containing only differing keys
 */
export function computeConfigDiff(before, after) {
  const diff = { before: {}, after: {} };
  const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  for (const key of allKeys) {
    const b = JSON.stringify(before?.[key]);
    const a = JSON.stringify(after?.[key]);
    if (b !== a) {
      diff.before[key] = before?.[key];
      diff.after[key] = after?.[key];
    }
  }

  return diff;
}

/**
 * Insert an audit log entry into the database. Fire-and-forget (non-blocking).
 *
 * @param {import('pg').Pool} pool - Database connection pool
 * @param {Object} entry - Audit log entry
 */
function insertAuditEntry(pool, entry) {
  const { guildId, userId, action, targetType, targetId, details, ipAddress } = entry;

  try {
    const result = pool.query(
      `INSERT INTO audit_logs (guild_id, user_id, action, target_type, target_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        guildId || 'global',
        userId,
        action,
        targetType || null,
        targetId || null,
        details ? JSON.stringify(details) : null,
        ipAddress || null,
      ],
    );

    if (result && typeof result.then === 'function') {
      result
        .then(() => {
          info('Audit log entry created', { action, guildId, userId });
        })
        .catch((err) => {
          logError('Failed to insert audit log entry', { error: err.message, action, guildId });
        });
    }
  } catch (err) {
    logError('Failed to insert audit log entry', { error: err.message, action, guildId });
  }
}

/**
 * Express middleware that records audit log entries for mutating requests.
 * Non-blocking — the response is not delayed by the audit write.
 *
 * @returns {import('express').RequestHandler}
 */
export function auditLogMiddleware() {
  return (req, res, next) => {
    // Prevent double-execution: multiple routers can be mounted at the same path prefix
    // (e.g. /guilds mounts membersRouter, ticketsRouter, guildsRouter in sequence).
    // Only the first matching mount should attach the audit handler.
    if (req._auditLogAttached) {
      return next();
    }

    // Only audit mutating methods
    if (!MUTATING_METHODS.has(req.method)) {
      return next();
    }

    // Check if audit logging is enabled in config
    const config = getConfig();
    if (config.auditLog && config.auditLog.enabled === false) {
      return next();
    }

    const pool = req.app.locals.dbPool;
    if (!pool) {
      return next();
    }

    req._auditLogAttached = true;

    const userId = req.user?.userId || req.authMethod || 'unknown';
    const guildId = extractGuildId(req.originalUrl || req.path);
    const action = deriveAction(req.method, req.originalUrl || req.path);
    const ipAddress = req.ip || req.socket?.remoteAddress;

    // For config updates, capture before state to compute diff.
    // Reuse the already-fetched config snapshot — it reflects state before the handler runs.
    const isConfigUpdate =
      (req.originalUrl || req.path).includes('/config') &&
      (req.method === 'PUT' || req.method === 'PATCH');

    let beforeConfig = null;
    if (isConfigUpdate) {
      try {
        beforeConfig = structuredClone(config);
      } catch {
        // Non-critical — proceed without diff
      }
    }

    // Hook into response finish to capture the outcome
    res.on('finish', () => {
      // Only log successful mutations (2xx/3xx)
      if (res.statusCode >= 400) return;

      const details = { method: req.method, path: req.originalUrl || req.path };

      // Include request body with sensitive fields masked
      if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        details.body = maskSensitiveFields(req.body);
      }

      // Compute config diff for config updates, masking sensitive fields in both snapshots
      if (isConfigUpdate && beforeConfig) {
        try {
          const afterConfig = getConfig();
          const diff = computeConfigDiff(beforeConfig, afterConfig);
          if (Object.keys(diff.before).length > 0 || Object.keys(diff.after).length > 0) {
            details.configDiff = {
              before: maskSensitiveFields(diff.before),
              after: maskSensitiveFields(diff.after),
            };
          }
        } catch {
          // Non-critical
        }
      }

      // Derive target type/id from path
      let targetType = null;
      let targetId = null;
      const pathSegments = (req.originalUrl || req.path)
        .replace(/^\/api\/v1\/?/, '')
        .split('/')
        .filter(Boolean);

      // Pattern: guilds/:id/<resource>/:resourceId
      if (pathSegments.length >= 4 && pathSegments[0] === 'guilds') {
        targetType = pathSegments[2];
        targetId = pathSegments[3];
      }

      insertAuditEntry(pool, {
        guildId,
        userId,
        action,
        targetType,
        targetId,
        details,
        ipAddress,
      });
    });

    next();
  };
}
