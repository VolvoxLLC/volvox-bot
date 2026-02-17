/**
 * OAuth2 JWT Middleware
 * Verifies JWT tokens from Discord OAuth2 sessions
 */

import jwt from 'jsonwebtoken';
import { error } from '../../logger.js';

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
    const sessionSecret = process.env.SESSION_SECRET;

    if (!sessionSecret) {
      error('SESSION_SECRET not configured — cannot verify OAuth token');
      return res.status(500).json({ error: 'Session not configured' });
    }

    try {
      const decoded = jwt.verify(token, sessionSecret, { algorithms: ['HS256'] });
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
