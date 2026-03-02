import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock redis — no Redis in tests
vi.mock('../../src/redis.js', () => ({
  getRedis: vi.fn().mockReturnValue(null),
  recordHit: vi.fn(),
  recordMiss: vi.fn(),
  recordError: vi.fn(),
}));

describe('discordCache.js', () => {
  let discordCache;
  let cache;

  beforeEach(async () => {
    vi.resetModules();
    cache = await import('../../src/utils/cache.js');
    discordCache = await import('../../src/utils/discordCache.js');
    cache._resetCache();
  });

  afterEach(() => {
    cache._resetCache();
  });

  describe('fetchChannelCached', () => {
    it('returns null for null channelId', async () => {
      const client = { channels: { cache: new Map() } };
      const result = await discordCache.fetchChannelCached(client, null);
      expect(result).toBeNull();
    });

    it('returns from Discord.js cache if available', async () => {
      const mockChannel = { id: '123', name: 'test', type: 0 };
      const client = {
        channels: {
          cache: new Map([['123', mockChannel]]),
        },
      };

      const result = await discordCache.fetchChannelCached(client, '123');
      expect(result).toBe(mockChannel);
    });

    it('fetches from API on cache miss and caches result', async () => {
      const mockChannel = { id: '456', name: 'general', type: 0, guildId: '789' };
      const client = {
        channels: {
          cache: new Map(),
          fetch: vi.fn().mockResolvedValue(mockChannel),
        },
      };

      const result = await discordCache.fetchChannelCached(client, '456');
      expect(result).toBe(mockChannel);
      expect(client.channels.fetch).toHaveBeenCalledWith('456');
    });

    it('returns null on API error', async () => {
      const client = {
        channels: {
          cache: new Map(),
          fetch: vi.fn().mockRejectedValue(new Error('Unknown channel')),
        },
      };

      const result = await discordCache.fetchChannelCached(client, '999');
      expect(result).toBeNull();
    });
  });

  describe('fetchGuildChannelsCached', () => {
    it('fetches and caches guild channels', async () => {
      const channels = new Map([
        ['1', { id: '1', name: 'general', type: 0, position: 0, parentId: null }],
        ['2', { id: '2', name: 'random', type: 0, position: 1, parentId: null }],
      ]);

      const guild = {
        id: 'guild1',
        channels: { fetch: vi.fn().mockResolvedValue(channels) },
      };

      const result = await discordCache.fetchGuildChannelsCached(guild);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('general');

      // Second call should use cache
      guild.channels.fetch.mockClear();
      const cached = await discordCache.fetchGuildChannelsCached(guild);
      expect(cached).toHaveLength(2);
      // fetch should NOT be called again (served from cache)
      expect(guild.channels.fetch).not.toHaveBeenCalled();
    });
  });

  describe('fetchGuildRolesCached', () => {
    it('fetches and caches guild roles', async () => {
      const roles = new Map([
        ['1', { id: '1', name: '@everyone', color: 0, position: 0, permissions: { bitfield: 0n } }],
        [
          '2',
          { id: '2', name: 'Admin', color: 0xff0000, position: 1, permissions: { bitfield: 8n } },
        ],
      ]);

      const guild = {
        id: 'guild1',
        roles: { fetch: vi.fn().mockResolvedValue(roles) },
      };

      const result = await discordCache.fetchGuildRolesCached(guild);
      expect(result).toHaveLength(2);
      expect(result.find((r) => r.name === 'Admin')).toBeDefined();
    });
  });

  describe('fetchMemberCached', () => {
    it('returns null for null userId', async () => {
      const guild = { members: { cache: new Map() } };
      const result = await discordCache.fetchMemberCached(guild, null);
      expect(result).toBeNull();
    });

    it('returns from Discord.js cache first', async () => {
      const mockMember = { id: '123', displayName: 'Test' };
      const guild = {
        id: 'guild1',
        members: {
          cache: new Map([['123', mockMember]]),
          fetch: vi.fn(),
        },
      };

      const result = await discordCache.fetchMemberCached(guild, '123');
      expect(result).toBe(mockMember);
      expect(guild.members.fetch).not.toHaveBeenCalled();
    });

    it('returns null for unknown members (10007 error)', async () => {
      const err = new Error('Unknown Member');
      err.code = 10007;
      const guild = {
        id: 'guild1',
        members: {
          cache: new Map(),
          fetch: vi.fn().mockRejectedValue(err),
        },
      };

      const result = await discordCache.fetchMemberCached(guild, '999');
      expect(result).toBeNull();
    });
  });

  describe('invalidateGuildCache', () => {
    it('clears all cached data for a guild', async () => {
      // Pre-populate cache
      const channels = new Map([
        ['1', { id: '1', name: 'test', type: 0, position: 0, parentId: null }],
      ]);
      const guild = {
        id: 'guild1',
        channels: { fetch: vi.fn().mockResolvedValue(channels) },
      };

      await discordCache.fetchGuildChannelsCached(guild);

      // Invalidate
      await discordCache.invalidateGuildCache('guild1');

      // Next fetch should hit API again
      guild.channels.fetch.mockClear();
      await discordCache.fetchGuildChannelsCached(guild);
      expect(guild.channels.fetch).toHaveBeenCalled();
    });
  });
});
