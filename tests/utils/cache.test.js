import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock redis module — default: no Redis
vi.mock('../../src/redis.js', () => ({
  getRedis: vi.fn().mockReturnValue(null),
  recordHit: vi.fn(),
  recordMiss: vi.fn(),
  recordError: vi.fn(),
}));

describe('cache.js — in-memory fallback', () => {
  let cache;

  beforeEach(async () => {
    vi.resetModules();
    cache = await import('../../src/utils/cache.js');
    cache._resetCache();
  });

  afterEach(() => {
    cache._resetCache();
  });

  describe('cacheGet / cacheSet', () => {
    it('returns null for missing keys', async () => {
      const result = await cache.cacheGet('nonexistent');
      expect(result).toBeNull();
    });

    it('stores and retrieves values', async () => {
      await cache.cacheSet('test:key', { hello: 'world' }, 60);
      const result = await cache.cacheGet('test:key');
      expect(result).toEqual({ hello: 'world' });
    });

    it('respects TTL expiration', async () => {
      vi.useFakeTimers();
      try {
        await cache.cacheSet('test:ttl', 'value', 1); // 1 second TTL

        // Still valid
        let result = await cache.cacheGet('test:ttl');
        expect(result).toBe('value');

        // Advance past TTL
        vi.advanceTimersByTime(1500);
        result = await cache.cacheGet('test:ttl');
        expect(result).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('handles string values', async () => {
      await cache.cacheSet('test:string', 'hello', 60);
      const result = await cache.cacheGet('test:string');
      expect(result).toBe('hello');
    });

    it('handles numeric values', async () => {
      await cache.cacheSet('test:num', 42, 60);
      const result = await cache.cacheGet('test:num');
      expect(result).toBe(42);
    });

    it('handles array values', async () => {
      await cache.cacheSet('test:arr', [1, 2, 3], 60);
      const result = await cache.cacheGet('test:arr');
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('cacheDel', () => {
    it('removes a key', async () => {
      await cache.cacheSet('test:del', 'value', 60);
      await cache.cacheDel('test:del');
      const result = await cache.cacheGet('test:del');
      expect(result).toBeNull();
    });

    it('is safe for non-existent keys', async () => {
      await expect(cache.cacheDel('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('cacheDelPattern', () => {
    it('deletes keys matching pattern', async () => {
      await cache.cacheSet('prefix:a', 1, 60);
      await cache.cacheSet('prefix:b', 2, 60);
      await cache.cacheSet('other:c', 3, 60);

      const deleted = await cache.cacheDelPattern('prefix:*');
      expect(deleted).toBe(2);

      expect(await cache.cacheGet('prefix:a')).toBeNull();
      expect(await cache.cacheGet('prefix:b')).toBeNull();
      expect(await cache.cacheGet('other:c')).toBe(3);
    });
  });

  describe('cacheGetOrSet', () => {
    it('returns cached value without calling factory', async () => {
      await cache.cacheSet('test:cached', 'existing', 60);
      const factory = vi.fn().mockResolvedValue('new');

      const result = await cache.cacheGetOrSet('test:cached', factory, 60);
      expect(result).toBe('existing');
      expect(factory).not.toHaveBeenCalled();
    });

    it('calls factory and caches on miss', async () => {
      const factory = vi.fn().mockResolvedValue('computed');

      const result = await cache.cacheGetOrSet('test:miss', factory, 60);
      expect(result).toBe('computed');
      expect(factory).toHaveBeenCalledOnce();

      // Verify it was cached
      const cached = await cache.cacheGet('test:miss');
      expect(cached).toBe('computed');
    });

    it('does not cache null/undefined factory results', async () => {
      const factory = vi.fn().mockResolvedValue(null);

      const result = await cache.cacheGetOrSet('test:null', factory, 60);
      expect(result).toBeNull();

      const cached = await cache.cacheGet('test:null');
      expect(cached).toBeNull();
    });
  });

  describe('getMemoryCacheSize', () => {
    it('returns current size', async () => {
      expect(cache.getMemoryCacheSize()).toBe(0);
      await cache.cacheSet('a', 1, 60);
      await cache.cacheSet('b', 2, 60);
      expect(cache.getMemoryCacheSize()).toBe(2);
    });
  });

  describe('cacheClear', () => {
    it('removes all entries', async () => {
      await cache.cacheSet('a', 1, 60);
      await cache.cacheSet('b', 2, 60);
      await cache.cacheClear();
      expect(cache.getMemoryCacheSize()).toBe(0);
    });
  });
});

describe('cache.js — with Redis', () => {
  let cache;
  let redisMock;
  let getRedis;

  beforeEach(async () => {
    vi.resetModules();

    redisMock = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      scan: vi.fn().mockResolvedValue(['0', []]),
      flushdb: vi.fn().mockResolvedValue('OK'),
    };

    const redisMod = await import('../../src/redis.js');
    getRedis = redisMod.getRedis;
    getRedis.mockReturnValue(redisMock);

    cache = await import('../../src/utils/cache.js');
    cache._resetCache();
  });

  afterEach(() => {
    cache._resetCache();
  });

  it('reads from Redis when available', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({ data: 'from-redis' }));

    const result = await cache.cacheGet('test:key');
    expect(result).toEqual({ data: 'from-redis' });
    expect(redisMock.get).toHaveBeenCalledWith('test:key');
  });

  it('writes to Redis when available', async () => {
    await cache.cacheSet('test:key', { data: 'value' }, 120);
    expect(redisMock.setex).toHaveBeenCalledWith(
      'test:key',
      120,
      JSON.stringify({ data: 'value' }),
    );
  });

  it('deletes from Redis when available', async () => {
    await cache.cacheDel('test:key');
    expect(redisMock.del).toHaveBeenCalledWith('test:key');
  });

  it('falls back to memory on Redis error', async () => {
    redisMock.get.mockRejectedValue(new Error('Connection refused'));

    // Should not throw
    const result = await cache.cacheGet('test:key');
    expect(result).toBeNull();
  });

  it('cacheDelPattern uses SCAN', async () => {
    redisMock.scan
      .mockResolvedValueOnce(['1', ['match:a', 'match:b']])
      .mockResolvedValueOnce(['0', ['match:c']]);
    redisMock.del.mockResolvedValue(2);

    const deleted = await cache.cacheDelPattern('match:*');
    expect(deleted).toBe(3); // 2 keys from first scan + 1 from second
    expect(redisMock.scan).toHaveBeenCalledTimes(2);
    expect(redisMock.del).toHaveBeenCalledTimes(2);
  });
});

describe('TTL defaults', () => {
  it('has expected default values', async () => {
    vi.resetModules();
    const { TTL } = await import('../../src/utils/cache.js');

    expect(TTL.CHANNELS).toBe(300);
    expect(TTL.ROLES).toBe(300);
    expect(TTL.MEMBERS).toBe(60);
    expect(TTL.CONFIG).toBe(60);
    expect(TTL.REPUTATION).toBe(60);
    expect(TTL.LEADERBOARD).toBe(300);
    expect(TTL.ANALYTICS).toBe(3600);
    expect(TTL.SESSION).toBe(86400);
  });
});
