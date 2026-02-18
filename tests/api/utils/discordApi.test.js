import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  error: vi.fn(),
}));

import { fetchUserGuilds, guildCache } from '../../../src/api/utils/discordApi.js';

describe('discordApi utils', () => {
  afterEach(() => {
    guildCache.clear();
    vi.restoreAllMocks();
  });

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
