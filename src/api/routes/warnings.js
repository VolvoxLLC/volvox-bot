/**
 * Warnings API Routes
 * Exposes warning data and management endpoints for the web dashboard.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/250
 */

import { Router } from 'express';
import { getPool } from '../../db.js';
import { info, error as logError } from '../../logger.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireGuildModerator } from './guilds.js';

const router = Router();

/** Rate limiter for warning API endpoints — 120 requests / 15 min per IP. */
const warningsRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });

/**
 * Copy the `guildId` query value into `req.params.id` so downstream handlers can read it.
 *
 * If `req.query.guildId` is present, sets `req.params.id` to that value, then calls `next()`.
 */
function adaptGuildIdParam(req, _res, next) {
  if (req.query.guildId) {
    req.params.id = req.query.guildId;
  }
  next();
}

// Apply rate limiter and guild-scoped authorization
router.use(warningsRateLimit);
router.use(adaptGuildIdParam, requireGuildModerator);

// ─── GET / ────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /warnings:
 *   get:
 *     tags:
 *       - Warnings
 *     summary: List warnings
 *     description: Returns paginated warnings for a guild with optional filters.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by target user ID
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high]
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
 *         description: Paginated warnings
 *       "400":
 *         description: Missing guildId
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 */
router.get('/', async (req, res) => {
  const { guildId, userId, active, severity } = req.query;

  if (!guildId) {
    return res.status(400).json({ error: 'guildId is required' });
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  try {
    const pool = getPool();

    const conditions = ['guild_id = $1'];
    const values = [guildId];
    let paramIdx = 2;

    if (userId) {
      conditions.push(`user_id = $${paramIdx++}`);
      values.push(userId);
    }

    if (active !== undefined) {
      conditions.push(`active = $${paramIdx++}`);
      values.push(active === 'true');
    }

    if (severity) {
      conditions.push(`severity = $${paramIdx++}`);
      values.push(severity);
    }

    const where = conditions.join(' AND ');

    const [warningsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM warnings
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...values, limit, offset],
      ),
      pool.query(`SELECT COUNT(*)::integer AS total FROM warnings WHERE ${where}`, values),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const pages = Math.ceil(total / limit);

    info('Warnings listed via API', { guildId, page, limit, total });

    return res.json({
      warnings: warningsResult.rows,
      total,
      page,
      limit,
      pages,
    });
  } catch (err) {
    logError('Failed to list warnings', { error: err.message, guildId });
    return res.status(500).json({ error: 'Failed to fetch warnings' });
  }
});

// ─── GET /user/:userId ────────────────────────────────────────────────────────

/**
 * @openapi
 * /warnings/user/{userId}:
 *   get:
 *     tags:
 *       - Warnings
 *     summary: User warning summary
 *     description: Returns warning summary and history for a specific user.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: User warning summary with history
 *       "400":
 *         description: Missing guildId
 */
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { guildId } = req.query;

  if (!guildId) {
    return res.status(400).json({ error: 'guildId is required' });
  }

  try {
    const pool = getPool();

    const [warningsResult, statsResult, bySeverityResult] = await Promise.all([
      pool.query(
        `SELECT * FROM warnings
         WHERE guild_id = $1 AND user_id = $2
         ORDER BY created_at DESC
         LIMIT 50`,
        [guildId, userId],
      ),
      pool.query(
        `SELECT
           COUNT(*)::integer AS active_count,
           COALESCE(SUM(points), 0)::integer AS active_points
         FROM warnings
         WHERE guild_id = $1 AND user_id = $2 AND active = TRUE`,
        [guildId, userId],
      ),
      pool.query(
        `SELECT severity, COUNT(*)::integer AS count
         FROM warnings
         WHERE guild_id = $1 AND user_id = $2 AND active = TRUE
         GROUP BY severity`,
        [guildId, userId],
      ),
    ]);

    const bySeverity = {};
    for (const row of bySeverityResult.rows) {
      bySeverity[row.severity] = row.count;
    }

    info('User warning summary fetched via API', { guildId, userId });

    return res.json({
      userId,
      activeCount: statsResult.rows[0]?.active_count ?? 0,
      activePoints: statsResult.rows[0]?.active_points ?? 0,
      bySeverity,
      warnings: warningsResult.rows,
    });
  } catch (err) {
    logError('Failed to fetch user warnings', { error: err.message, guildId, userId });
    return res.status(500).json({ error: 'Failed to fetch user warnings' });
  }
});

// ─── GET /stats ───────────────────────────────────────────────────────────────

/**
 * @openapi
 * /warnings/stats:
 *   get:
 *     tags:
 *       - Warnings
 *     summary: Warning statistics
 *     description: Returns aggregate warning statistics for a guild.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Warning stats
 */
router.get('/stats', async (req, res) => {
  const { guildId } = req.query;

  if (!guildId) {
    return res.status(400).json({ error: 'guildId is required' });
  }

  try {
    const pool = getPool();

    const [totalResult, activeResult, bySeverityResult, topUsersResult] = await Promise.all([
      pool.query('SELECT COUNT(*)::integer AS total FROM warnings WHERE guild_id = $1', [guildId]),
      pool.query(
        'SELECT COUNT(*)::integer AS total FROM warnings WHERE guild_id = $1 AND active = TRUE',
        [guildId],
      ),
      pool.query(
        `SELECT severity, COUNT(*)::integer AS count
         FROM warnings
         WHERE guild_id = $1 AND active = TRUE
         GROUP BY severity`,
        [guildId],
      ),
      pool.query(
        `SELECT user_id, COUNT(*)::integer AS count, SUM(points)::integer AS points
         FROM warnings
         WHERE guild_id = $1 AND active = TRUE
         GROUP BY user_id
         ORDER BY points DESC
         LIMIT 10`,
        [guildId],
      ),
    ]);

    const bySeverity = {};
    for (const row of bySeverityResult.rows) {
      bySeverity[row.severity] = row.count;
    }

    return res.json({
      totalWarnings: totalResult.rows[0]?.total ?? 0,
      activeWarnings: activeResult.rows[0]?.total ?? 0,
      bySeverity,
      topUsers: topUsersResult.rows,
    });
  } catch (err) {
    logError('Failed to fetch warning stats', { error: err.message, guildId });
    return res.status(500).json({ error: 'Failed to fetch warning stats' });
  }
});

export default router;
