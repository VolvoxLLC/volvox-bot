/**
 * Session Store Utilities
 * Shared OAuth session token storage and helpers
 */

/** Session TTL matches JWT expiry */
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * TTL-based session store: userId -> { accessToken, expiresAt }
 * Extends Map to transparently handle expiry on get/has/delete.
 * NOTE: This is an in-memory store that does not persist across restarts and does not
 * scale across multiple processes. For multi-process deployments, replace with Redis
 * or another shared session store.
 */
class SessionStore extends Map {
  set(userId, accessToken) {
    return super.set(userId, { accessToken, expiresAt: Date.now() + SESSION_TTL_MS });
  }

  get(userId) {
    const entry = super.get(userId);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      super.delete(userId);
      return undefined;
    }
    return entry.accessToken;
  }

  has(userId) {
    return this.get(userId) !== undefined;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of super.entries()) {
      if (now >= entry.expiresAt) super.delete(key);
    }
  }
}

export const sessionStore = new SessionStore();

/**
 * Get the access token for a user from the session store.
 * Returns undefined if the session has expired or does not exist.
 *
 * @param {string} userId - Discord user ID
 * @returns {string|undefined} The access token, or undefined
 */
export function getSessionToken(userId) {
  return sessionStore.get(userId);
}
