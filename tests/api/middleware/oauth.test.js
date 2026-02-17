import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { requireOAuth } from '../../../src/api/middleware/oauth.js';
import { sessionStore } from '../../../src/api/routes/auth.js';

describe('requireOAuth middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  afterEach(() => {
    sessionStore.clear();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should return 401 when no Authorization header', () => {
    const middleware = requireOAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header does not start with Bearer', () => {
    req.headers.authorization = 'Basic abc123';
    const middleware = requireOAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
  });

  it('should return 500 when SESSION_SECRET is not set', () => {
    vi.stubEnv('SESSION_SECRET', '');
    req.headers.authorization = 'Bearer some-token';
    const middleware = requireOAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session not configured' });
  });

  it('should return 401 for invalid JWT', () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    req.headers.authorization = 'Bearer invalid-token';
    const middleware = requireOAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  it('should attach decoded user and call next() for valid JWT', () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    sessionStore.set('123', 'discord-access-token');
    const token = jwt.sign({ userId: '123', username: 'testuser' }, 'test-secret');
    req.headers.authorization = `Bearer ${token}`;
    const middleware = requireOAuth();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe('123');
    expect(req.user.username).toBe('testuser');
  });

  it('should return 401 for expired JWT', () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    const token = jwt.sign({ userId: '123' }, 'test-secret', { expiresIn: '-1s' });
    req.headers.authorization = `Bearer ${token}`;
    const middleware = requireOAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });
});
