/**
 * Health Check Route
 * Returns server status, uptime, and Discord connection info.
 * Detailed memory usage requires authentication.
 */

import { Router } from 'express';
import { isValidSecret } from '../middleware/auth.js';

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
  };

  if (isValidSecret(req.headers['x-api-secret'])) {
    body.discord = {
      status: client.ws.status,
      ping: client.ws.ping,
      guilds: client.guilds.cache.size,
    };
    body.memory = process.memoryUsage();
  }

  res.json(body);
});

export default router;
