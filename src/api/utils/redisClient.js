/**
 * Redis Client (API Compatibility Layer)
 * Re-exports from the centralized src/redis.js module.
 *
 * Existing code that imports from this file continues to work without changes.
 * New code should import directly from src/redis.js.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/177
 */

import { _resetRedis, closeRedisClient, getRedis } from '../../redis.js';

/**
 * Return the ioredis client.
 * Returns null if REDIS_URL is not configured.
 *
 * @returns {import('ioredis').Redis | null}
 */
export function getRedisClient() {
  return getRedis();
}

/**
 * Gracefully close the Redis connection.
 *
 * @returns {Promise<void>}
 */
export async function closeRedis() {
  return closeRedisClient();
}

/**
 * Reset internal state — for testing only.
 * @internal
 */
export async function _resetRedisClient() {
  await _resetRedis();
}
