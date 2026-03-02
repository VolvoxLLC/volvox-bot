/**
 * Redis Client Module
 * Centralized Redis connection for caching, sessions, and distributed features.
 *
 * Replaces the API-specific redisClient.js with a shared instance used by
 * the entire application. Gracefully degrades when REDIS_URL is not set.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/177
 */

import Redis from 'ioredis';
import { debug, error as logError, info, warn } from './logger.js';

/** @type {import('ioredis').Redis | null} */
let client = null;

/** @type {boolean} */
let initialized = false;

/** @type {boolean} */
let connected = false;

/** Cache hit/miss counters for observability */
const stats = {
  hits: 0,
  misses: 0,
  errors: 0,
  /** @type {number|null} */
  connectedAt: null,
};

/**
 * Initialize the Redis client.
 * Returns null if REDIS_URL is not configured (graceful degradation).
 *
 * @returns {import('ioredis').Redis | null}
 */
export function initRedis() {
  if (initialized) return client;
  initialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    info('Redis not configured (REDIS_URL not set) — caching disabled');
    return null;
  }

  try {
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy(times) {
        if (times > 10) {
          warn('Redis: max reconnect attempts reached, giving up');
          return null; // stop retrying
        }
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });

    client.on('connect', () => {
      connected = true;
      stats.connectedAt = Date.now();
      info('Redis connected');
    });

    client.on('ready', () => {
      debug('Redis ready');
    });

    client.on('close', () => {
      connected = false;
      debug('Redis connection closed');
    });

    client.on('error', (err) => {
      connected = false;
      stats.errors++;
      logError('Redis connection error', { error: err.message });
    });

    client.on('reconnecting', () => {
      debug('Redis reconnecting...');
    });
  } catch (err) {
    logError('Failed to initialize Redis client', { error: err.message });
    client = null;
  }

  return client;
}

/**
 * Get the Redis client instance.
 * Returns null if Redis is not configured or not initialized.
 *
 * @returns {import('ioredis').Redis | null}
 */
export function getRedis() {
  if (!initialized) return initRedis();
  return client;
}

/**
 * Check if Redis is connected and ready.
 *
 * @returns {boolean}
 */
export function isRedisReady() {
  return connected && client !== null;
}

/**
 * Get Redis connection stats for health checks.
 *
 * @returns {{ connected: boolean, hits: number, misses: number, errors: number, connectedAt: number|null, hitRate: string }}
 */
export function getRedisStats() {
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? `${((stats.hits / total) * 100).toFixed(1)}%` : 'N/A';

  return {
    connected,
    hits: stats.hits,
    misses: stats.misses,
    errors: stats.errors,
    connectedAt: stats.connectedAt,
    hitRate,
  };
}

/**
 * Record a cache hit.
 */
export function recordHit() {
  stats.hits++;
}

/**
 * Record a cache miss.
 */
export function recordMiss() {
  stats.misses++;
}

/**
 * Record a cache error.
 */
export function recordError() {
  stats.errors++;
}

/**
 * Gracefully close the Redis connection.
 *
 * @returns {Promise<void>}
 */
export async function closeRedisClient() {
  if (!client) return;
  try {
    await client.quit();
    info('Redis connection closed gracefully');
  } catch (err) {
    warn('Redis quit error during shutdown', { error: err.message });
  } finally {
    client = null;
    initialized = false;
    connected = false;
  }
}

/**
 * Reset internal state — for testing only.
 * @internal
 */
export function _resetRedis() {
  client = null;
  initialized = false;
  connected = false;
  stats.hits = 0;
  stats.misses = 0;
  stats.errors = 0;
  stats.connectedAt = null;
}
