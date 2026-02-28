/**
 * Health Check Route
 * Returns server status, uptime, and Discord connection info.
 * Detailed memory usage requires authentication.
 */

import { Router } from 'express';
import { isValidSecret } from '../middleware/auth.js';

/** Lazy-loaded queryLogs — optional diagnostic feature, not required for health */
let _queryLogs = null;
let queryLogsFailed = false;
async function getQueryLogs() {
  if (queryLogsFailed) return null;
  if (!_queryLogs) {
    try {
      const mod = await import('../../utils/logQuery.js');
      _queryLogs = mod.queryLogs;
    } catch {
      // logQuery not available — tombstone to avoid retrying every request
      queryLogsFailed = true;
      _queryLogs = null;
    }
  }
  return _queryLogs;
}

const router = Router();

// Graceful fallback for restartTracker — may not exist yet
let getRestarts = null;
let getRestartPool = null;
try {
  const mod = await import('../../utils/restartTracker.js');
  getRestarts = mod.getRestarts ?? null;
  const dbMod = await import('../../db.js');
  getRestartPool = dbMod.getPool ?? null;
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
 *       system info, error counts, restart history).
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
 *                   description: Error counts (auth only)
 *                   properties:
 *                     lastHour:
 *                       type: integer
 *                       nullable: true
 *                     lastDay:
 *                       type: integer
 *                       nullable: true
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

    // Error counts from logs table (optional — partial data on failure)
    const queryLogs = await getQueryLogs();
    if (queryLogs) {
      try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [hourResult, dayResult] = await Promise.all([
          queryLogs({ level: 'error', since: oneHourAgo, limit: 1 }),
          queryLogs({ level: 'error', since: oneDayAgo, limit: 1 }),
        ]);

        body.errors = {
          lastHour: hourResult.total,
          lastDay: dayResult.total,
        };
      } catch {
        body.errors = { lastHour: null, lastDay: null, error: 'query failed' };
      }
    } else {
      body.errors = { lastHour: null, lastDay: null, error: 'log query unavailable' };
    }

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
            uptimeBefore: r.uptime_seconds ?? null,
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
