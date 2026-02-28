/**
 * Ticket API Routes
 * Exposes ticket data for the web dashboard.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/134
 */

import { Router } from 'express';
import { getPool } from '../../db.js';
import { info, error as logError } from '../../logger.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireGuildAdmin, validateGuild } from './guilds.js';

const router = Router();

/** Rate limiter for ticket API endpoints — 30 req/min per IP. */
const ticketRateLimit = rateLimit({ windowMs: 60 * 1000, max: 30 });
router.use(ticketRateLimit);

// ─── GET /:id/tickets/stats ───────────────────────────────────────────────────

/**
 * GET /:id/tickets/stats — Ticket statistics for a guild.
 * Returns open count, avg resolution time, and tickets this week.
 */
router.get('/:id/tickets/stats', requireGuildAdmin, validateGuild, async (req, res) => {
  const { id: guildId } = req.params;

  try {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not available' });

    const [openResult, avgResult, weekResult] = await Promise.all([
      pool.query(
        'SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = $1 AND status = $2',
        [guildId, 'open'],
      ),
      pool.query(
        `SELECT COALESCE(
          EXTRACT(EPOCH FROM AVG(closed_at - created_at))::int, 0
        ) AS avg_seconds
        FROM tickets
        WHERE guild_id = $1 AND status = 'closed' AND closed_at IS NOT NULL`,
        [guildId],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM tickets
         WHERE guild_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`,
        [guildId],
      ),
    ]);

    res.json({
      openCount: openResult.rows[0].count,
      avgResolutionSeconds: avgResult.rows[0].avg_seconds,
      ticketsThisWeek: weekResult.rows[0].count,
    });
  } catch (err) {
    logError('Failed to fetch ticket stats', { guildId, error: err.message });
    res.status(500).json({ error: 'Failed to fetch ticket stats' });
  }
});

// ─── GET /:id/tickets/:ticketId ───────────────────────────────────────────────

/**
 * GET /:id/tickets/:ticketId — Ticket detail with transcript.
 */
router.get('/:id/tickets/:ticketId', requireGuildAdmin, validateGuild, async (req, res) => {
  const { id: guildId, ticketId } = req.params;

  try {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not available' });

    const { rows } = await pool.query(
      'SELECT * FROM tickets WHERE guild_id = $1 AND id = $2',
      [guildId, Number.parseInt(ticketId, 10)],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    logError('Failed to fetch ticket detail', { guildId, ticketId, error: err.message });
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// ─── GET /:id/tickets ─────────────────────────────────────────────────────────

/**
 * GET /:id/tickets — List tickets with pagination and filters.
 *
 * Query params:
 *   status  — Filter by status (open, closed)
 *   user    — Filter by user ID
 *   page    — Page number (default 1)
 *   limit   — Items per page (default 25, max 100)
 */
router.get('/:id/tickets', requireGuildAdmin, validateGuild, async (req, res) => {
  const { id: guildId } = req.params;
  const { status, user } = req.query;
  let page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  let limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  try {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not available' });

    const conditions = ['guild_id = $1'];
    const params = [guildId];
    let paramIndex = 2;

    if (status && (status === 'open' || status === 'closed')) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (user) {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(user);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const [countResult, ticketsResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM tickets WHERE ${whereClause}`, params),
      pool.query(
        `SELECT id, guild_id, user_id, topic, status, thread_id, channel_id,
                closed_by, close_reason, created_at, closed_at
         FROM tickets
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset],
      ),
    ]);

    res.json({
      tickets: ticketsResult.rows,
      total: countResult.rows[0].total,
      page,
      limit,
    });
  } catch (err) {
    logError('Failed to fetch tickets', { guildId, error: err.message });
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

export default router;
