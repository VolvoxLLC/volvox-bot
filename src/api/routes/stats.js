/**
 * Public Bot Statistics Route
 * Returns real-time bot statistics cached in Redis.
 * No authentication required. Rate-limited to 30 req/min per IP.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/252
 */

import { Router } from 'express';
import { info, error as logError } from '../../logger.js';
import { getConversationHistory } from '../../modules/ai.js';
import { cacheGetOrSet } from '../../utils/cache.js';
import { redisRateLimit } from '../middleware/redisRateLimit.js';

const router = Router();

/** Rate limiter: 30 req/min per IP for public stats endpoint */
const statsRateLimit = redisRateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: 'rl:stats',
});
/**
 * Query a count from a DB table, returning 0 if the table doesn't exist or query fails.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {string} table - Table name to count rows from
 * @returns {Promise<number>} Row count or 0 on failure
 */
const ALLOWED_TABLES = new Set(['command_usage', 'conversations']);

async function safeCount(pool, table) {
  if (!ALLOWED_TABLES.has(table)) {
    return 0;
  }
  try {
    // Table name is validated against allowlist above — safe to interpolate
    const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    return result.rows[0]?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * @openapi
 * /stats:
 *   get:
 *     tags:
 *       - Stats
 *     summary: Public bot statistics
 *     description: >
 *       Returns real-time statistics about the bot including server count, member count,
 *       commands served, active conversations, uptime, and messages processed.
 *       Results are cached in Redis for 5 minutes. No authentication required.
 *       Rate-limited to 30 requests per minute per IP.
 *     responses:
 *       "200":
 *         description: Bot statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 servers:
 *                   type: integer
 *                   description: Number of Discord servers the bot is in
 *                 members:
 *                   type: integer
 *                   description: Total member count across all servers
 *                 commandsServed:
 *                   type: integer
 *                   description: Total commands executed (from DB)
 *                 activeConversations:
 *                   type: integer
 *                   description: Number of active AI conversation channels
 *                 uptime:
 *                   type: number
 *                   description: Process uptime in seconds
 *                 messagesProcessed:
 *                   type: integer
 *                   description: Total messages processed (from DB)
 *                 cachedAt:
 *                   type: string
 *                   format: date-time
 *                   description: ISO timestamp when stats were cached
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 */
router.get('/', statsRateLimit, async (req, res) => {
  const { client, dbPool: pool } = req.app.locals;

  try {
    const stats = await cacheGetOrSet(
      'bot:stats:public',
      async () => {
        // Discord client stats
        let servers = 0;
        let members = 0;
        if (client) {
          servers = client.guilds.cache.size;
          for (const guild of client.guilds.cache.values()) {
            members += guild.memberCount ?? 0;
          }
        }

        // Active AI conversations
        const activeConversations = getConversationHistory().size;

        // DB-backed counts
        let commandsServed = 0;
        let messagesProcessed = 0;
        if (pool) {
          [commandsServed, messagesProcessed] = await Promise.all([
            safeCount(pool, 'command_usage'),
            safeCount(pool, 'conversations'),
          ]);
        }

        const result = {
          servers,
          members,
          commandsServed,
          activeConversations,
          uptime: process.uptime(),
          messagesProcessed,
          cachedAt: new Date().toISOString(),
        };

        info('Bot stats cached', {
          servers,
          members,
          commandsServed,
          activeConversations,
          messagesProcessed,
        });

        return result;
      },
      300, // 5 minute TTL
    );

    res.json(stats);
  } catch (err) {
    logError('Failed to fetch bot stats', { error: err.message });
    // Return 503 so clients can detect failure rather than silently showing stale zeros
    res.status(503).json({
      servers: 0,
      members: 0,
      commandsServed: 0,
      activeConversations: 0,
      uptime: process.uptime(),
      messagesProcessed: 0,
      cachedAt: new Date().toISOString(),
    });
  }
});

export { statsRateLimit };
export default router;
