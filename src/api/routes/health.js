/**
 * Health Check Route
 * Returns server status, uptime, and Discord connection info.
 * Detailed memory usage requires authentication.
 */

import crypto from 'node:crypto';
import { Router } from 'express';

const router = Router();

/**
 * GET / — Health check endpoint
 * Returns status, uptime, and Discord connection details.
 * Includes detailed memory usage only when a valid x-api-secret header is provided.
 */
router.get('/', (req, res) => {
  const { client } = req.app.locals;

  const body = {
    status: 'ok',
    uptime: process.uptime(),
    discord: {
      status: client.ws.status,
      ping: client.ws.ping,
      guilds: client.guilds.cache.size,
    },
  };

  const secret = req.headers['x-api-secret'];
  const expected = process.env.BOT_API_SECRET;
  if (
    expected &&
    secret &&
    secret.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
  ) {
    body.memory = process.memoryUsage();
  }

  res.json(body);
});

export default router;
