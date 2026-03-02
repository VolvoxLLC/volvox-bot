/**
 * Cache Utility Module
 * High-level caching helpers that use Redis when available and
 * fall back to in-memory LRU when Redis is not configured.
 *
 * All functions are safe to call without checking Redis availability —
 * they handle graceful degradation internally.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/177
 */

import { debug, warn } from '../logger.js';
import { getRedis, recordError, recordHit, recordMiss } from '../redis.js';

/**
 * Default TTLs (in seconds) for different cache categories.
 * Can be overridden via environment variables.
 */
export const TTL = {
  CHANNELS: Number(process.env.REDIS_TTL_CHANNELS) || 300, // 5 min
  ROLES: Number(process.env.REDIS_TTL_ROLES) || 300, // 5 min
  MEMBERS: Number(process.env.REDIS_TTL_MEMBERS) || 60, // 1 min
  CONFIG: Number(process.env.REDIS_TTL_CONFIG) || 60, // 1 min
  REPUTATION: Number(process.env.REDIS_TTL_REPUTATION) || 60, // 1 min
  LEADERBOARD: Number(process.env.REDIS_TTL_LEADERBOARD) || 300, // 5 min
  ANALYTICS: Number(process.env.REDIS_TTL_ANALYTICS) || 3600, // 1 hour
  SESSION: Number(process.env.REDIS_TTL_SESSION) || 86400, // 24 hours
  CHANNEL_DETAIL: Number(process.env.REDIS_TTL_CHANNEL_DETAIL) || 600, // 10 min
};

/** @type {Map<string, {value: unknown, expiresAt: number}>} In-memory LRU fallback */
const memoryCache = new Map();
const MAX_MEMORY_CACHE_SIZE = 1000;

/** Interval reference for memory cache cleanup */
let cleanupInterval = null;

/**
 * Start periodic cleanup of expired in-memory cache entries.
 * Called automatically on first cache operation.
 */
function ensureCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryCache) {
      if (now >= entry.expiresAt) {
        memoryCache.delete(key);
      }
    }
  }, 60_000);
  cleanupInterval.unref();
}

/**
 * Evict oldest entries when memory cache exceeds max size.
 */
function evictIfNeeded() {
  if (memoryCache.size <= MAX_MEMORY_CACHE_SIZE) return;
  // Delete the oldest 10% to avoid evicting on every set
  const toDelete = Math.floor(MAX_MEMORY_CACHE_SIZE * 0.1);
  const keys = memoryCache.keys();
  for (let i = 0; i < toDelete; i++) {
    const { value: key, done } = keys.next();
    if (done) break;
    memoryCache.delete(key);
  }
}

/**
 * Get a value from cache (Redis or in-memory fallback).
 *
 * @param {string} key - Cache key
 * @returns {Promise<unknown|null>} Cached value or null if not found
 */
export async function cacheGet(key) {
  const redis = getRedis();

  if (redis) {
    try {
      const val = await redis.get(key);
      if (val !== null) {
        recordHit();
        debug('Cache hit (Redis)', { key });
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
      recordMiss();
      debug('Cache miss (Redis)', { key });
      return null;
    } catch (err) {
      recordError();
      warn('Redis cache get error, falling back to memory', { key, error: err.message });
    }
  }

  // In-memory fallback
  ensureCleanup();
  const entry = memoryCache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    recordHit();
    // Refresh position for LRU
    memoryCache.delete(key);
    memoryCache.set(key, entry);
    return entry.value;
  }
  if (entry) {
    memoryCache.delete(key);
  }
  recordMiss();
  return null;
}

/**
 * Set a value in cache (Redis or in-memory fallback).
 *
 * @param {string} key - Cache key
 * @param {unknown} value - Value to cache (will be JSON-serialized)
 * @param {number} [ttlSeconds=60] - TTL in seconds
 * @returns {Promise<void>}
 */
export async function cacheSet(key, value, ttlSeconds = 60) {
  const redis = getRedis();

  if (redis) {
    try {
      const serialized = JSON.stringify(value);
      await redis.setex(key, ttlSeconds, serialized);
      debug('Cache set (Redis)', { key, ttl: ttlSeconds });
      return;
    } catch (err) {
      recordError();
      warn('Redis cache set error, falling back to memory', { key, error: err.message });
    }
  }

  // In-memory fallback
  ensureCleanup();
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  evictIfNeeded();
}

/**
 * Delete a key from cache.
 *
 * @param {string} key - Cache key
 * @returns {Promise<void>}
 */
export async function cacheDel(key) {
  const redis = getRedis();

  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch (err) {
      recordError();
      warn('Redis cache del error', { key, error: err.message });
    }
  }

  memoryCache.delete(key);
}

/**
 * Delete all keys matching a pattern (e.g., "config:*" or "reputation:12345:*").
 * Uses SCAN for Redis (non-blocking), iterates in-memory for fallback.
 *
 * @param {string} pattern - Glob pattern (e.g., "config:*")
 * @returns {Promise<number>} Number of keys deleted
 */
export async function cacheDelPattern(pattern) {
  const redis = getRedis();
  let deleted = 0;

  if (redis) {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== '0');
      return deleted;
    } catch (err) {
      recordError();
      warn('Redis cache pattern delete error', { pattern, error: err.message });
    }
  }

  // In-memory fallback: convert glob to regex
  // Escape regex metacharacters first, then substitute glob wildcards
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
      deleted++;
    }
  }
  return deleted;
}

/**
 * Get-or-set pattern: return cached value or compute and cache it.
 *
 * @param {string} key - Cache key
 * @param {() => Promise<unknown>} factory - Async function to produce the value on cache miss
 * @param {number} [ttlSeconds=60] - TTL in seconds
 * @returns {Promise<unknown>} The cached or freshly computed value
 */
export async function cacheGetOrSet(key, factory, ttlSeconds = 60) {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;

  const value = await factory();
  if (value !== null && value !== undefined) {
    await cacheSet(key, value, ttlSeconds);
  }
  return value;
}

/**
 * Clear all app cache entries (both Redis and in-memory).
 * Uses SCAN + DEL to remove only app-prefixed keys instead of
 * flushdb(), which is dangerous in shared Redis environments.
 *
 * @returns {Promise<void>}
 */
export async function cacheClear() {
  const redis = getRedis();
  if (redis) {
    try {
      // Scan and delete all known app-prefixed keys instead of flushdb()
      const prefixes = [
        'rl:*',
        'reputation:*',
        'rank:*',
        'leaderboard:*',
        'discord:*',
        'config:*',
        'session:*',
      ];
      for (const pattern of prefixes) {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
          cursor = nextCursor;
          if (keys.length > 0) {
            await redis.del(...keys);
          }
        } while (cursor !== '0');
      }
    } catch (err) {
      recordError();
      warn('Redis cache clear error', { error: err.message });
    }
  }
  memoryCache.clear();
}

/**
 * Stop the memory cache cleanup interval.
 * Call during graceful shutdown.
 */
export function stopCacheCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Get memory cache size (for diagnostics).
 *
 * @returns {number}
 */
export function getMemoryCacheSize() {
  return memoryCache.size;
}

/**
 * Reset all internal state — for testing only.
 * @internal
 */
export function _resetCache() {
  memoryCache.clear();
  stopCacheCleanup();
}
