/**
 * Authentication Middleware
 * Supports both shared API secret and OAuth2 JWT authentication
 */

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { warn } from '../../logger.js';
import { getSessionToken } from '../routes/auth.js';

/**
 * Performs a constant-time comparison of the given secret against BOT_API_SECRET.
 *
 * @param {string|undefined} secret - The secret value to validate
 * @returns {boolean} True if the secret matches BOT_API_SECRET
 */
export function isValidSecret(secret) {
  const expected = process.env.BOT_API_SECRET;
  if (!expected || !secret) return false;
  // Compare byte lengths, not character lengths, to prevent timingSafeEqual from throwing
  // on multi-byte UTF-8 characters (e.g., 'é' is 1 char but 2 bytes)
  const secretBuffer = Buffer.from(secret);
  const expectedBuffer = Buffer.from(expected);
  if (secretBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(secretBuffer, expectedBuffer);
}

/**
 * Creates middleware that validates either:
 * - x-api-secret header (shared secret) — sets req.authMethod = 'api-secret'
 * - Authorization: Bearer <jwt> header (OAuth2) — sets req.authMethod = 'oauth', req.user = decoded JWT
 *
 * Returns 401 JSON error if neither is valid.
 *
 * @returns {import('express').RequestHandler} Express middleware function
 */
export function requireAuth() {
  return (req, res, next) => {
    // Try API secret first
    const apiSecret = req.headers['x-api-secret'];
    if (apiSecret) {
      if (!process.env.BOT_API_SECRET) {
        warn('BOT_API_SECRET not configured — rejecting API request', {
          ip: req.ip,
          path: req.path,
        });
        return res.status(401).json({ error: 'API authentication not configured' });
      }

      if (isValidSecret(apiSecret)) {
        req.authMethod = 'api-secret';
        return next();
      }
    }

    // Try OAuth2 JWT
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const sessionSecret = process.env.SESSION_SECRET;

      if (!sessionSecret) {
        warn('SESSION_SECRET not configured — cannot verify OAuth token', {
          ip: req.ip,
          path: req.path,
        });
        return res.status(500).json({ error: 'Session not configured' });
      }

      try {
        const decoded = jwt.verify(token, sessionSecret, { algorithms: ['HS256'] });
        if (!getSessionToken(decoded.userId)) {
          return res.status(401).json({ error: 'Session expired or revoked' });
        }
        req.authMethod = 'oauth';
        req.user = decoded;
        return next();
      } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }

    // Neither auth method provided or valid
    warn('Unauthorized API request', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  };
}
