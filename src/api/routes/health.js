/**
 * Health Check Route
 * Returns server status, uptime, memory usage, and Discord connection info
 */

import { Router } from 'express';

const router = Router();

/**
 * GET / — Health check endpoint
 * Returns status, uptime, memory usage, and Discord connection details.
 */
router.get('/', (req, res) => {
  const { client } = req.app.locals;

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    discord: {
      status: client.ws.status,
      ping: client.ws.ping,
      guilds: client.guilds.cache.size,
    },
  });
});

export default router;
