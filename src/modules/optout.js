/**
 * Opt-Out Module
 * Manages user opt-out state for memory collection.
 *
 * Users who opt out will not have their messages analyzed for memory
 * extraction and will not have memories injected into AI context.
 * The bot still works normally for opted-out users, just without
 * long-term memory features.
 *
 * State is stored in an in-memory Set for fast lookups and persisted
 * to PostgreSQL (memory_optouts table) for durability across restarts.
 */

import { getPool } from '../db.js';
import { info, warn as logWarn } from '../logger.js';

/** In-memory set of opted-out user IDs */
let optedOutUsers = new Set();

/** Database pool — defaults to getPool(), can be overridden for testing */
let pool = null;

/**
 * Get the active database pool.
 * Uses injected pool if set, otherwise falls back to getPool().
 * @returns {import('pg').Pool | null}
 */
function resolvePool() {
  if (pool) return pool;
  try {
    return getPool();
  } catch {
    return null;
  }
}

/**
 * Set the database pool (for testing).
 * @param {import('pg').Pool | null} mockPool
 */
export function _setPool(mockPool) {
  pool = mockPool;
}

/**
 * Reset the opt-out state (for testing).
 */
export function _resetOptouts() {
  optedOutUsers = new Set();
  pool = null;
}

/**
 * Check if a user has opted out of memory collection.
 * @param {string} userId - Discord user ID
 * @returns {boolean} true if the user has opted out
 */
export function isOptedOut(userId) {
  return optedOutUsers.has(userId);
}

/**
 * Toggle the opt-out state for a user.
 * If opted out, opts them back in. If opted in, opts them out.
 * Persists the change to the database (best-effort).
 * @param {string} userId - Discord user ID
 * @returns {Promise<{ optedOut: boolean }>} The new opt-out state
 */
export async function toggleOptOut(userId) {
  const db = resolvePool();

  if (optedOutUsers.has(userId)) {
    optedOutUsers.delete(userId);
    info('User opted back in to memory', { userId });

    if (db) {
      try {
        await db.query('DELETE FROM memory_optouts WHERE user_id = $1', [userId]);
      } catch (err) {
        logWarn('Failed to delete opt-out from database', { userId, error: err.message });
      }
    }

    return { optedOut: false };
  }

  optedOutUsers.add(userId);
  info('User opted out of memory', { userId });

  if (db) {
    try {
      await db.query(
        'INSERT INTO memory_optouts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
        [userId],
      );
    } catch (err) {
      logWarn('Failed to persist opt-out to database', { userId, error: err.message });
    }
  }

  return { optedOut: true };
}

/**
 * Load opt-out state from the database.
 * Handles unavailable database gracefully.
 */
export async function loadOptOuts() {
  const db = resolvePool();

  if (!db) {
    logWarn('Database not available, starting with empty opt-out set');
    return;
  }

  try {
    const result = await db.query('SELECT user_id FROM memory_optouts');
    optedOutUsers = new Set(result.rows.map((row) => row.user_id));
    info('Loaded opt-out list from database', { count: optedOutUsers.size });
  } catch (err) {
    logWarn('Failed to load opt-outs from database', { error: err.message });
    optedOutUsers = new Set();
  }
}
