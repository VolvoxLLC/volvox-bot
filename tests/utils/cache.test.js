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

describe('cache.js — LRU eviction', () => {
  let cache;

  beforeEach(async () => {
    vi.resetModules();
    const redisMod = await import('../../src/redis.js');
    redisMod.getRedis.mockReturnValue(null);
    cache = await import('../../src/utils/cache.js');
    cache._resetCache();
  });

  afterEach(() => {
    cache._resetCache();
  });

  it('evicts oldest 10% when cache exceeds 1000 entries', async () => {
    for (let i = 0; i < 1001; i++) {
      await cache.cacheSet(`evict:${i}`, i, 600);
    }

    // Oldest 10% (100 entries) should be evicted
    const size = cache.getMemoryCacheSize();
    expect(size).toBe(1001 - 100);

    // First 100 entries should be gone
    expect(await cache.cacheGet('evict:0')).toBeNull();
    expect(await cache.cacheGet('evict:99')).toBeNull();

    // Entry after eviction window should still exist
    expect(await cache.cacheGet('evict:100')).toBe(100);
  });
});

describe('cache.js — LRU refresh on hit', () => {
  let cache;

  beforeEach(async () => {
    vi.resetModules();
    const redisMod = await import('../../src/redis.js');
    redisMod.getRedis.mockReturnValue(null);
    cache = await import('../../src/utils/cache.js');
    cache._resetCache();
  });

  afterEach(() => {
    cache._resetCache();
  });

  it('moves accessed key to end of map for LRU ordering', async () => {
    // Fill cache to exactly 1000 entries
    for (let i = 0; i < 1000; i++) {
      await cache.cacheSet(`k:${i}`, i, 600);
    }

    // Access k:0 — moves it to the end of the map
    const val = await cache.cacheGet('k:0');
    expect(val).toBe(0);

    // Add one more entry to trigger eviction of oldest 100
    await cache.cacheSet('k:1000', 1000, 600);

    // k:1 was the oldest (k:0 was refreshed), so it should be evicted
    expect(await cache.cacheGet('k:1')).toBeNull();
    expect(await cache.cacheGet('k:100')).toBeNull();

    // k:0 was refreshed to the end, should survive eviction
    expect(await cache.cacheGet('k:0')).toBe(0);

    // Entry well past eviction window should still exist
    expect(await cache.cacheGet('k:500')).toBe(500);
  });
});

describe('cache.js — cleanup interval', () => {
  let cache;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const redisMod = await import('../../src/redis.js');
    redisMod.getRedis.mockReturnValue(null);
    cache = await import('../../src/utils/cache.js');
    cache._resetCache();
  });

  afterEach(() => {
    cache._resetCache();
    vi.useRealTimers();
  });

  it('removes expired entries after 60-second interval', async () => {
    await cache.cacheSet('cleanup:short', 'val', 5);
    await cache.cacheSet('cleanup:long', 'val', 120);

    expect(cache.getMemoryCacheSize()).toBe(2);

    // Advance past the short TTL but not the cleanup interval
    vi.advanceTimersByTime(10_000);
    expect(cache.getMemoryCacheSize()).toBe(2);

    // Advance to trigger the 60-second cleanup interval
    vi.advanceTimersByTime(50_000);
    expect(cache.getMemoryCacheSize()).toBe(1);

    // The long-lived entry should still be accessible
    const result = await cache.cacheGet('cleanup:long');
    expect(result).toBe('val');
  });

  it('only starts cleanup interval once', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    await cache.cacheSet('a', 1, 60);
    await cache.cacheSet('b', 2, 60);
    await cache.cacheGet('a');
    await cache.cacheGet('b');

    // ensureCleanup is called on every get/set but setInterval
    // should only fire once for the cleanup interval
    expect(setIntervalSpy).toHaveBeenCalled();
    const cleanupCalls = setIntervalSpy.mock.calls.filter(([, interval]) => interval === 60_000);
    expect(cleanupCalls.length).toBe(1);

    setIntervalSpy.mockRestore();
  });
});

