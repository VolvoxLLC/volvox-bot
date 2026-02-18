/**
 * Shared OAuth JWT middleware helpers
 */

import { error } from '../../logger.js';
import { verifyJwtToken } from './verifyJwt.js';

/**
 * Extract Bearer token from Authorization header.
 *
 * @param {string|undefined} authHeader - Raw Authorization header value
 * @returns {string|null} JWT token if present, otherwise null
 */
export function getBearerToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Authenticate request using OAuth JWT Bearer token.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next callback
 * @param {{ missingTokenError?: string }} [options] - Behavior options
 * @returns {boolean} True if middleware chain has been handled, false if no Bearer token was provided and no missing-token error was requested
 */
export function handleOAuthJwt(req, res, next, options = {}) {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    if (options.missingTokenError) {
      res.status(401).json({ error: options.missingTokenError });
      return true;
    }
    return false;
  }

  const result = verifyJwtToken(token);
  if (result.error) {
    if (result.status === 500) {
      error('SESSION_SECRET not configured — cannot verify OAuth token', {
        ip: req.ip,
        path: req.path,
      });
    }
    res.status(result.status).json({ error: result.error });
    return true;
  }

  req.authMethod = 'oauth';
  req.user = result.user;
  next();
  return true;
}
