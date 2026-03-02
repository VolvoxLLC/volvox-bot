/**
 * Redis-backed Rate Limiter
 * Distributed rate limiting using Redis for multi-instance deployments.
 * Falls back to the existing in-memory rate limiter when Redis is unavailable.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/177
 */

import { getRedis } from '../../redis.js';
import { rateLimit as inMemoryRateLimit } from './rateLimit.js';

/**
 * Creates Redis-backed rate limiting middleware using a sliding window counter.
 * Automatically falls back to in-memory rate limiting if Redis is not available.
 *
 * @param {Object} [options] - Rate limiter configuration
 * @param {number} [options.windowMs=900000] - Time window in milliseconds (default: 15 minutes)
 * @param {number} [options.max=100] - Maximum requests per window per IP (default: 100)
 * @param {string} [options.keyPrefix='rl'] - Redis key prefix
 * @returns {import('express').RequestHandler & { destroy: () => void }}
 */
export function redisRateLimit({ windowMs = 15 * 60 * 1000, max = 100, keyPrefix = 'rl' } = {}) {
  // Create in-memory fallback (always available)
  const fallback = inMemoryRateLimit({ windowMs, max });

  const middleware = async (req, res, next) => {
    const redis = getRedis();

    // Fall back to in-memory if Redis isn't available
    if (!redis) {
      return fallback(req, res, next);
    }

    const ip = req.ip;
    const windowSec = Math.ceil(windowMs / 1000);
    const key = `${keyPrefix}:${ip}`;

    try {
      // Atomic increment + TTL set via pipeline
      const results = await redis
        .multi()
        .incr(key)
        .pttl(key)
        .exec();

      const count = results[0][1]; // [err, value] tuples from multi
      const pttl = results[1][1];

      // Set TTL on first request (when key was just created with INCR)
      if (pttl === -1) {
        await redis.pexpire(key, windowMs);
      }

      const resetAt = Date.now() + (pttl > 0 ? pttl : windowMs);

      // Set rate-limit headers
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - count)));
      res.set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

      if (count > max) {
        const retryAfter = Math.ceil((pttl > 0 ? pttl : windowMs) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ error: 'Too many requests, please try again later' });
      }

      next();
    } catch {
      // Redis error — fall back to in-memory
      return fallback(req, res, next);
    }
  };

  middleware.destroy = () => fallback.destroy();

  return middleware;
}
