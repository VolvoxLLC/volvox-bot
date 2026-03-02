/**
 * Reputation Cache Layer
 * Caches reputation data (XP, levels, leaderboards) to reduce DB queries.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/177
 */

import { debug } from '../logger.js';
import { cacheDel, cacheDelPattern, cacheGet, cacheGetOrSet, cacheSet, TTL } from './cache.js';

/**
 * Get cached reputation data for a user.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<{xp: number, level: number, messages_count: number}|null>}
 */
export async function getReputationCached(guildId, userId) {
  const key = `reputation:${guildId}:${userId}`;
  return cacheGet(key);
}

/**
 * Cache reputation data for a user.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {{xp: number, level: number, messages_count: number}} data
 * @returns {Promise<void>}
 */
export async function setReputationCache(guildId, userId, data) {
  const key = `reputation:${guildId}:${userId}`;
  await cacheSet(key, data, TTL.REPUTATION);
  debug('Cached reputation', { guildId, userId, xp: data.xp });
}

/**
 * Invalidate reputation cache for a user (call after XP gain/update).
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function invalidateReputationCache(guildId, userId) {
  await Promise.allSettled([
    cacheDel(`reputation:${guildId}:${userId}`),
    cacheDel(`rank:${guildId}:${userId}`),
    cacheDelPattern(`leaderboard:${guildId}:*`)
  ]);
  await cacheDel(`rank:${guildId}:${userId}`);
  // Also invalidate all paginated leaderboard keys for this guild
  await cacheDelPattern(`leaderboard:${guildId}:*`);
}

/**
 * Get cached leaderboard for a guild.
 *
 * @param {string} guildId
 * @param {() => Promise<Array>} fetchFn - Factory to fetch from DB on miss
 * @returns {Promise<Array>}
 */
export async function getLeaderboardCached(guildId, fetchFn) {
  return cacheGetOrSet(`leaderboard:${guildId}`, fetchFn, TTL.LEADERBOARD);
}

/**
 * Get cached rank for a user.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {() => Promise<Object>} fetchFn - Factory to fetch from DB on miss
 * @returns {Promise<Object>}
 */
export async function getRankCached(guildId, userId, fetchFn) {
  return cacheGetOrSet(`rank:${guildId}:${userId}`, fetchFn, TTL.REPUTATION);
}

/**
 * Invalidate entire guild leaderboard (call when significant XP changes happen).
 *
 * @param {string} guildId
 * @returns {Promise<void>}
 */
export async function invalidateLeaderboard(guildId) {
  await cacheDelPattern(`leaderboard:${guildId}:*`);
}