describe('cache.js — stopCacheCleanup', () => {
  let cache;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const redisMod = await import('../../src/redis.js');
    redisMod.getRedis.mockReturnValue(null);
    cache = await import('../../src/utils/cache.js');
    cache._resetCache();
  });

  afterEach(() => {
    cache._resetCache();
    vi.useRealTimers();
  });

  it('stops the cleanup interval so expired entries persist', async () => {
    await cache.cacheSet('stop:key', 'val', 5);
    expect(cache.getMemoryCacheSize()).toBe(1);

    // Stop cleanup
    cache.stopCacheCleanup();

    // Advance past TTL and past the cleanup interval
    vi.advanceTimersByTime(120_000);

    // The entry is still in memory (expired but not cleaned up)
    expect(cache.getMemoryCacheSize()).toBe(1);
  });
});

describe('cache.js — Redis error fallbacks', () => {
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

  it('cacheSet falls back to memory when Redis setex throws', async () => {
    redisMock.setex.mockRejectedValue(new Error('Redis write error'));

    await cache.cacheSet('fallback:key', 'myval', 60);

    // Value should be stored in memory despite Redis failure
    // Temporarily disable Redis to read from memory
    getRedis.mockReturnValue(null);
    const result = await cache.cacheGet('fallback:key');
    expect(result).toBe('myval');
  });

  it('cacheDel falls back to memory delete when Redis del throws', async () => {
    // First store a value in memory (bypass Redis for the store)
    getRedis.mockReturnValue(null);
    await cache.cacheSet('delerr:key', 'val', 60);
    expect(cache.getMemoryCacheSize()).toBe(1);

    // Re-enable Redis, make del throw
    getRedis.mockReturnValue(redisMock);
    redisMock.del.mockRejectedValue(new Error('Redis del error'));

    await cache.cacheDel('delerr:key');

    // Memory entry should still be deleted
    getRedis.mockReturnValue(null);
    const result = await cache.cacheGet('delerr:key');
    expect(result).toBeNull();
  });

  it('cacheDelPattern falls back to memory on Redis scan error', async () => {
    // Store entries in memory first
    getRedis.mockReturnValue(null);
    await cache.cacheSet('pat:a', 1, 60);
    await cache.cacheSet('pat:b', 2, 60);
    await cache.cacheSet('other:c', 3, 60);

    // Re-enable Redis with failing scan
    getRedis.mockReturnValue(redisMock);
    redisMock.scan.mockRejectedValue(new Error('SCAN failed'));

    const deleted = await cache.cacheDelPattern('pat:*');
    expect(deleted).toBe(2);

    // Memory entries matching pattern should be gone
    getRedis.mockReturnValue(null);
    expect(await cache.cacheGet('pat:a')).toBeNull();
    expect(await cache.cacheGet('pat:b')).toBeNull();
    expect(await cache.cacheGet('other:c')).toBe(3);
  });
});

