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

describe('reputationCache.js', () => {
  let repCache;
  let cache;

  beforeEach(async () => {
    vi.resetModules();
    cache = await import('../../src/utils/cache.js');
    repCache = await import('../../src/utils/reputationCache.js');
    cache._resetCache();
  });

  afterEach(() => {
    cache._resetCache();
  });

  describe('getReputationCached / setReputationCache', () => {
    it('returns null on miss', async () => {
      const result = await repCache.getReputationCached('guild1', 'user1');
      expect(result).toBeNull();
    });

    it('returns cached data after set', async () => {
      const data = { xp: 100, level: 3, messages_count: 50 };
      await repCache.setReputationCache('guild1', 'user1', data);

      const result = await repCache.getReputationCached('guild1', 'user1');
      expect(result).toEqual(data);
    });
  });

  describe('invalidateReputationCache', () => {
    it('clears user reputation and leaderboard cache', async () => {
      await repCache.setReputationCache('guild1', 'user1', { xp: 100, level: 2 });

      // Set paginated leaderboard entries via raw cache
      await cache.cacheSet('leaderboard:guild1:1:25', [{ userId: 'user1' }], 300);
      await cache.cacheSet('rank:guild1:user1', { rank: 1 }, 60);

      await repCache.invalidateReputationCache('guild1', 'user1');

      expect(await repCache.getReputationCached('guild1', 'user1')).toBeNull();
      expect(await cache.cacheGet('leaderboard:guild1:1:25')).toBeNull();
      expect(await cache.cacheGet('rank:guild1:user1')).toBeNull();
    });
  });

  describe('getLeaderboardCached', () => {
    it('calls factory on miss and caches result', async () => {
      const leaderboard = [
        { userId: 'u1', xp: 500 },
        { userId: 'u2', xp: 300 },
      ];
      const factory = vi.fn().mockResolvedValue(leaderboard);

      const result = await repCache.getLeaderboardCached('guild1', factory);
      expect(result).toEqual(leaderboard);
      expect(factory).toHaveBeenCalledOnce();

      // Second call should use cache
      factory.mockClear();
      const cached = await repCache.getLeaderboardCached('guild1', factory);
      expect(cached).toEqual(leaderboard);
      expect(factory).not.toHaveBeenCalled();
    });
  });

  describe('getRankCached', () => {
    it('calls factory on miss and caches result', async () => {
      const rank = { rank: 5, xp: 200, level: 4 };
      const factory = vi.fn().mockResolvedValue(rank);

      const result = await repCache.getRankCached('guild1', 'user1', factory);
      expect(result).toEqual(rank);
      expect(factory).toHaveBeenCalledOnce();
    });
  });

  describe('invalidateLeaderboard', () => {
    it('clears all paginated leaderboard cache keys for guild', async () => {
      await cache.cacheSet('leaderboard:guild1:1:25', [{ rank: 1 }], 300);
      await cache.cacheSet('leaderboard:guild1:2:25', [{ rank: 26 }], 300);
      await repCache.invalidateLeaderboard('guild1');
      expect(await cache.cacheGet('leaderboard:guild1:1:25')).toBeNull();
      expect(await cache.cacheGet('leaderboard:guild1:2:25')).toBeNull();
    });
  });
});
