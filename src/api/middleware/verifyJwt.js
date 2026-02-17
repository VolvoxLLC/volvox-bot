import jwt from 'jsonwebtoken';
import { getSessionToken } from '../routes/auth.js';

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
