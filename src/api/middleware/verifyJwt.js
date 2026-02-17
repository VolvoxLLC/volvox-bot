/**
 * JWT Verification Helper
 * Shared JWT verification logic used by both requireAuth and requireOAuth middleware
 */

import jwt from 'jsonwebtoken';
import { getSessionToken } from '../routes/auth.js';

/**
 * Verify a JWT token and validate the associated server-side session.
 *
 * @param {string} token - The JWT Bearer token to verify
 * @returns {{ user: Object } | { error: string, status: number }}
 *   On success: `{ user }` with the decoded JWT payload.
 *   On failure: `{ error, status }` with an error message and HTTP status code.
 */
export function verifyJwtToken(token) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) return { error: 'Session not configured', status: 500 };

  try {
    const decoded = jwt.verify(token, sessionSecret, { algorithms: ['HS256'] });
    if (!getSessionToken(decoded.userId)) {
      return { error: 'Session expired or revoked', status: 401 };
    }
    return { user: decoded };
  } catch {
    return { error: 'Invalid or expired token', status: 401 };
  }
}
