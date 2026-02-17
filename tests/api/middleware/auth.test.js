import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

import { requireAuth } from '../../../src/api/middleware/auth.js';

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
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should return 401 when BOT_API_SECRET is not configured', () => {
    vi.stubEnv('BOT_API_SECRET', '');
    const middleware = requireAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'API authentication not configured' });
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

  it('should return 401 when x-api-secret header does not match', () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    req.headers['x-api-secret'] = 'wrong-secret';
    const middleware = requireAuth();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when x-api-secret header matches', () => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    req.headers['x-api-secret'] = 'test-secret';
    const middleware = requireAuth();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
