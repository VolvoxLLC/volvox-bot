/**
 * Discord API Utilities
 * Shared helpers for fetching data from the Discord REST API with caching
 */

import { error } from '../../logger.js';

/**
 * Custom error for Discord API failures, carrying the HTTP status code.
 */
export class DiscordApiError extends Error {
  /**
   * @param {string} message - Human-readable error description
   * @param {number} status - HTTP status code from Discord
   */
  constructor(message, status) {
    super(message);
    this.name = 'DiscordApiError';
    this.status = status;
  }
}

/** Guild cache: userId → { guilds, expiresAt } */
export const guildCache = new Map();
const GUILD_CACHE_TTL_MS = 90_000; // 90 seconds
const MAX_GUILD_CACHE_SIZE = 10_000;
export const DISCORD_API = 'https://discord.com/api/v10';

function cleanExpiredGuildCache() {
  const now = Date.now();
  for (const [key, entry] of guildCache.entries()) {
    if (now >= entry.expiresAt) guildCache.delete(key);
  }
}

const guildCacheCleanupInterval = setInterval(cleanExpiredGuildCache, 60_000);
guildCacheCleanupInterval.unref();

export function stopGuildCacheCleanup() {
  clearInterval(guildCacheCleanupInterval);
}

/**
 * Fetch guilds from Discord using the user's access token, with a short-lived cache.
 *
 * @param {string} userId - User ID (cache key)
 * @param {string} accessToken - Discord OAuth2 access token
 * @returns {Promise<Array>} Array of guild objects
 */
export async function fetchUserGuilds(userId, accessToken) {
  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    error('Invalid access token for guild fetch', {
      userId,
      accessTokenType: typeof accessToken,
    });
    throw new Error('Invalid access token');
  }

  const cached = guildCache.get(userId);
  if (cached) {
    if (Date.now() < cached.expiresAt) {
      return cached.guilds;
    }
    guildCache.delete(userId);
  }

  const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const status = response.status;
    error('Discord guild fetch failed', { userId, status });
    throw new DiscordApiError('Discord API error', status);
  }
  const guilds = await response.json();
  if (!Array.isArray(guilds)) throw new Error('Discord API returned non-array guild data');

  guildCache.set(userId, { guilds, expiresAt: Date.now() + GUILD_CACHE_TTL_MS });
  // Cap cache size to prevent unbounded memory growth
  if (guildCache.size > MAX_GUILD_CACHE_SIZE) {
    const oldest = guildCache.keys().next().value;
    guildCache.delete(oldest);
  }
  return guilds;
}
