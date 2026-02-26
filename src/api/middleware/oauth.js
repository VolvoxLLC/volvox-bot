/**
 * OAuth2 JWT Middleware
 * Verifies JWT tokens from Discord OAuth2 sessions
 */

import { handleOAuthJwt } from './oauthJwt.js';

/**
 * Creates middleware that verifies a JWT Bearer token from the Authorization header.
 * Attaches the decoded user payload to req.user on success.
 *
 * @returns {import('express').RequestHandler} Express middleware function
 */
export function requireOAuth() {
  return async (req, res, next) => {
    return handleOAuthJwt(req, res, next, { missingTokenError: 'No token provided' });
  };
}
