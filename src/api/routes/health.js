/**
 * Health Check Route
 * Returns server status, uptime, and Discord connection info.
 * Detailed memory usage requires authentication.
 */

import { Router } from 'express';
import { queryLogs } from '../../utils/logQuery.js';
import { isValidSecret } from '../middleware/auth.js';

const router = Router();

// Graceful fallback for restartTracker — may not exist yet
let getRestartData = null;
try {
  const mod = await import('../../utils/restartTracker.js');
  getRestartData = mod.getRestartData ?? mod.default?.getRestartData ?? null;
} catch {
  // restartTracker not available yet — fallback to null
}

/**
 * GET / — Health check endpoint
 * Returns status, uptime, and Discord connection details.
 * Includes extended data only when a valid x-api-secret header is provided.
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

    // Error counts from logs table
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

    // Restart data with graceful fallback
    if (getRestartData) {
      try {
        const restartInfo = await getRestartData();
        body.restarts = restartInfo;
      } catch {
        body.restarts = { total: 0, last: null };
      }
    } else {
      body.restarts = { total: 0, last: null };
    }
  }

  res.json(body);
});

export default router;
