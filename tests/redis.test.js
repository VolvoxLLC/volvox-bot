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
        default: class MockRedis {
          constructor() {
            Object.assign(this, mockClient);
          }
        },
      }));

      const freshRedis = await import('../src/redis.js');
      await freshRedis._resetRedis();

      const client = freshRedis.initRedis();
      expect(client).not.toBeNull();
      expect(mockClient.on).toHaveBeenCalled();
    });

    it('returns same client on subsequent calls (singleton)', async () => {
      vi.resetModules();
      process.env.REDIS_URL = 'redis://localhost:6379';
      const freshRedis = await import('../src/redis.js');
      await freshRedis._resetRedis();

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

    it('handles quit() rejection gracefully', async () => {
      vi.resetModules();
      process.env.REDIS_URL = 'redis://localhost:6379';

      vi.doMock('ioredis', () => ({
        default: class MockRedis {
          constructor() {
            this.on = vi.fn();
            this.quit = vi.fn().mockRejectedValue(new Error('quit failed'));
            this.disconnect = vi.fn();
          }
        },
      }));

      const freshRedis = await import('../src/redis.js');
      await freshRedis._resetRedis();
      freshRedis.initRedis();

      await expect(freshRedis.closeRedisClient()).resolves.toBeUndefined();
      // After close, connected state should be reset
      expect(freshRedis.isRedisReady()).toBe(false);
    });
  });

  describe('retryStrategy', () => {
    let freshRedis;
    let capturedRetryStrategy;

    beforeEach(async () => {
      vi.resetModules();
      process.env.REDIS_URL = 'redis://localhost:6379';

      vi.doMock('ioredis', () => ({
        default: class MockRedis {
          constructor(_url, options) {
            capturedRetryStrategy = options.retryStrategy;
            this.on = vi.fn();
            this.quit = vi.fn().mockResolvedValue('OK');
            this.disconnect = vi.fn();
          }
        },
      }));

      freshRedis = await import('../src/redis.js');
      await freshRedis._resetRedis();
      freshRedis.initRedis();
    });

    afterEach(async () => {
      await freshRedis._resetRedis();
    });

    it('returns delay based on attempt count when times <= 10', () => {
      expect(capturedRetryStrategy(1)).toBe(200);
      expect(capturedRetryStrategy(5)).toBe(1000);
      expect(capturedRetryStrategy(10)).toBe(2000);
    });

    it('returns null when times > 10 to stop retrying', () => {
      expect(capturedRetryStrategy(11)).toBeNull();
      expect(capturedRetryStrategy(50)).toBeNull();
    });
  });

  describe('event handlers', () => {
    let freshRedis;
    let eventHandlers;

    beforeEach(async () => {
      vi.resetModules();
      process.env.REDIS_URL = 'redis://localhost:6379';

      eventHandlers = {};
      vi.doMock('ioredis', () => ({
        default: class MockRedis {
          constructor() {
            this.on = vi.fn((event, handler) => {
              eventHandlers[event] = handler;
            });
            this.quit = vi.fn().mockResolvedValue('OK');
            this.disconnect = vi.fn();
          }
        },
      }));

      freshRedis = await import('../src/redis.js');
      await freshRedis._resetRedis();
      freshRedis.initRedis();
    });

    afterEach(async () => {
      await freshRedis._resetRedis();
    });

    it('connect sets connected to true and records connectedAt', () => {
      eventHandlers.connect();
      expect(freshRedis.isRedisReady()).toBe(true);
      const stats = freshRedis.getRedisStats();
      expect(stats.connected).toBe(true);
      expect(stats.connectedAt).toBeTypeOf('number');
    });

    it('ready fires without error', () => {
      expect(() => eventHandlers.ready()).not.toThrow();
    });

    it('close sets connected to false', () => {
      eventHandlers.connect();
      expect(freshRedis.isRedisReady()).toBe(true);
      eventHandlers.close();
      expect(freshRedis.isRedisReady()).toBe(false);
      expect(freshRedis.getRedisStats().connected).toBe(false);
    });

    it('error sets connected to false and increments errors', () => {
      eventHandlers.connect();
      eventHandlers.error(new Error('Connection lost'));
      expect(freshRedis.isRedisReady()).toBe(false);
      expect(freshRedis.getRedisStats().errors).toBe(1);
    });

    it('reconnecting fires without error', () => {
      expect(() => eventHandlers.reconnecting()).not.toThrow();
    });
  });

  describe('isRedisReady() when connected', () => {
    it('returns true when connected and client exists', async () => {
      vi.resetModules();
      process.env.REDIS_URL = 'redis://localhost:6379';

      const handlers = {};
      vi.doMock('ioredis', () => ({
        default: class MockRedis {
          constructor() {
            this.on = vi.fn((event, handler) => {
              handlers[event] = handler;
            });
            this.quit = vi.fn().mockResolvedValue('OK');
            this.disconnect = vi.fn();
          }
        },
      }));

      const freshRedis = await import('../src/redis.js');
      await freshRedis._resetRedis();
      freshRedis.initRedis();
      handlers.connect();

      expect(freshRedis.isRedisReady()).toBe(true);
      await freshRedis._resetRedis();
    });
  });

  describe('getRedisStats() with active connection', () => {
    it('returns connected stats with connectedAt timestamp', async () => {
      vi.resetModules();
      process.env.REDIS_URL = 'redis://localhost:6379';

      const handlers = {};
      vi.doMock('ioredis', () => ({
        default: class MockRedis {
          constructor() {
            this.on = vi.fn((event, handler) => {
              handlers[event] = handler;
            });
            this.quit = vi.fn().mockResolvedValue('OK');
            this.disconnect = vi.fn();
          }
        },
      }));

      const freshRedis = await import('../src/redis.js');
      await freshRedis._resetRedis();
      freshRedis.initRedis();
      handlers.connect();

      freshRedis.recordHit();
      freshRedis.recordMiss();
      freshRedis.recordError();

      const stats = freshRedis.getRedisStats();
      expect(stats.connected).toBe(true);
      expect(stats.connectedAt).toBeTypeOf('number');
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.errors).toBe(1);
      expect(stats.hitRate).toBe('50.0%');
      await freshRedis._resetRedis();
    });
  });

  describe('recordError()', () => {
    it('increments error count', () => {
      redis.recordError();
      redis.recordError();
      redis.recordError();
      expect(redis.getRedisStats().errors).toBe(3);
    });
  });

  describe('_resetRedis()', () => {
    it('calls disconnect when quit rejects', async () => {
      vi.resetModules();
      process.env.REDIS_URL = 'redis://localhost:6379';

      const mockDisconnect = vi.fn();
      vi.doMock('ioredis', () => ({
        default: class MockRedis {
          constructor() {
            this.on = vi.fn();
            this.quit = vi.fn().mockRejectedValue(new Error('quit failed'));
            this.disconnect = mockDisconnect;
          }
        },
      }));

      const freshRedis = await import('../src/redis.js');
      await freshRedis._resetRedis();
      freshRedis.initRedis();

      await freshRedis._resetRedis();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('resets all stats to initial values', async () => {
      redis.recordHit();
      redis.recordMiss();
      redis.recordError();
      await redis._resetRedis();

      const stats = redis.getRedisStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.errors).toBe(0);
      expect(stats.connectedAt).toBeNull();
      expect(stats.connected).toBe(false);
    });
  });
});
