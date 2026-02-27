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
 * List mod cases for a guild with optional filters and pagination.
 *
 * Query params:
 *   guildId  (required) — Discord guild ID
 *   targetId            — Filter by target user ID
 *   action              — Filter by action type (warn, kick, ban, …)
 *   page     (default 1)
 *   limit    (default 25, max 100)
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
 * Get a single mod case by case_number + guild, including any scheduled actions.
 *
 * Query params:
 *   guildId (required) — scoped to prevent cross-guild data exposure
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
 * Get moderation stats summary for a guild.
 *
 * Query params:
 *   guildId (required)
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
 * Get full moderation history for a specific user in a guild.
 *
 * Query params:
 *   guildId  (required) — Discord guild ID
 *   page     (default 1)
 *   limit    (default 25, max 100)
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
