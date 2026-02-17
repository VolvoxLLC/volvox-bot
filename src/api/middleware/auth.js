/**
 * Authentication Middleware
 * Validates requests using a shared API secret
 */

import crypto from 'node:crypto';
import { warn } from '../../logger.js';

/**
 * Creates middleware that validates the x-api-secret header against BOT_API_SECRET.
 * Returns 401 JSON error if the header is missing or does not match.
 *
 * @returns {import('express').RequestHandler} Express middleware function
 */
export function requireAuth() {
  return (req, res, next) => {
    const secret = req.headers['x-api-secret'];
    const expected = process.env.BOT_API_SECRET;

    if (!expected) {
      warn('BOT_API_SECRET not configured — rejecting API request');
      return res.status(401).json({ error: 'API authentication not configured' });
    }

    if (
      !secret ||
      secret.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    ) {
      warn('Unauthorized API request', { ip: req.ip, path: req.path });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  };
}
