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
  let warn;

  beforeEach(async () => {
    vi.resetModules();
    cache = await import('../../src/utils/cache.js');
    discordCache = await import('../../src/utils/discordCache.js');
    ({ warn } = await import('../../src/logger.js'));
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

    it('refetches from the API when metadata is cached but Discord.js cache is empty', async () => {
      const cachedChannel = { id: '456', name: 'general', type: 0, guildId: '789' };
      const client = {
        channels: {
          cache: new Map(),
          fetch: vi.fn().mockResolvedValue(cachedChannel),
        },
      };

      await cache.cacheSet('discord:channel:456', { id: '456' }, cache.TTL.CHANNEL_DETAIL);

      const result = await discordCache.fetchChannelCached(client, '456');
      expect(result).toBe(cachedChannel);
      expect(client.channels.fetch).toHaveBeenCalledWith('456');
    });

    it('returns a rechecked Discord.js cache hit after metadata lookup', async () => {
      const mockChannel = { id: '789', name: 'alerts', type: 0 };
      const cacheStore = new Map();
      const client = {
        channels: {
          cache: {
            get: vi.fn((channelId) => cacheStore.get(channelId)),
          },
          fetch: vi.fn(),
        },
      };

      await cache.cacheSet('discord:channel:789', { id: '789' }, cache.TTL.CHANNEL_DETAIL);
      client.channels.cache.get
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => mockChannel);

      const result = await discordCache.fetchChannelCached(client, '789');
      expect(result).toBe(mockChannel);
      expect(client.channels.fetch).not.toHaveBeenCalled();
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

    it('filters null guild channels', async () => {
      const channels = new Map([
        ['2', { id: '2', name: 'random', type: 0, position: 4, parentId: null }],
        ['1', { id: '1', name: 'general', type: 0, position: 1, parentId: null }],
        ['3', null],
      ]);
      const guild = {
        id: 'guild-sort',
        channels: { fetch: vi.fn().mockResolvedValue(channels) },
      };

      const result = await discordCache.fetchGuildChannelsCached(guild);
      expect(result.map((channel) => channel.id)).toEqual(['1', '2']);
    });

    it('sorts guild channels by position', async () => {
      const channels = new Map([
        ['2', { id: '2', name: 'random', type: 0, position: 4, parentId: null }],
        ['1', { id: '1', name: 'general', type: 0, position: 1, parentId: null }],
      ]);
      const guild = {
        id: 'guild-sort-order',
        channels: { fetch: vi.fn().mockResolvedValue(channels) },
      };

      const result = await discordCache.fetchGuildChannelsCached(guild);
      expect(result.map((channel) => channel.id)).toEqual(['1', '2']);
    });

    it('returns an empty list when guild channel fetch fails', async () => {
      const guild = {
        id: 'guild-sort',
        channels: { fetch: vi.fn().mockRejectedValue(new Error('discord down')) },
      };

      await expect(discordCache.fetchGuildChannelsCached(guild)).resolves.toEqual([]);
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

    it('returns an empty list when guild role fetch fails', async () => {
      const guild = {
        id: 'guild-roles-error',
        roles: { fetch: vi.fn().mockRejectedValue(new Error('discord down')) },
      };

      await expect(discordCache.fetchGuildRolesCached(guild)).resolves.toEqual([]);
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

    it('returns a member from the API and caches the metadata', async () => {
      const mockMember = {
        id: 'member-1',
        displayName: 'Member One',
        joinedAt: new Date('2025-01-01T00:00:00Z'),
      };
      const guild = {
        id: 'guild1',
        members: {
          cache: new Map(),
          fetch: vi.fn().mockResolvedValue(mockMember),
        },
      };

      const result = await discordCache.fetchMemberCached(guild, 'member-1');
      expect(result).toBe(mockMember);
      expect(await cache.cacheGet('discord:guild:guild1:member:member-1')).toEqual({
        id: 'member-1',
        displayName: 'Member One',
        joinedAt: '2025-01-01T00:00:00.000Z',
      });
    });

    it('rechecks the Discord.js member cache after a metadata hit', async () => {
      const cachedMember = { id: 'member-2', displayName: 'Member Two' };
      const memberCache = new Map();
      const guild = {
        id: 'guild-cache',
        members: {
          cache: {
            get: vi.fn((userId) => memberCache.get(userId)),
          },
          fetch: vi.fn(),
        },
      };

      await cache.cacheSet(
        'discord:guild:guild-cache:member:member-2',
        { id: 'member-2' },
        cache.TTL.MEMBERS,
      );
      guild.members.cache.get
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => cachedMember);

      const result = await discordCache.fetchMemberCached(guild, 'member-2');
      expect(result).toBe(cachedMember);
      expect(guild.members.fetch).not.toHaveBeenCalled();
    });

    it('returns null for non-10007 fetch errors without throwing', async () => {
      const err = new Error('discord down');
      err.code = 50013;
      const guild = {
        id: 'guild-error',
        members: {
          cache: new Map(),
          fetch: vi.fn().mockRejectedValue(err),
        },
      };

      await expect(discordCache.fetchMemberCached(guild, 'user-err')).resolves.toBeNull();
      expect(warn).toHaveBeenCalledWith(
        'Failed to fetch guild member',
        expect.objectContaining({ guildId: 'guild-error', userId: 'user-err' }),
      );
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
