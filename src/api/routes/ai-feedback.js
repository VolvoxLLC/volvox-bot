/**
 * AI Feedback Routes
 * Endpoints for reading AI response feedback (👍/👎) stats.
 *
 * Mounted at /api/v1/guilds/:id/ai-feedback
 */

import { Router } from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireGuildAdmin, validateGuild } from './guilds.js';
import { error } from '../../logger.js';

const router = Router({ mergeParams: true });

/** Rate limiter: 60 requests / 1 min per IP */
const feedbackRateLimit = rateLimit({ windowMs: 60 * 1000, max: 60 });

// ── GET /stats ─────────────────────────────────────────────────────────────

/**
 * @openapi
 * /guilds/{id}/ai-feedback/stats:
 *   get:
 *     tags:
 *       - AI Feedback
 *     summary: Get AI feedback statistics
 *     description: Returns aggregate 👍/👎 feedback counts and daily trend for a guild.
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
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *           minimum: 1
 *           maximum: 90
 *         description: Number of days for the trend window
 *     responses:
 *       "200":
 *         description: Feedback statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 positive:
 *                   type: integer
 *                 negative:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 ratio:
 *                   type: integer
 *                   nullable: true
 *                   description: Positive feedback percentage (0–100), or null if no feedback
 *                 trend:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       positive:
 *                         type: integer
 *                       negative:
 *                         type: integer
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get(
  '/stats',
  feedbackRateLimit,
  requireGuildAdmin,
  validateGuild,
  async (req, res) => {
    try {
      const { dbPool } = req.app.locals;
      if (!dbPool) return res.status(503).json({ error: 'Database not available' });

      const guildId = req.params.id;

      let days = 30;
      if (req.query.days !== undefined) {
        const parsed = Number.parseInt(req.query.days, 10);
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 90) {
          days = parsed;
        }
      }

      const [statsResult, trendResult] = await Promise.all([
        dbPool.query(
          `SELECT
             COUNT(*) FILTER (WHERE feedback_type = 'positive')::int AS positive,
             COUNT(*) FILTER (WHERE feedback_type = 'negative')::int AS negative,
             COUNT(*)::int AS total
           FROM ai_feedback
           WHERE guild_id = $1`,
          [guildId],
        ),
        dbPool.query(
          `SELECT
             DATE(created_at) AS date,
             COUNT(*) FILTER (WHERE feedback_type = 'positive')::int AS positive,
             COUNT(*) FILTER (WHERE feedback_type = 'negative')::int AS negative
           FROM ai_feedback
           WHERE guild_id = $1
             AND created_at >= NOW() - INTERVAL '1 days' * $2
           GROUP BY DATE(created_at)
           ORDER BY date ASC`,
          [guildId, days],
        ),
      ]);

      const row = statsResult.rows[0];
      const positive = row?.positive || 0;
      const negative = row?.negative || 0;
      const total = row?.total || 0;
      const ratio = total > 0 ? Math.round((positive / total) * 100) : null;

      const trend = trendResult.rows.map((r) => ({
        date: r.date,
        positive: r.positive || 0,
        negative: r.negative || 0,
      }));

      res.json({ positive, negative, total, ratio, trend });
    } catch (err) {
      error('Failed to fetch AI feedback stats', {
        error: err.message,
        guildId: req.params.id,
      });
      res.status(500).json({ error: 'Failed to fetch AI feedback stats' });
    }
  },
);

// ── GET /recent ──────────────────────────────────────────────────────────────

/**
 * @openapi
 * /guilds/{id}/ai-feedback/recent:
 *   get:
 *     tags:
 *       - AI Feedback
 *     summary: Get recent feedback entries
 *     description: Returns the most recent feedback entries for a guild (newest first).
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
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *           maximum: 100
 *     responses:
 *       "200":
 *         description: Recent feedback entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 feedback:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       messageId:
 *                         type: string
 *                       channelId:
 *                         type: string
 *                       userId:
 *                         type: string
 *                       feedbackType:
 *                         type: string
 *                         enum: [positive, negative]
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get(
  '/recent',
  feedbackRateLimit,
  requireGuildAdmin,
  validateGuild,
  async (req, res) => {
    try {
      const { dbPool } = req.app.locals;
      if (!dbPool) return res.status(503).json({ error: 'Database not available' });

      const guildId = req.params.id;

      let limit = 25;
      if (req.query.limit !== undefined) {
        const parsed = Number.parseInt(req.query.limit, 10);
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 100) {
          limit = parsed;
        }
      }

      const result = await dbPool.query(
        `SELECT
           id,
           message_id AS "messageId",
           channel_id AS "channelId",
           user_id AS "userId",
           feedback_type AS "feedbackType",
           created_at AS "createdAt"
         FROM ai_feedback
         WHERE guild_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [guildId, limit],
      );

      const feedback = result.rows.map((r) => ({
        id: r.id,
        messageId: r.messageId ?? r.message_id,
        channelId: r.channelId ?? r.channel_id,
        userId: r.userId ?? r.user_id,
        feedbackType: r.feedbackType ?? r.feedback_type,
        createdAt: r.createdAt ?? r.created_at,
      }));
      res.json({ feedback });
    } catch (err) {
      error('Failed to fetch recent AI feedback', {
        error: err.message,
        guildId: req.params.id,
      });
      res.status(500).json({ error: 'Failed to fetch recent AI feedback' });
    }
  },
);

export default router;
