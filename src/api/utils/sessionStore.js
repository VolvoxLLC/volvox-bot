/**
 * Session Store Utilities
 * Shared OAuth session token storage and helpers.
 *
 * Backends:
 *   - Redis  — when REDIS_URL is set (recommended for multi-instance deployments)
 *   - Memory — in-process Map fallback (single-node only, lost on restart)
 */

import { getRedisClient } from './redisClient.js';

/**
 * Session TTL — must match the JWT `expiresIn` value in auth.js (currently "1h").
 * If you change one, update the other to keep session and token lifetimes aligned.
 */
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const SESSION_TTL_SECONDS = 60 * 60; // 1 hour, for Redis SETEX

const SESSION_KEY_PREFIX = 'session:';

/**
 * Hybrid session store.
 *
 * When REDIS_URL is configured, all mutating/reading operations hit Redis and
 * return Promises. When Redis is not configured the store falls back to the
 * original in-memory TTL-based Map implementation, which returns values
 * synchronously (though callers should `await` regardless so they are
 * compatible with both backends).
 *
 * ### Map Override Coverage
 *
 * Only `get`, `set`, `has`, `delete`, and `cleanup` are overridden to handle
 * the dual-backend logic. The `clear()` method is inherited from Map and only
 * affects the in-memory store — it is used in tests (which run without
 * REDIS_URL and therefore never touch Redis).
 */
class SessionStore extends Map {
  /**
   * Store an access token for a user.
   *
   * @param {string} userId
   * @param {string} accessToken
   * @returns {this | Promise<'OK'>}
   */
  set(userId, accessToken) {
    const client = getRedisClient();
    if (client) {
      return client.setex(`${SESSION_KEY_PREFIX}${userId}`, SESSION_TTL_SECONDS, accessToken);
    }
    return super.set(userId, { accessToken, expiresAt: Date.now() + SESSION_TTL_MS });
  }

  /**
   * Get the stored access token for a user.
   * Returns undefined/null if not found or expired.
   *
   * @param {string} userId
   * @returns {string | undefined | Promise<string | null>}
   */
  get(userId) {
    const client = getRedisClient();
    if (client) {
      return client.get(`${SESSION_KEY_PREFIX}${userId}`);
    }
    const entry = super.get(userId);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      super.delete(userId);
      return undefined;
    }
    return entry.accessToken;
  }

  /**
   * Check whether a valid session exists for a user.
   *
   * @param {string} userId
   * @returns {boolean | Promise<boolean>}
   */
  has(userId) {
    const client = getRedisClient();
    if (client) {
      return client.exists(`${SESSION_KEY_PREFIX}${userId}`).then((n) => n > 0);
    }
    return this.get(userId) !== undefined;
  }

  /**
   * Remove the session for a user.
   *
   * @param {string} userId
   * @returns {boolean | Promise<number>}
   */
  delete(userId) {
    const client = getRedisClient();
    if (client) {
      return client.del(`${SESSION_KEY_PREFIX}${userId}`);
    }
    return super.delete(userId);
  }

  /**
   * Purge expired in-memory entries.
   * No-op when Redis is active (TTL handles expiry automatically).
   */
  cleanup() {
    if (getRedisClient()) return;
    const now = Date.now();
    for (const [key, entry] of super.entries()) {
      if (now >= entry.expiresAt) super.delete(key);
    }
  }
}

export const sessionStore = new SessionStore();

/**
 * Get the access token for a user from the session store.
 * Returns undefined/null if the session has expired or does not exist.
 *
 * Always `await` the return value — it is a Promise when Redis is configured.
 *
 * @param {string} userId - Discord user ID
 * @returns {Promise<string | null | undefined> | string | undefined}
 */
export function getSessionToken(userId) {
  return sessionStore.get(userId);
}