describe('cache.js — cacheClear with Redis', () => {
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

  it('scans and deletes all known prefix patterns from Redis', async () => {
    // Simulate Redis returning keys for two of the prefixes
    redisMock.scan.mockImplementation((cursor, _match, pattern) => {
      if (pattern === 'config:*' && cursor === '0') {
        return Promise.resolve(['0', ['config:guild1', 'config:guild2']]);
      }
      if (pattern === 'session:*' && cursor === '0') {
        return Promise.resolve(['0', ['session:abc']]);
      }
      return Promise.resolve(['0', []]);
    });

    await cache.cacheClear();

    // Redis scan should be called for each known prefix
    const expectedPrefixes = [
      'rl:*',
      'reputation:*',
      'rank:*',
      'leaderboard:*',
      'discord:*',
      'config:*',
      'session:*',
      'analytics:*',
      'guild:stats:*',
      'mod:stats:*',
      'bot:stats:*',
      'member:enrichment:*',
    ];
    expect(redisMock.scan).toHaveBeenCalledTimes(expectedPrefixes.length);
    for (const prefix of expectedPrefixes) {
      expect(redisMock.scan).toHaveBeenCalledWith('0', 'MATCH', prefix, 'COUNT', 100);
    }

    // del should have been called for the prefixes that returned keys
    expect(redisMock.del).toHaveBeenCalledWith('config:guild1', 'config:guild2');
    expect(redisMock.del).toHaveBeenCalledWith('session:abc');
  });

  it('clears memory cache even when Redis clear fails', async () => {
    redisMock.scan.mockRejectedValue(new Error('Redis unavailable'));

    // Store something in memory
    getRedis.mockReturnValue(null);
    await cache.cacheSet('mem:key', 'val', 60);
    expect(cache.getMemoryCacheSize()).toBe(1);

    // Re-enable broken Redis for the clear
    getRedis.mockReturnValue(redisMock);
    await cache.cacheClear();

    // Memory should still be cleared
    expect(cache.getMemoryCacheSize()).toBe(0);
  });

  it('handles multi-cursor scan during cacheClear', async () => {
    let callCount = 0;
    redisMock.scan.mockImplementation((_cursor, _match, pattern) => {
      if (pattern === 'config:*') {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(['42', ['config:a']]);
        }
        return Promise.resolve(['0', ['config:b']]);
      }
      return Promise.resolve(['0', []]);
    });

    await cache.cacheClear();

    // config:* required two scan iterations
    const configScans = redisMock.scan.mock.calls.filter(([, , pattern]) => pattern === 'config:*');
    expect(configScans.length).toBe(2);

    // config:* required two iterations
    expect(redisMock.del).toHaveBeenCalledWith('config:a');
    expect(redisMock.del).toHaveBeenCalledWith('config:b');
  });
});

describe('cache.js — cacheGetOrSet edge cases', () => {
  let cache;

  beforeEach(async () => {
    vi.resetModules();
    const redisMod = await import('../../src/redis.js');
    redisMod.getRedis.mockReturnValue(null);
    cache = await import('../../src/utils/cache.js');
    cache._resetCache();
  });

  afterEach(() => {
    cache._resetCache();
  });

  it('does not cache undefined factory result', async () => {
    const factory = vi.fn().mockResolvedValue(undefined);

    const result = await cache.cacheGetOrSet('test:undef', factory, 60);
    expect(result).toBeUndefined();
    expect(factory).toHaveBeenCalledOnce();

    // Should not have been cached — factory will be called again
    const factory2 = vi.fn().mockResolvedValue('now-defined');
    const result2 = await cache.cacheGetOrSet('test:undef', factory2, 60);
    expect(result2).toBe('now-defined');
    expect(factory2).toHaveBeenCalledOnce();
  });
});

describe('cache.js — Redis edge cases', () => {
  let cache;
  let redisMock;

  beforeEach(async () => {
    vi.resetModules();

    redisMock = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      scan: vi.fn().mockResolvedValue(['0', []]),
    };

    const redisMod = await import('../../src/redis.js');
    redisMod.getRedis.mockReturnValue(redisMock);

    cache = await import('../../src/utils/cache.js');
    cache._resetCache();
  });

  afterEach(() => {
    cache._resetCache();
  });

  it('returns raw string when Redis value is not valid JSON', async () => {
    redisMock.get.mockResolvedValue('not-json');

    const result = await cache.cacheGet('test:raw');
    expect(result).toBe('not-json');
  });

  it('records a miss when Redis returns null', async () => {
    redisMock.get.mockResolvedValue(null);

    const result = await cache.cacheGet('test:missing');
    expect(result).toBeNull();

    const { recordMiss } = await import('../../src/redis.js');
    expect(recordMiss).toHaveBeenCalled();
  });
});
