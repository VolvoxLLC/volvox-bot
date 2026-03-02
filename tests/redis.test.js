import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger to avoid console noise
vi.mock('../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock ioredis — use function constructor so `new Redis()` returns a proper instance
vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(function () {
    this.on = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
  });
  return { default: RedisMock };
});

import Redis from 'ioredis';
import * as redis from '../src/redis.js';

describe('redis.js', () => {
  beforeEach(async () => {
    delete process.env.REDIS_URL;
    await redis._resetRedis();
    vi.mocked(Redis).mockClear();
  });

  afterEach(async () => {
    await redis._resetRedis();
    delete process.env.REDIS_URL;
  });

  describe('initRedis()', () => {
    it('returns null when REDIS_URL is not set', () => {
      const client = redis.initRedis();
      expect(client).toBeNull();
    });

    it('creates client when REDIS_URL is set', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';

      const client = redis.initRedis();
      expect(client).not.toBeNull();
      // Event handlers are registered (connect, ready, close, error, reconnecting)
      expect(client.on).toHaveBeenCalled();
    });

    it('returns same client on subsequent calls (singleton)', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';

      const client1 = redis.initRedis();
      const client2 = redis.initRedis();
      expect(client1).toBe(client2);
    });
  });

  describe('getRedis()', () => {
    it('initializes on first call if not already initialized', () => {
      const client = redis.getRedis();
      // No REDIS_URL set, should return null
      expect(client).toBeNull();
    });
  });

  describe('isRedisReady()', () => {
    it('returns false when not connected', () => {
      expect(redis.isRedisReady()).toBe(false);
    });
  });

  describe('getRedisStats()', () => {
    it('returns initial stats', () => {
      const stats = redis.getRedisStats();
      expect(stats).toEqual({
        connected: false,
        hits: 0,
        misses: 0,
        errors: 0,
        connectedAt: null,
        hitRate: 'N/A',
      });
    });

    it('calculates hit rate correctly', () => {
      redis.recordHit();
      redis.recordHit();
      redis.recordHit();
      redis.recordMiss();

      const stats = redis.getRedisStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe('75.0%');
    });
  });

  describe('closeRedisClient()', () => {
    it('is safe to call when no client exists', async () => {
      await expect(redis.closeRedisClient()).resolves.toBeUndefined();
    });
  });
});
