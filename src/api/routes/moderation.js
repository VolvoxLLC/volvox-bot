/**
 * Moderation API Routes
 * Exposes mod case data for the web dashboard.
 */

import { Router } from 'express';
import { getPool } from '../../db.js';
import { info, error as logError } from '../../logger.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireGuildModerator } from './guilds.js';

const router = Router();

/** Rate limiter for moderation API endpoints — 120 requests / 15 min per IP. */
const moderationRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });

/**
 * Middleware: adapt query param guildId to path param for requireGuildModerator.
 * Moderation routes use `?guildId=` instead of `/:id`, so we bridge the gap.
 */
function adaptGuildIdParam(req, _res, next) {
  if (req.query.guildId) {
    req.params.id = req.query.guildId;
  }
  next();
}

// Apply a global rate limiter first so static analysis and runtime behavior
// both see all moderation routes protected before authz and DB access.
router.use(moderationRateLimit);

// Apply guild-scoped authorization to all moderation routes
// (requireAuth is already applied at the router mount level in api/index.js)
router.use(adaptGuildIdParam, requireGuildModerator);

// ─── GET /cases ───────────────────────────────────────────────────────────────

/**
 * @openapi
 * /moderation/cases:
 *   get:
 *     tags:
 *       - Moderation
 *     summary: List mod cases
 *     description: Returns paginated moderation cases for a guild with optional filters by target user or action type.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *         description: Discord guild ID
 *       - in: query
 *         name: targetId
 *         schema:
 *           type: string
 *         description: Filter by target user ID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [warn, kick, ban, mute, unmute, unban]
 *         description: Filter by action type
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
 *         description: Paginated mod cases
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cases:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       case_number:
 *                         type: integer
 *                       action:
 *                         type: string
 *                       target_id:
 *                         type: string
 *                       target_tag:
 *                         type: string
 *                       moderator_id:
 *                         type: string
 *                       moderator_tag:
 *                         type: string
 *                       reason:
 *                         type: string
 *                         nullable: true
 *                       duration:
 *                         type: string
 *                         nullable: true
 *                       expires_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       log_message_id:
 *                         type: string
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *       "400":
 *         description: Missing guildId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 */
router.get('/cases', moderationRateLimit, async (req, res) => {
  const { guildId, targetId, action } = req.query;

  if (!guildId) {
    return res.status(400).json({ error: 'guildId is required' });
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  try {
    const pool = getPool();

    // Build dynamic WHERE clause
    const conditions = ['guild_id = $1'];
    const values = [guildId];
    let paramIdx = 2;

    if (targetId) {
      conditions.push(`target_id = $${paramIdx++}`);
      values.push(targetId);
    }

    if (action) {
      conditions.push(`action = $${paramIdx++}`);
      values.push(action);
    }

    const where = conditions.join(' AND ');

    const [casesResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           id,
           case_number,
           action,
           target_id,
           target_tag,
           moderator_id,
           moderator_tag,
           reason,
           duration,
           expires_at,
           log_message_id,
           created_at
         FROM mod_cases
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...values, limit, offset],
      ),
      pool.query(`SELECT COUNT(*)::integer AS total FROM mod_cases WHERE ${where}`, values),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const pages = Math.ceil(total / limit);

    info('Mod cases listed', { guildId, page, limit, total });

    return res.json({
      cases: casesResult.rows,
      total,
      page,
      pages,
    });
  } catch (err) {
    logError('Failed to list mod cases', { error: err.message, guildId });
    return res.status(500).json({ error: 'Failed to fetch mod cases' });
  }
});

// ─── GET /cases/:caseNumber ────────────────────────────────────────────────────

