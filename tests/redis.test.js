import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger to avoid console noise
vi.mock('../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock ioredis
vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
  }));
  return { default: RedisMock };
});

describe('redis.js', () => {
  let redis;

  beforeEach(async () => {
    vi.resetModules();
    delete process.env.REDIS_URL;
    redis = await import('../src/redis.js');
    await redis._resetRedis();
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

    it('creates client when REDIS_URL is set', async () => {
      vi.resetModules();
      process.env.REDIS_URL = 'redis://localhost:6379';

      // Re-mock ioredis with a proper class implementation
      const mockClient = {
        on: vi.fn(),
        quit: vi.fn().mockResolvedValue('OK'),
      };
      vi.doMock('ioredis', () => ({
        default: vi.fn().mockImplementation(function () { return mockClient; }),
      }));

      const freshRedis = await import('../src/redis.js');
      freshRedis._resetRedis();

      const client = freshRedis.initRedis();
      expect(client).not.toBeNull();
      expect(mockClient.on).toHaveBeenCalled();
    });

    it('returns same client on subsequent calls (singleton)', async () => {
      vi.resetModules();
      process.env.REDIS_URL = 'redis://localhost:6379';
      const freshRedis = await import('../src/redis.js');
      freshRedis._resetRedis();

      const client1 = freshRedis.initRedis();
      const client2 = freshRedis.initRedis();
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
