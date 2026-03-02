/**
 * AI Feedback Routes
 * Endpoints for reading AI response feedback (👍/👎) stats.
 *
 * Mounted at /api/v1/guilds/:id/ai-feedback
 */

import { Router } from 'express';
import { error as logError } from '../../logger.js';
import { getFeedbackStats, getFeedbackTrend } from '../../modules/aiFeedback.js';
import { send500, send503 } from '../errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireGuildAdmin, validateGuild } from './guilds.js';

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
router.get('/stats', feedbackRateLimit, requireGuildAdmin, validateGuild, async (req, res) => {
  const { dbPool } = req.app.locals;
  if (!dbPool) return send503(res);

  const guildId = req.params.id;

  let days = 30;
  if (req.query.days !== undefined) {
    const parsed = Number.parseInt(req.query.days, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 90) {
      days = parsed;
    }
  }

  try {
    const [stats, trend] = await Promise.all([
      getFeedbackStats(guildId),
      getFeedbackTrend(guildId, days),
    ]);

    res.json({ ...stats, trend });
  } catch (err) {
    return send500(res, 'Failed to fetch AI feedback stats', err, logError, { guild: guildId });
  }
});

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
router.get('/recent', feedbackRateLimit, requireGuildAdmin, validateGuild, async (req, res) => {
  const { dbPool } = req.app.locals;
  if (!dbPool) return send503(res);

  const guildId = req.params.id;

  let limit = 25;
  if (req.query.limit !== undefined) {
    const parsed = Number.parseInt(req.query.limit, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 100) {
      limit = parsed;
    }
  }

  try {
    const result = await dbPool.query(
      `SELECT
         af.id,
         af.message_id,
         af.channel_id,
         af.user_id,
         af.feedback_type,
         af.created_at,
         c.content AS ai_response_content
       FROM ai_feedback af
       LEFT JOIN conversations c
         ON c.discord_message_id = af.message_id AND c.role = 'assistant'
       WHERE af.guild_id = $1
       ORDER BY af.created_at DESC
       LIMIT $2`,
      [guildId, limit],
    );

    res.json({
      feedback: result.rows.map((r) => ({
        id: r.id,
        messageId: r.message_id,
        channelId: r.channel_id,
        userId: r.user_id,
        feedbackType: r.feedback_type,
        createdAt: r.created_at,
        aiResponseContent: r.ai_response_content ?? null,
      })),
    });
  } catch (err) {
    return send500(res, 'Failed to fetch recent AI feedback', err, logError, { guild: guildId });
  }
});

export default router;
