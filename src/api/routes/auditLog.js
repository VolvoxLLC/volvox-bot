/**
 * Audit Log API Routes
 * Paginated, filterable audit log retrieval for dashboard consumption.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/123
 */

import { Router } from 'express';
import { error as logError } from '../../logger.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireGuildAdmin, validateGuild } from './guilds.js';

const router = Router();

/** Rate limiter for audit log endpoints — 30 req/min per IP. */
const auditRateLimit = rateLimit({ windowMs: 60 * 1000, max: 30 });

/**
 * Helper to get the database pool from app.locals.
 *
 * @param {import('express').Request} req
 * @returns {import('pg').Pool | null}
 */
function getDbPool(req) {
  return req.app.locals.dbPool || null;
}

/**
 * Normalize a query filter value to a non-empty string.
 * Express query params can be arrays/objects for repeated or nested keys.
 * We ignore non-string values to avoid passing invalid types to pg.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function toFilterString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ─── GET /:id/audit-log ──────────────────────────────────────────────────────

/**
 * GET /:id/audit-log — Paginated audit log with filters.
 *
 * Query params:
 *   action    — Filter by action type (e.g. 'config.update')
 *   userId    — Filter by admin user ID
 *   startDate — ISO timestamp lower bound
 *   endDate   — ISO timestamp upper bound
 *   limit     — Items per page (default 25, max 100)
 *   offset    — Offset for pagination (default 0)
 */
router.get('/:id/audit-log', auditRateLimit, requireGuildAdmin, validateGuild, async (req, res) => {
  const { id: guildId } = req.params;
  const pool = getDbPool(req);
  if (!pool) return res.status(503).json({ error: 'Database not available' });

  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);

  try {
    const conditions = ['guild_id = $1'];
    const params = [guildId];
    let paramIndex = 2;

    const actionFilter = toFilterString(req.query.action);
    if (actionFilter) {
      conditions.push(`action = $${paramIndex}`);
      params.push(actionFilter);
      paramIndex++;
    }

    const userIdFilter = toFilterString(req.query.userId);
    if (userIdFilter) {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(userIdFilter);
      paramIndex++;
    }

    if (req.query.startDate) {
      const start = new Date(req.query.startDate);
      if (!Number.isNaN(start.getTime())) {
        conditions.push(`created_at >= $${paramIndex}`);
        params.push(start.toISOString());
        paramIndex++;
      }
    }

    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      if (!Number.isNaN(end.getTime())) {
        conditions.push(`created_at <= $${paramIndex}`);
        params.push(end.toISOString());
        paramIndex++;
      }
    }

    const whereClause = conditions.join(' AND ');

    const [countResult, entriesResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs WHERE ${whereClause}`, params),
      pool.query(
        `SELECT id, guild_id, user_id, action, target_type, target_id, details, ip_address, created_at
           FROM audit_logs
           WHERE ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset],
      ),
    ]);

    res.json({
      entries: entriesResult.rows,
      total: countResult.rows[0].total,
      limit,
      offset,
    });
  } catch (err) {
    logError('Failed to fetch audit log', { guildId, error: err.message });
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

export default router;
