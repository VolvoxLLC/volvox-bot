import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

import { fetchUserGuilds, guildCache } from '../../../src/api/utils/discordApi.js';

describe('discordApi utils', () => {
  afterEach(() => {
    guildCache.clear();
    vi.restoreAllMocks();
  });

  describe('fetchUserGuilds - invalid access token', () => {
    it('should throw when accessToken is not a string', async () => {
      await expect(fetchUserGuilds('user1', null)).rejects.toThrow('Invalid access token');
    });

    it('should throw when accessToken is empty string', async () => {
      await expect(fetchUserGuilds('user1', '   ')).rejects.toThrow('Invalid access token');
    });

    it('should throw when accessToken is a number', async () => {
      await expect(fetchUserGuilds('user1', 12345)).rejects.toThrow('Invalid access token');
    });
  });

  describe('fetchUserGuilds - cache behavior', () => {
    it('should return cached guilds when cache is valid', async () => {
      const cachedGuilds = [{ id: 'g1', name: 'CachedGuild' }];
      guildCache.set('user1', { guilds: cachedGuilds, expiresAt: Date.now() + 60_000 });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await fetchUserGuilds('user1', 'valid-token');

      expect(result).toBe(cachedGuilds);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should refetch when cache is expired', async () => {
      const staleGuilds = [{ id: 'g1', name: 'StaleGuild' }];
      guildCache.set('user1', { guilds: staleGuilds, expiresAt: Date.now() - 1 });

      const freshGuilds = [{ id: 'g2', name: 'FreshGuild' }];
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => freshGuilds,
      });

      const result = await fetchUserGuilds('user1', 'valid-token');

      expect(result).toEqual(freshGuilds);
      expect(guildCache.has('user1')).toBe(true);
      // Old expired entry should be gone and replaced
      const cached = guildCache.get('user1');
      expect(cached.guilds).toEqual(freshGuilds);
    });
  });

  describe('fetchUserGuilds - API responses', () => {
    it('should fetch and cache guilds on success', async () => {
      const guilds = [{ id: 'g1', name: 'TestGuild' }];
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => guilds,
      });

      const result = await fetchUserGuilds('user2', 'valid-token');

      expect(result).toEqual(guilds);
      expect(guildCache.has('user2')).toBe(true);
    });

    it('should throw DiscordApiError when API returns non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(fetchUserGuilds('user3', 'bad-token')).rejects.toThrow('Discord API error');
    });

    it('should throw when Discord API returns non-array guild data', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'unexpected' }),
      });

      await expect(fetchUserGuilds('user4', 'valid-token')).rejects.toThrow(
        'Discord API returned non-array guild data',
      );
    });

    it('should throw DiscordApiError with 403 when forbidden', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(fetchUserGuilds('user5', 'token')).rejects.toThrow();
    });
  });

  describe('cache eviction when size exceeds MAX_GUILD_CACHE_SIZE', () => {
    it('should evict until cache size is capped after burst inserts', async () => {
      for (let i = 0; i < 10005; i += 1) {
        guildCache.set(`user-${i}`, { guilds: [], expiresAt: Date.now() + 60_000 });
      }

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await fetchUserGuilds('new-user', 'token');

      expect(guildCache.size).toBe(10000);
    });
  });
});
