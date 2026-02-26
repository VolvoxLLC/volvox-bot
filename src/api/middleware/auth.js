/**
 * Authentication Middleware
 * Supports both shared API secret and OAuth2 JWT authentication
 */

import crypto from 'node:crypto';
import { warn } from '../../logger.js';
import { handleOAuthJwt } from './oauthJwt.js';

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
  return async (req, res, next) => {
    // Try API secret first
    const apiSecret = req.headers['x-api-secret'];
    if (apiSecret) {
      if (!process.env.BOT_API_SECRET) {
        // API secret auth is not configured — ignore the header and fall through to JWT.
        // This allows clients that always send x-api-secret to still authenticate via JWT
        // when the deployer hasn't configured BOT_API_SECRET.
        warn('BOT_API_SECRET not configured — ignoring x-api-secret header, trying JWT', {
          ip: req.ip,
          path: req.path,
        });
      } else if (isValidSecret(apiSecret)) {
        req.authMethod = 'api-secret';
        return next();
      } else {
        // BOT_API_SECRET is configured but the provided secret doesn't match.
        // Reject immediately — an explicit API-secret auth attempt that fails
        // should not silently fall through to JWT.
        warn('Invalid API secret provided', { ip: req.ip, path: req.path });
        return res.status(401).json({ error: 'Invalid API secret' });
      }
    }

    // Try OAuth2 JWT
    if (await handleOAuthJwt(req, res, next)) {
      return;
    }

    // Neither auth method provided or valid
    warn('Unauthorized API request', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  };
}
