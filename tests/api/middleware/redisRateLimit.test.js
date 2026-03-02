import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock redis
vi.mock('../../../src/redis.js', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

// Mock the in-memory rate limiter
vi.mock('../../../src/api/middleware/rateLimit.js', () => ({
  rateLimit: vi.fn().mockReturnValue(
    Object.assign(
      vi.fn().mockImplementation((_req, _res, next) => next()),
      { destroy: vi.fn() },
    ),
  ),
}));

describe('redisRateLimit', () => {
  let redisRateLimit;
  let getRedis;
  let rateLimit;

  beforeEach(async () => {
    vi.resetModules();
    const redisMod = await import('../../../src/redis.js');
    getRedis = redisMod.getRedis;

    const rateLimitMod = await import('../../../src/api/middleware/rateLimit.js');
    rateLimit = rateLimitMod.rateLimit;

    const mod = await import('../../../src/api/middleware/redisRateLimit.js');
    redisRateLimit = mod.redisRateLimit;
  });

  function makeReq(ip = '127.0.0.1') {
    return { ip };
  }

  function makeRes() {
    const headers = {};
    return {
      set: vi.fn((k, v) => { headers[k] = v; }),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      _headers: headers,
    };
  }

  it('falls back to in-memory when Redis is not available', async () => {
    getRedis.mockReturnValue(null);
    const middleware = redisRateLimit();
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    // Should have called the in-memory fallback
    expect(next).toHaveBeenCalled();
  });

  it('uses Redis when available', async () => {
    const redisMock = {
      multi: vi.fn().mockReturnThis(),
      incr: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 1], // incr result
        [null, -1], // pttl result (new key)
      ]),
      pexpire: vi.fn().mockResolvedValue(1),
    };
    getRedis.mockReturnValue(redisMock);

    const middleware = redisRateLimit({ max: 10 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
    expect(redisMock.pexpire).toHaveBeenCalled();
  });

  it('returns 429 when limit exceeded', async () => {
    const redisMock = {
      multi: vi.fn().mockReturnThis(),
      incr: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 101], // count exceeds max
        [null, 60000], // 60s remaining
      ]),
    };
    getRedis.mockReturnValue(redisMock);

    const middleware = redisRateLimit({ max: 100 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many requests, please try again later' });
  });

  it('falls back to in-memory on Redis error', async () => {
    const redisMock = {
      multi: vi.fn().mockReturnThis(),
      incr: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockRejectedValue(new Error('Redis down')),
    };
    getRedis.mockReturnValue(redisMock);

    const middleware = redisRateLimit();
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('destroy() cleans up fallback timer', () => {
    const middleware = redisRateLimit();
    expect(() => middleware.destroy()).not.toThrow();
  });
});
