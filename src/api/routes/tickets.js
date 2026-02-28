/**
 * Ticket API Routes
 * Exposes ticket data for the web dashboard.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/134
 */

import { Router } from 'express';
import { error as logError } from '../../logger.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireGuildAdmin, validateGuild } from './guilds.js';

const router = Router();

/** Rate limiter for ticket API endpoints — 30 req/min per IP. */
const ticketRateLimit = rateLimit({ windowMs: 60 * 1000, max: 30 });

/**
 * Helper to get the database pool from app.locals.
 *
 * @param {import('express').Request} req
 * @returns {import('pg').Pool | null}
 */
function getDbPool(req) {
  return req.app.locals.dbPool || null;
}

// ─── GET /:id/tickets/stats ───────────────────────────────────────────────────

/**
 * @openapi
 * /guilds/{id}/tickets/stats:
 *   get:
 *     tags:
 *       - Tickets
 *     summary: Ticket statistics
 *     description: Returns ticket statistics — open count, average resolution time, and tickets created this week.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Guild ID
 *     responses:
 *       "200":
 *         description: Ticket stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 openCount:
 *                   type: integer
 *                 avgResolutionSeconds:
 *                   type: integer
 *                 ticketsThisWeek:
 *                   type: integer
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get(
  '/:id/tickets/stats',
  ticketRateLimit,
  requireGuildAdmin,
  validateGuild,
  async (req, res) => {
    const { id: guildId } = req.params;
    const pool = getDbPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not available' });

    try {
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
  },
);

// ─── GET /:id/tickets/:ticketId ───────────────────────────────────────────────

/**
 * @openapi
 * /guilds/{id}/tickets/{ticketId}:
 *   get:
 *     tags:
 *       - Tickets
 *     summary: Get ticket detail
 *     description: Returns a single ticket with full details and transcript.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Guild ID
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Ticket ID
 *     responses:
 *       "200":
 *         description: Ticket detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 guild_id:
 *                   type: string
 *                 user_id:
 *                   type: string
 *                 topic:
 *                   type: string
 *                   nullable: true
 *                 status:
 *                   type: string
 *                   enum: [open, closed]
 *                 thread_id:
 *                   type: string
 *                   nullable: true
 *                 channel_id:
 *                   type: string
 *                   nullable: true
 *                 closed_by:
 *                   type: string
 *                   nullable: true
 *                 close_reason:
 *                   type: string
 *                   nullable: true
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 closed_at:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       "400":
 *         description: Invalid ticket ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get(
  '/:id/tickets/:ticketId',
  ticketRateLimit,
  requireGuildAdmin,
  validateGuild,
  async (req, res) => {
    const { id: guildId, ticketId } = req.params;
    const pool = getDbPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not available' });

    const parsedId = Number.parseInt(ticketId, 10);
    if (Number.isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    try {
      const { rows } = await pool.query('SELECT * FROM tickets WHERE guild_id = $1 AND id = $2', [
        guildId,
        parsedId,
      ]);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      res.json(rows[0]);
    } catch (err) {
      logError('Failed to fetch ticket detail', { guildId, ticketId, error: err.message });
      res.status(500).json({ error: 'Failed to fetch ticket' });
    }
  },
);

// ─── GET /:id/tickets ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /guilds/{id}/tickets:
 *   get:
 *     tags:
 *       - Tickets
 *     summary: List tickets
 *     description: Returns paginated tickets with optional status and user filters.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Guild ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, closed]
 *       - in: query
 *         name: user
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *           maximum: 100
 *     responses:
 *       "200":
 *         description: Paginated ticket list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tickets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       guild_id:
 *                         type: string
 *                       user_id:
 *                         type: string
 *                       topic:
 *                         type: string
 *                         nullable: true
 *                       status:
 *                         type: string
 *                         enum: [open, closed]
 *                       thread_id:
 *                         type: string
 *                         nullable: true
 *                       channel_id:
 *                         type: string
 *                         nullable: true
 *                       closed_by:
 *                         type: string
 *                         nullable: true
 *                       close_reason:
 *                         type: string
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       closed_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get('/:id/tickets', ticketRateLimit, requireGuildAdmin, validateGuild, async (req, res) => {
  const { id: guildId } = req.params;
  const { status, user } = req.query;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const pool = getDbPool(req);
  if (!pool) return res.status(503).json({ error: 'Database not available' });

  try {
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
