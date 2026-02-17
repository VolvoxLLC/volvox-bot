import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

import { isValidSecret, requireAuth } from '../../../src/api/middleware/auth.js';
import { _resetSecretCache } from '../../../src/api/middleware/verifyJwt.js';
import { sessionStore } from '../../../src/api/utils/sessionStore.js';

describe('isValidSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return true when secret matches BOT_API_SECRET', () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    expect(isValidSecret('test-secret')).toBe(true);
  });

  it('should return false when secret does not match', () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    expect(isValidSecret('wrong-secret')).toBe(false);
  });

  it('should return false when secret is undefined', () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    expect(isValidSecret(undefined)).toBe(false);
  });

  it('should return false when BOT_API_SECRET is not set', () => {
    vi.stubEnv('BOT_API_SECRET', '');
    expect(isValidSecret('any-secret')).toBe(false);
  });

  it('should return false when both are undefined', () => {
    vi.stubEnv('BOT_API_SECRET', '');
    expect(isValidSecret(undefined)).toBe(false);
  });
});

describe('auth middleware', () => {
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

  it('should fall back to JWT auth when BOT_API_SECRET is not configured', () => {
    vi.stubEnv('BOT_API_SECRET', '');
    vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
    req.headers['x-api-secret'] = 'some-secret';
    sessionStore.set('999', 'discord-access-token');
    const token = jwt.sign({ userId: '999', username: 'testuser' }, 'jwt-test-secret', {
      algorithm: 'HS256',
    });
    req.headers.authorization = `Bearer ${token}`;
    const middleware = requireAuth();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authMethod).toBe('oauth');
    expect(req.user.userId).toBe('999');
  });

  it('should return 401 when BOT_API_SECRET is not configured and no Bearer token is provided', () => {
    vi.stubEnv('BOT_API_SECRET', '');
    req.headers['x-api-secret'] = 'some-secret';
    const middleware = requireAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when x-api-secret header is missing', () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    const middleware = requireAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 with specific error when x-api-secret does not match', () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    req.headers['x-api-secret'] = 'wrong-secret';
    const middleware = requireAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API secret' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when x-api-secret header matches', () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    req.headers['x-api-secret'] = 'test-secret';
    const middleware = requireAuth();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authMethod).toBe('api-secret');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should authenticate with valid JWT Bearer token', () => {
    vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
    sessionStore.set('123', 'discord-access-token');
    const token = jwt.sign({ userId: '123', username: 'testuser' }, 'jwt-test-secret', {
      algorithm: 'HS256',
    });
    req.headers.authorization = `Bearer ${token}`;
    const middleware = requireAuth();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authMethod).toBe('oauth');
    expect(req.user.userId).toBe('123');
  });

  it('should return 401 for invalid JWT Bearer token', () => {
    vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
    req.headers.authorization = 'Bearer invalid-token';
    const middleware = requireAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  it('should return 500 when SESSION_SECRET is not set for JWT auth', () => {
    vi.stubEnv('SESSION_SECRET', '');
    req.headers.authorization = 'Bearer some-token';
    const middleware = requireAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session not configured' });
  });

  it('should reject when x-api-secret is invalid even if valid JWT is present', () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
    req.headers['x-api-secret'] = 'wrong-secret';
    sessionStore.set('456', 'discord-access-token');
    const token = jwt.sign({ userId: '456' }, 'jwt-test-secret', { algorithm: 'HS256' });
    req.headers.authorization = `Bearer ${token}`;
    const middleware = requireAuth();

    middleware(req, res, next);

    // Wrong API secret should reject immediately — no JWT fallback
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API secret' });
    expect(next).not.toHaveBeenCalled();
  });
});
