/**
 * Session Store Utilities
 * Shared OAuth session token storage and helpers
 */

/** Session TTL matches JWT expiry */
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * TTL-based in-memory session store: userId → { accessToken, expiresAt }.
 * Extends Map to transparently handle expiry on get/has.
 *
 * ### Scaling Limitations
 *
 * This store is **in-memory and single-process only**:
 * - Sessions are lost on server restart.
 * - Cannot be shared across multiple Node.js processes or containers.
 * - Memory grows linearly with active sessions (mitigated by TTL + cleanup).
 *
 * ### Future Migration
 *
 * For multi-instance deployments, replace with a shared store (e.g., Redis):
 * 1. Swap this class for a Redis-backed adapter with the same get/set/has/delete interface.
 * 2. Use Redis TTL (`SETEX`) instead of manual expiry tracking.
 * 3. Update `cleanup()` to rely on Redis key expiration.
 *
 * ### Map Override Coverage
 *
 * Only `get`, `set`, `has`, and `delete` are overridden to handle TTL.
 * Inherited methods like `size`, `forEach`, `entries`, `keys`, `values`
 * operate on the raw Map entries (including expired ones between cleanup cycles).
 * The periodic `cleanup()` call purges expired entries to keep these reasonable.
 * For most use cases (auth lookups by userId), the overridden methods suffice.
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

  delete(userId) {
    return super.delete(userId);
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
