import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rateLimit } from '../../../src/api/middleware/rateLimit.js';

describe('rateLimit middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { ip: '127.0.0.1' };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: vi.fn(),
    };
    next = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should allow requests within the limit', () => {
    const middleware = rateLimit({ windowMs: 60000, max: 5 });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 429 when limit is exceeded', () => {
    const middleware = rateLimit({ windowMs: 60000, max: 2 });

    // First two requests pass
    middleware(req, res, next);
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    // Third request blocked
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Too many requests, please try again later',
    });
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('should track IPs independently', () => {
    const middleware = rateLimit({ windowMs: 60000, max: 1 });

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Second request from same IP blocked
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);

    // Request from different IP passes
    const req2 = { ip: '192.168.1.1' };
    const next2 = vi.fn();
    middleware(req2, res, next2);
    expect(next2).toHaveBeenCalled();
  });

  it('should reset count after window expires', () => {
    vi.useFakeTimers();
    const middleware = rateLimit({ windowMs: 1000, max: 1 });

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Blocked
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);

    // Advance past window
    vi.advanceTimersByTime(1001);

    // Should pass again
    const next3 = vi.fn();
    middleware(req, res, next3);
    expect(next3).toHaveBeenCalled();
  });

  it('should use default values when no options provided', () => {
    const middleware = rateLimit();

    // Should allow at least one request
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should expose size() returning the number of tracked IPs', () => {
    const middleware = rateLimit({ windowMs: 60000, max: 10 });
    expect(middleware.size()).toBe(0);

    middleware(req, res, next);
    expect(middleware.size()).toBe(1);

    middleware({ ip: '10.0.0.1' }, res, vi.fn());
    middleware({ ip: '10.0.0.2' }, res, vi.fn());
    expect(middleware.size()).toBe(3);
  });

  it('sweep() should remove expired entries and return count', () => {
    vi.useFakeTimers();
    const middleware = rateLimit({ windowMs: 1000, max: 10 });
    // Destroy the automatic interval so we can test sweep() in isolation
    middleware.destroy();

    // Create entries from 3 IPs
    middleware(req, res, next);
    middleware({ ip: '10.0.0.1' }, res, vi.fn());
    middleware({ ip: '10.0.0.2' }, res, vi.fn());
    expect(middleware.size()).toBe(3);

    // Nothing expired yet
    expect(middleware.sweep()).toBe(0);
    expect(middleware.size()).toBe(3);

    // Advance past window — entries expire
    vi.advanceTimersByTime(1001);

    // Manual sweep removes all 3
    expect(middleware.sweep()).toBe(3);
    expect(middleware.size()).toBe(0);
  });

  it('sweep() should only remove expired entries, keeping active ones', () => {
    vi.useFakeTimers();
    const middleware = rateLimit({ windowMs: 2000, max: 10 });
    middleware.destroy();

    // First IP at t=0 (resetAt = 2000)
    middleware(req, res, next);
    expect(middleware.size()).toBe(1);

    // Advance 1500ms
    vi.advanceTimersByTime(1500);

    // Second IP at t=1500 (resetAt = 3500)
    middleware({ ip: '10.0.0.1' }, res, vi.fn());
    expect(middleware.size()).toBe(2);

    // Advance another 600ms (t=2100) — first IP expired, second still active
    vi.advanceTimersByTime(600);
    expect(middleware.sweep()).toBe(1);
    expect(middleware.size()).toBe(1);
  });

  it('automatic interval should sweep stale entries', () => {
    vi.useFakeTimers();
    const middleware = rateLimit({ windowMs: 1000, max: 10 });

    middleware(req, res, next);
    expect(middleware.size()).toBe(1);

    // Advance past the window — interval fires and cleans up
    vi.advanceTimersByTime(1001);
    expect(middleware.size()).toBe(0);
  });

  it('destroy() should clean up the interval timer', () => {
    const middleware = rateLimit({ windowMs: 1000, max: 1 });
    // Should not throw
    expect(() => middleware.destroy()).not.toThrow();
    // After destroy, sweep still works (it's independent of the timer)
    expect(middleware.sweep()).toBe(0);
  });

  it('should use custom message when provided', () => {
    const middleware = rateLimit({
      windowMs: 60000,
      max: 1,
      message: 'Too many authentication attempts',
    });

    // First request passes
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Second request blocked with custom message
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Too many authentication attempts',
    });
    expect(next).toHaveBeenCalledTimes(1); // only the first (allowed) request called next
  });
});
