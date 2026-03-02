/**
 * Discord API Cache Layer
 * Caches Discord API fetch results (channels, roles, members, guilds)
 * to reduce API calls and improve response times.
 *
 * Uses the centralized cache system (Redis with in-memory fallback).
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/177
 */

import { debug, warn } from '../logger.js';
import { cacheGet, cacheSet, TTL } from './cache.js';

/**
 * Fetch a channel with caching.
 * Falls through to Discord API on cache miss, caches the serialized result.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {string} channelId - Channel ID to fetch
 * @returns {Promise<import('discord.js').Channel|null>} The channel, or null if not found
 */
export async function fetchChannelCached(client, channelId) {
  if (!channelId) return null;

  // Try Discord.js internal cache first (always fastest)
  const djsCached = client.channels.cache.get(channelId);
  if (djsCached) return djsCached;

  // Try Redis/memory cache for channel metadata
  const cacheKey = `discord:channel:${channelId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    // We can't reconstruct a full Channel object from cached data,
    // but we can avoid the API call by checking if it appeared in DJS cache
    // during the async gap
    const recheckDjs = client.channels.cache.get(channelId);
    if (recheckDjs) return recheckDjs;
  }

  // Fetch from Discord API
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel) {
      // Cache minimal metadata for future health checks
      await cacheSet(cacheKey, {
        id: channel.id,
        name: channel.name ?? null,
        type: channel.type,
        guildId: channel.guildId ?? null,
      }, TTL.CHANNEL_DETAIL);
      debug('Fetched and cached channel', { channelId, name: channel.name });
    }
    return channel;
  } catch (err) {
    warn('Failed to fetch channel', { channelId, error: err.message });
    return null;
  }
}

/**
 * Fetch guild channels list with caching.
 * Returns serialized channel data suitable for API responses.
 *
 * @param {import('discord.js').Guild} guild - Discord guild
 * @returns {Promise<Array<{id: string, name: string, type: number, position: number, parentId: string|null}>>}
 */
export async function fetchGuildChannelsCached(guild) {
  const cacheKey = `discord:guild:${guild.id}:channels`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const channels = await guild.channels.fetch();
    const serialized = Array.from(channels.values())
      .filter((ch) => ch !== null)
      .map((ch) => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        position: ch.position ?? 0,
        parentId: ch.parentId ?? null,
      }))
      .sort((a, b) => a.position - b.position);

    await cacheSet(cacheKey, serialized, TTL.CHANNELS);
    debug('Fetched and cached guild channels', { guildId: guild.id, count: serialized.length });
    return serialized;
  } catch (err) {
    warn('Failed to fetch guild channels', { guildId: guild.id, error: err.message });
    return [];
  }
}

/**
 * Fetch guild roles list with caching.
 * Returns serialized role data suitable for API responses.
 *
 * @param {import('discord.js').Guild} guild - Discord guild
 * @returns {Promise<Array<{id: string, name: string, color: number, position: number, permissions: string}>>}
 */
export async function fetchGuildRolesCached(guild) {
  const cacheKey = `discord:guild:${guild.id}:roles`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const roles = await guild.roles.fetch();
    const serialized = Array.from(roles.values()).map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
    }));

    await cacheSet(cacheKey, serialized, TTL.ROLES);
    debug('Fetched and cached guild roles', { guildId: guild.id, count: serialized.length });
    return serialized;
  } catch (err) {
    warn('Failed to fetch guild roles', { guildId: guild.id, error: err.message });
    return [];
  }
}

/**
 * Fetch a guild member with caching.
 *
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {string} userId - User ID
 * @returns {Promise<import('discord.js').GuildMember|null>}
 */
export async function fetchMemberCached(guild, userId) {
  if (!userId) return null;

  // Try Discord.js internal cache first
  const djsCached = guild.members.cache.get(userId);
  if (djsCached) return djsCached;

  const cacheKey = `discord:guild:${guild.id}:member:${userId}`;
  const cached = await cacheGet(cacheKey);

  // If we have cached metadata, try DJS cache again (may have been populated)
  if (cached) {
    const recheckDjs = guild.members.cache.get(userId);
    if (recheckDjs) return recheckDjs;
  }

  try {
    const member = await guild.members.fetch(userId);
    if (member) {
      await cacheSet(cacheKey, {
        id: member.id,
        displayName: member.displayName,
        joinedAt: member.joinedAt?.toISOString() ?? null,
      }, TTL.MEMBERS);
    }
    return member;
  } catch (err) {
    // Don't warn for unknown member — it's expected
    if (err.code !== 10007) {
      warn('Failed to fetch guild member', { guildId: guild.id, userId, error: err.message });
    }
    return null;
  }
}

/**
 * Invalidate all cached data for a guild.
 * Call this when guild config or structure changes significantly.
 *
 * @param {string} guildId - Guild ID to invalidate
 * @returns {Promise<void>}
 */
export async function invalidateGuildCache(guildId) {
  const { cacheDelPattern } = await import('./cache.js');
  await cacheDelPattern(`discord:guild:${guildId}:*`);
  debug('Invalidated guild cache', { guildId });
}
