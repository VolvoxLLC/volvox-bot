/**
 * Redis Client
 * Lazily-initialised ioredis client for session storage.
 * If REDIS_URL is not configured, getRedisClient() returns null and all
 * callers fall back to the in-memory implementation.
 */

import Redis from 'ioredis';
import { error as logError, warn } from '../../logger.js';

/** @type {Redis | null} */
let _client = null;
let _initialized = false;

/**
 * Return the ioredis client, initialising it on first call.
 * Returns null if REDIS_URL is not configured.
 *
 * @returns {Redis | null}
 */
export function getRedisClient() {
  if (_initialized) return _client;
  _initialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    _client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    _client.on('error', (err) => {
      logError('Redis connection error', { error: err.message });
    });
  } catch (err) {
    logError('Failed to initialise Redis client', { error: err.message });
    _client = null;
  }

  return _client;
}

/**
 * Gracefully close the Redis connection.
 * Safe to call even if Redis was never configured.
 *
 * @returns {Promise<void>}
 */
export async function closeRedis() {
  if (!_client) return;
  try {
    await _client.quit();
  } catch (err) {
    warn('Redis quit error during shutdown', { error: err.message });
  } finally {
    _client = null;
    _initialized = false;
  }
}

/**
 * Reset internal state — for testing only.
 * @internal
 */
export function _resetRedisClient() {
  _client = null;
  _initialized = false;
}
