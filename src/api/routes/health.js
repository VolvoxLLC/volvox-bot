/**
 * Health Check Route
 * Returns server status, uptime, and Discord connection info.
 * Detailed memory usage requires authentication.
 */

import { Router } from 'express';
import { getRedisStats } from '../../redis.js';
import { isValidSecret } from '../middleware/auth.js';

const router = Router();

// db.js is the critical dependency — import independently so restartTracker
// failures never prevent pool stats from being available.
let getRestartPool = null;
let getPoolStats = null;
try {
  const dbMod = await import('../../db.js');
  getRestartPool = dbMod.getPool ?? null;
  getPoolStats = dbMod.getPoolStats ?? null;
} catch {
  // db module not available — fallback to null
}

// restartTracker is optional — may not exist in all deployments
let getRestarts = null;
try {
  const mod = await import('../../utils/restartTracker.js');
  getRestarts = mod.getRestarts ?? null;
} catch {
  // restartTracker not available yet — fallback to null
}

/**
 * @openapi
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Health check
 *     description: >
 *       Returns server status and uptime. When a valid `x-api-secret` header is
 *       provided, includes extended diagnostics (Discord connection, memory,
 *       system info, log-tracking status, restart history).
 *     parameters:
 *       - in: header
 *         name: x-api-secret
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional — include for extended diagnostics
 *     responses:
 *       "200":
 *         description: Server health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 uptime:
 *                   type: number
 *                   description: Server uptime in seconds
 *                 discord:
 *                   type: object
 *                   description: Discord connection info (auth only)
 *                   properties:
 *                     status:
 *                       type: integer
 *                     ping:
 *                       type: integer
 *                     guilds:
 *                       type: integer
 *                 memory:
 *                   type: object
 *                   description: Process memory usage (auth only)
 *                 system:
 *                   type: object
 *                   description: System info (auth only)
 *                   properties:
 *                     platform:
 *                       type: string
 *                     nodeVersion:
 *                       type: string
 *                 errors:
 *                   type: object
 *                   description: Log-tracking status (auth only). Database log tracking is disabled, so counts are unavailable.
 *                   properties:
 *                     lastHour:
 *                       type: integer
 *                       nullable: true
 *                       enum: [null]
 *                       description: Always null because database log tracking is disabled.
 *                     lastDay:
 *                       type: integer
 *                       nullable: true
 *                       enum: [null]
 *                       description: Always null because database log tracking is disabled.
 *                     error:
 *                       type: string
 *                       description: Reason error-count metrics are unavailable.
 *                       example: database log tracking disabled
 *                 restarts:
 *                   type: array
 *                   description: Recent restart history (auth only)
 *                   items:
 *                     type: object
 *                     properties:
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       reason:
 *                         type: string
 *                       version:
 *                         type: string
 *                         nullable: true
 *                       uptimeBefore:
 *                         type: number
 *                         nullable: true
 */
router.get('/', async (req, res) => {
  const { client } = req.app.locals;

  // Defensive guard in case health check is hit before Discord login completes
  if (!client?.ws) {
    return res.json({
      status: 'ok',
      uptime: process.uptime(),
      discord: { ws: { status: 'connecting' } },
    });
  }

  const body = {
    status: 'ok',
    uptime: process.uptime(),
  };

  if (isValidSecret(req.headers['x-api-secret'])) {
    body.discord = {
      status: client.ws.status,
      ping: client.ws.ping,
      guilds: client.guilds.cache.size,
    };
    body.memory = process.memoryUsage();

    body.system = {
      platform: process.platform,
      nodeVersion: process.version,
      cpuUsage: process.cpuUsage(),
    };

    // DB pool stats (authenticated only)
    if (getPoolStats) {
      try {
        const stats = getPoolStats();
        body.pool = stats ?? null;
      } catch {
        body.pool = null;
      }
    }

    // Redis stats (authenticated only)
    body.redis = getRedisStats();

    body.errors = {
      lastHour: null,
      lastDay: null,
      error: 'database log tracking disabled',
    };

    // Restart data with graceful fallback
    if (getRestarts && getRestartPool) {
      try {
        const pool = getRestartPool();
        if (pool) {
          const rows = await getRestarts(pool, 20);
          body.restarts = rows.map((r) => ({
            timestamp:
              r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
            reason: r.reason || 'unknown',
            version: r.version ?? null,
            uptimeBefore: r.uptime_seconds != null ? Number(r.uptime_seconds) : null,
          }));
        } else {
          body.restarts = [];
        }
      } catch {
        body.restarts = [];
      }
    } else {
      body.restarts = [];
    }
  }

  res.json(body);
});

export default router;