/**
 * @openapi
 * /moderation/cases/{caseNumber}:
 *   get:
 *     tags:
 *       - Moderation
 *     summary: Get mod case detail
 *     description: Returns a single moderation case by case number, including any scheduled actions.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseNumber
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *         description: Discord guild ID (scopes the lookup)
 *     responses:
 *       "200":
 *         description: Mod case with scheduled actions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 guild_id:
 *                   type: string
 *                 case_number:
 *                   type: integer
 *                 action:
 *                   type: string
 *                 target_id:
 *                   type: string
 *                 target_tag:
 *                   type: string
 *                 moderator_id:
 *                   type: string
 *                 moderator_tag:
 *                   type: string
 *                 reason:
 *                   type: string
 *                   nullable: true
 *                 duration:
 *                   type: string
 *                   nullable: true
 *                 expires_at:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 scheduledActions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       action:
 *                         type: string
 *                       target_id:
 *                         type: string
 *                       execute_at:
 *                         type: string
 *                         format: date-time
 *                       executed:
 *                         type: boolean
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       "400":
 *         description: Invalid case number or missing guildId
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
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 */
router.get('/cases/:caseNumber', moderationRateLimit, async (req, res) => {
  const caseNumber = parseInt(req.params.caseNumber, 10);
  if (Number.isNaN(caseNumber)) {
    return res.status(400).json({ error: 'Invalid case number' });
  }

  const { guildId } = req.query;
  if (!guildId) {
    return res.status(400).json({ error: 'guildId is required' });
  }

  try {
    const pool = getPool();

    const caseResult = await pool.query(
      `SELECT
         id,
         guild_id,
         case_number,
         action,
         target_id,
         target_tag,
         moderator_id,
         moderator_tag,
         reason,
         duration,
         expires_at,
         log_message_id,
         created_at
       FROM mod_cases
       WHERE case_number = $1 AND guild_id = $2`,
      [caseNumber, guildId],
    );

    if (caseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const caseRow = caseResult.rows[0];

    const scheduledResult = await pool.query(
      `SELECT id, action, target_id, execute_at, executed, created_at
       FROM mod_scheduled_actions
       WHERE case_id = $1
       ORDER BY execute_at ASC`,
      [caseRow.id],
    );

    return res.json({
      ...caseRow,
      scheduledActions: scheduledResult.rows,
    });
  } catch (err) {
    logError('Failed to fetch mod case', { error: err.message, caseNumber, guildId });
    return res.status(500).json({ error: 'Failed to fetch mod case' });
  }
});

// ─── GET /stats ───────────────────────────────────────────────────────────────

/**
 * @openapi
 * /moderation/stats:
 *   get:
 *     tags:
 *       - Moderation
 *     summary: Moderation statistics
 *     description: Returns aggregate moderation statistics for a guild — totals, recent activity, breakdown by action, and top targets.
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
 *         description: Moderation stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalCases:
 *                   type: integer
 *                 last24h:
 *                   type: integer
 *                 last7d:
 *                   type: integer
 *                 byAction:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *                 topTargets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                       tag:
 *                         type: string
 *                       count:
 *                         type: integer
 *       "400":
 *         description: Missing guildId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 */
router.get('/stats', moderationRateLimit, async (req, res) => {
  const { guildId } = req.query;

  if (!guildId) {
    return res.status(400).json({ error: 'guildId is required' });
  }

  try {
    const pool = getPool();

    const [totalResult, last24hResult, last7dResult, byActionResult, topTargetsResult] =
      await Promise.all([
        // Total cases
        pool.query('SELECT COUNT(*)::integer AS total FROM mod_cases WHERE guild_id = $1', [
          guildId,
        ]),

        // Last 24 hours
        pool.query(
          `SELECT COUNT(*)::integer AS total FROM mod_cases
           WHERE guild_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
          [guildId],
        ),

        // Last 7 days
        pool.query(
          `SELECT COUNT(*)::integer AS total FROM mod_cases
           WHERE guild_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
          [guildId],
        ),

        // Breakdown by action
        pool.query(
          `SELECT action, COUNT(*)::integer AS count
           FROM mod_cases
           WHERE guild_id = $1
           GROUP BY action`,
          [guildId],
        ),

        // Top targets (most cases in last 30 days)
        pool.query(
          `SELECT target_id AS "userId", target_tag AS tag, COUNT(*)::integer AS count
           FROM mod_cases
           WHERE guild_id = $1 AND created_at > NOW() - INTERVAL '30 days'
           GROUP BY target_id, target_tag
           ORDER BY count DESC
           LIMIT 10`,
          [guildId],
        ),
      ]);

    // Convert byAction rows to a flat object
    const byAction = {};
    for (const row of byActionResult.rows) {
      byAction[row.action] = row.count;
    }

    return res.json({
      totalCases: totalResult.rows[0]?.total ?? 0,
      last24h: last24hResult.rows[0]?.total ?? 0,
      last7d: last7dResult.rows[0]?.total ?? 0,
      byAction,
      topTargets: topTargetsResult.rows,
    });
  } catch (err) {
    logError('Failed to fetch mod stats', { error: err.message, guildId });
    return res.status(500).json({ error: 'Failed to fetch mod stats' });
  }
});

// ─── GET /user/:userId/history ────────────────────────────────────────────────

/**
 * @openapi
 * /moderation/user/{userId}/history:
 *   get:
 *     tags:
 *       - Moderation
 *     summary: User moderation history
 *     description: Returns full moderation history for a specific user in a guild with breakdown by action type.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Discord user ID
 *       - in: query
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
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
 *         description: User moderation history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 cases:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       case_number:
 *                         type: integer
 *                       action:
 *                         type: string
 *                       reason:
 *                         type: string
 *                         nullable: true
 *                       moderator_tag:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *                 byAction:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *       "400":
 *         description: Missing guildId or userId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 */
router.get('/user/:userId/history', moderationRateLimit, async (req, res) => {
  const { userId } = req.params;
  const { guildId } = req.query;

  if (!guildId) {
    return res.status(400).json({ error: 'guildId is required' });
  }

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  try {
    const pool = getPool();

    const [casesResult, countResult, summaryResult] = await Promise.all([
      pool.query(
        `SELECT
           id,
           case_number,
           action,
           target_id,
           target_tag,
           moderator_id,
           moderator_tag,
           reason,
           duration,
           expires_at,
           log_message_id,
           created_at
         FROM mod_cases
         WHERE guild_id = $1 AND target_id = $2
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [guildId, userId, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*)::integer AS total FROM mod_cases
         WHERE guild_id = $1 AND target_id = $2`,
        [guildId, userId],
      ),
      pool.query(
        `SELECT action, COUNT(*)::integer AS count
         FROM mod_cases
         WHERE guild_id = $1 AND target_id = $2
         GROUP BY action`,
        [guildId, userId],
      ),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const pages = Math.ceil(total / limit);

    const byAction = {};
    for (const row of summaryResult.rows) {
      byAction[row.action] = row.count;
    }

    info('User mod history fetched', { guildId, userId, page, limit, total });

    return res.json({
      userId,
      cases: casesResult.rows,
      total,
      page,
      pages,
      byAction,
    });
  } catch (err) {
    logError('Failed to fetch user mod history', { error: err.message, guildId, userId });
    return res.status(500).json({ error: 'Failed to fetch user mod history' });
  }
});

export default router;
