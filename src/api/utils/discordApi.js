/** Guild cache: userId → { guilds, expiresAt } */
export const guildCache = new Map();
const GUILD_CACHE_TTL_MS = 90_000; // 90 seconds
const DISCORD_API = 'https://discord.com/api/v10';

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
  if (!response.ok) throw new Error(`Discord API error: ${response.status}`);
  const guilds = await response.json();

  guildCache.set(userId, { guilds, expiresAt: Date.now() + GUILD_CACHE_TTL_MS });
  return guilds;
}
