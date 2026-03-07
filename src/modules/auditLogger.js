/**
 * Audit Logger Module
 *
 * Provides a single `logAuditEvent` function for recording admin actions to
 * the `audit_logs` table. Designed to be fire-and-forget — callers should not
 * await the result unless they need confirmation of success.
 *
 * The middleware in `src/api/middleware/auditLog.js` handles *automatic*
 * logging of all mutating HTTP requests. Use this module directly when you
 * need richer, context-aware details (e.g. before/after diffs) that the
 * generic middleware cannot infer from the request alone.
 *
 * @example
 * import { logAuditEvent } from '../modules/auditLogger.js';
 *
 * // Log an XP adjustment with before/after values
 * await logAuditEvent(pool, {
 *   guildId: guild.id,
 *   userId: req.user.userId,
 *   userTag: req.user.tag,
 *   action: 'member.xp_adjust',
 *   targetType: 'member',
 *   targetId: userId,
 *   details: { before: { xp: oldXp }, after: { xp: newXp }, reason },
 * });
 */

import { warn, error as logError, info } from '../logger.js';

/**
 * @typedef {Object} AuditEventOptions
 * @property {string}  guildId    - Discord guild ID
 * @property {string}  userId     - Discord user ID of the admin who took the action
 * @property {string}  [userTag]  - Cached display name / tag of the admin
 * @property {string}  action     - Dot-namespaced action identifier (e.g. 'config.update')
 * @property {string}  [targetType] - What kind of thing was affected (e.g. 'member', 'warning')
 * @property {string}  [targetId]   - The ID of the affected entity
 * @property {Object}  [details]    - Freeform JSONB payload (before/after diffs, reason, etc.)
 * @property {string}  [ipAddress]  - Client IP address (optional)
 */

/**
 * Insert an audit log event into the database.
 *
 * Non-blocking by design: if the DB is unavailable or the insert fails, the
 * error is logged at WARN level but **never rethrown**. This ensures audit
 * logging never interrupts the primary request flow.
 *
 * @param {import('pg').Pool|null} pool - Database connection pool (may be null — graceful skip)
 * @param {AuditEventOptions} event     - Audit event fields
 * @returns {Promise<void>}
 */
export async function logAuditEvent(pool, event) {
  if (!pool) {
    warn('auditLogger: DB pool unavailable, skipping audit event', {
      action: event?.action,
      guildId: event?.guildId,
    });
    return;
  }

  const { guildId, userId, userTag, action, targetType, targetId, details, ipAddress } =
    event ?? {};

  if (!guildId || !userId || !action) {
    warn('auditLogger: missing required fields (guildId, userId, action), skipping', {
      guildId,
      userId,
      action,
    });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO audit_logs
         (guild_id, user_id, user_tag, action, target_type, target_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        guildId,
        userId,
        userTag ?? null,
        action,
        targetType ?? null,
        targetId ?? null,
        details != null ? JSON.stringify(details) : null,
        ipAddress ?? null,
      ],
    );
    info('auditLogger: event recorded', { action, guildId, userId });
  } catch (err) {
    logError('auditLogger: failed to insert audit event', {
      error: err.message,
      action,
      guildId,
      userId,
    });
    // Intentionally not re-throwing — audit failures must never break callers
  }
}

/**
 * Purge audit log entries older than the configured retention period.
 *
 * Called periodically from the DB maintenance scheduler. Uses the
 * `auditLog.retentionDays` config value (default: 90 days). Setting
 * `retentionDays` to 0 disables purging.
 *
 * @param {import('pg').Pool} pool           - Database connection pool
 * @param {number} [retentionDays=90]        - Days to keep audit log entries
 * @returns {Promise<number>}                - Number of rows deleted
 */
export async function purgeOldAuditLogs(pool, retentionDays = 90) {
  if (!pool) return 0;
  if (retentionDays <= 0) {
    info('auditLogger: retention purge disabled (retentionDays <= 0)');
    return 0;
  }

  try {
    const result = await pool.query(
      `DELETE FROM audit_logs
       WHERE created_at < NOW() - make_interval(days => $1)`,
      [retentionDays],
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      info('auditLogger: purged old audit log entries', {
        count,
        retentionDays,
        source: 'db_maintenance',
      });
    }
    return count;
  } catch (err) {
    if (err.code === '42P01') {
      // Table doesn't exist yet — migration hasn't run
      warn('auditLogger: audit_logs table does not exist, skipping purge', {
        source: 'db_maintenance',
      });
      return 0;
    }
    logError('auditLogger: failed to purge old audit log entries', {
      error: err.message,
      source: 'db_maintenance',
    });
    return 0;
  }
}
