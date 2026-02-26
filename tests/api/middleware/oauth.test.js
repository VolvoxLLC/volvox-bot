import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { requireOAuth } from '../../../src/api/middleware/oauth.js';
import { _resetSecretCache } from '../../../src/api/middleware/verifyJwt.js';
import { sessionStore } from '../../../src/api/utils/sessionStore.js';

describe('requireOAuth middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { headers: {}, ip: '127.0.0.1', path: '/test' };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  afterEach(() => {
    sessionStore.clear();
    _resetSecretCache();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should return 401 when no Authorization header', async () => {
    const middleware = requireOAuth();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header does not start with Bearer', async () => {
    req.headers.authorization = 'Basic abc123';
    const middleware = requireOAuth();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
  });

  it('should still return No token provided even if x-api-secret header is present', async () => {
    req.headers['x-api-secret'] = 'test-secret';
    const middleware = requireOAuth();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 500 when SESSION_SECRET is not set', async () => {
    vi.stubEnv('SESSION_SECRET', '');
    req.headers.authorization = 'Bearer some-token';
    const middleware = requireOAuth();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session not configured' });
  });

  it('should return 401 for invalid JWT', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    req.headers.authorization = 'Bearer invalid-token';
    const middleware = requireOAuth();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  it('should attach decoded user and call next() for valid JWT', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    sessionStore.set('123', 'discord-access-token');
    const token = jwt.sign({ userId: '123', username: 'testuser' }, 'test-secret', {
      algorithm: 'HS256',
    });
    req.headers.authorization = `Bearer ${token}`;
    const middleware = requireOAuth();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe('123');
    expect(req.user.username).toBe('testuser');
    expect(req.authMethod).toBe('oauth');
  });

  it('should return 401 when JWT is valid but server-side session is missing', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    // Sign a valid JWT but do NOT populate sessionStore
    const token = jwt.sign({ userId: '999', username: 'nosession' }, 'test-secret', {
      algorithm: 'HS256',
    });
    req.headers.authorization = `Bearer ${token}`;
    const middleware = requireOAuth();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session expired or revoked' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for expired JWT', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    const token = jwt.sign({ userId: '123' }, 'test-secret', {
      algorithm: 'HS256',
      expiresIn: '-1s',
    });
    req.headers.authorization = `Bearer ${token}`;
    const middleware = requireOAuth();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });
});
