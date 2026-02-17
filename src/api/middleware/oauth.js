/**
 * OAuth2 JWT Middleware
 * Verifies JWT tokens from Discord OAuth2 sessions
 */

import { error } from '../../logger.js';
import { verifyJwtToken } from './verifyJwt.js';

/**
 * Creates middleware that verifies a JWT Bearer token from the Authorization header.
 * Attaches the decoded user payload to req.user on success.
 *
 * @returns {import('express').RequestHandler} Express middleware function
 */
export function requireOAuth() {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.slice(7);
    const result = verifyJwtToken(token);
    if (result.error) {
      if (result.status === 500) {
        error('SESSION_SECRET not configured — cannot verify OAuth token', {
          ip: req.ip,
          path: req.path,
        });
      }
      return res.status(result.status).json({ error: result.error });
    }
    req.authMethod = 'oauth';
    req.user = result.user;
    return next();
  };
}
