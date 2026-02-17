/**
 * Authentication Middleware
 * Validates requests using a shared API secret
 */

import crypto from 'node:crypto';
import { warn } from '../../logger.js';

/**
 * Performs a constant-time comparison of the given secret against BOT_API_SECRET.
 *
 * @param {string|undefined} secret - The secret value to validate
 * @returns {boolean} True if the secret matches BOT_API_SECRET
 */
export function isValidSecret(secret) {
  const expected = process.env.BOT_API_SECRET;
  if (!expected || !secret) return false;
  if (secret.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
}

/**
 * Creates middleware that validates the x-api-secret header against BOT_API_SECRET.
 * Returns 401 JSON error if the header is missing or does not match.
 *
 * @returns {import('express').RequestHandler} Express middleware function
 */
export function requireAuth() {
  return (req, res, next) => {
    if (!process.env.BOT_API_SECRET) {
      warn('BOT_API_SECRET not configured — rejecting API request');
      return res.status(401).json({ error: 'API authentication not configured' });
    }

    if (!isValidSecret(req.headers['x-api-secret'])) {
      warn('Unauthorized API request', { ip: req.ip, path: req.path });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  };
}
