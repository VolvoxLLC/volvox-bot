/**
 * JWT Verification Helper
 * Shared JWT verification logic used by both requireAuth and requireOAuth middleware
 */

import jwt from 'jsonwebtoken';
import { error as logError } from '../../logger.js';
import { getSessionToken } from '../utils/sessionStore.js';

/**
 * Lazily cached SESSION_SECRET — read from env on first call, then reused.
 * Avoids per-request env lookup while remaining compatible with test stubs
 * (vi.stubEnv sets process.env before the first call within each test).
 * Call `_resetSecretCache()` in test teardown if needed.
 */
let _cachedSecret;

/** @internal Reset the cached secret (for test teardown). */
export function _resetSecretCache() {
  _cachedSecret = undefined;
}

function getSecret() {
  if (_cachedSecret === undefined) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      throw new Error('SESSION_SECRET environment variable is required but not set');
    }
    _cachedSecret = secret;
  }
  return _cachedSecret;
}

/**
 * Verify a JWT token and validate the associated server-side session.
 *
 * @param {string} token - The JWT Bearer token to verify
 * @returns {Promise<{ user: Object } | { error: string, status: number }>}
 *   On success: `{ user }` with the decoded JWT payload.
 *   On failure: `{ error, status }` with an error message and HTTP status code.
 */
export async function verifyJwtToken(token) {
  let secret;
  try {
    secret = getSecret();
  } catch {
    return { error: 'Session not configured', status: 500 };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return { error: 'Invalid or expired token', status: 401 };
  }

  let sessionToken;
  try {
    sessionToken = await getSessionToken(decoded.userId);
  } catch (err) {
    logError('Session lookup failed', { error: err.message, userId: decoded.userId });
    return { error: 'Session lookup failed', status: 503 };
  }

  if (!sessionToken) {
    return { error: 'Session expired or revoked', status: 401 };
  }
  return { user: decoded };
}
