import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBotInviteUrl, getGuildIconUrl } from '@/lib/discord';
import {
  fetchUserGuilds,
  fetchBotGuilds,
  fetchWithRateLimit,
  getUserGuilds,
  getUserGuildDirectory,
} from '@/lib/discord.server';

describe('getBotInviteUrl', () => {
  const originalClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;

  afterEach(() => {
    if (originalClientId === undefined) {
      delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    } else {
      process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = originalClientId;
    }
  });

  it('returns null when the client id is missing', () => {
    delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    expect(getBotInviteUrl()).toBeNull();
  });

  it('builds a generic invite url by default', () => {
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = 'discord-client-id';
    expect(getBotInviteUrl()).toContain('client_id=discord-client-id');
  });

  it('can preselect a guild in the invite flow', () => {
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = 'discord-client-id';
    const inviteUrl = getBotInviteUrl('guild-123');

    expect(inviteUrl).toContain('guild_id=guild-123');
    expect(inviteUrl).toContain('disable_guild_select=true');
  });
});

describe('getGuildIconUrl', () => {
  it('returns null when no icon hash is provided', () => {
    const url = getGuildIconUrl('123', null);
    expect(url).toBeNull();
  });

  it('returns null for all guilds without an icon hash', () => {
    const url0 = getGuildIconUrl('0', null);
    const url1 = getGuildIconUrl('1', null);
    const url4 = getGuildIconUrl('4', null);
    expect(url0).toBeNull();
    expect(url1).toBeNull();
    expect(url4).toBeNull();
  });

  it('returns webp icon for non-animated hash', () => {
    const url = getGuildIconUrl('123', 'abc123', 128);
    expect(url).toBe('https://cdn.discordapp.com/icons/123/abc123.webp?size=128');
  });

  it('returns gif icon for animated hash', () => {
    const url = getGuildIconUrl('123', 'a_abc123', 64);
    expect(url).toBe('https://cdn.discordapp.com/icons/123/a_abc123.gif?size=64');
  });

  it('defaults to size 128', () => {
    const url = getGuildIconUrl('123', 'abc123');
    expect(url).toContain('size=128');
  });
});

describe("fetchWithRateLimit", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it("returns response directly when not rate limited", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    } as Response);

    const response = await fetchWithRateLimit("https://example.com/api");
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 with retry-after header", async () => {
    const headers = new Map([["retry-after", "0.01"]]);
    let callCount = 0;
    fetchSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 429,
          headers: { get: (key: string) => headers.get(key) ?? null },
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    const promise = fetchWithRateLimit("https://example.com/api");
    // Advance timers to allow retries
    await vi.advanceTimersByTimeAsync(100);
    const response = await promise;
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("parses retry-after header as seconds and waits", async () => {
    const headers = new Map([["retry-after", "0.001"]]); // 1ms
    let callCount = 0;
    fetchSpy.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({
          status: 429,
          headers: { get: (key: string) => headers.get(key) ?? null },
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    const promise = fetchWithRateLimit("https://example.com/api");
    await vi.advanceTimersByTimeAsync(100);
    const response = await promise;
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("returns 429 after exhausting max retries", async () => {
    const headers = new Map([["retry-after", "0.001"]]);
    fetchSpy.mockResolvedValue({
      status: 429,
      headers: { get: (key: string) => headers.get(key) ?? null },
    } as unknown as Response);

    const promise = fetchWithRateLimit("https://example.com/api");
    await vi.advanceTimersByTimeAsync(100);
    const response = await promise;
    expect(response.status).toBe(429);
    // 1 initial + 3 retries = 4 total calls
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it("does not retry when retry-after exceeds the allowed delay cap", async () => {
    const headers = new Map([["retry-after", "728"]]);
    fetchSpy.mockResolvedValue({
      status: 429,
      headers: { get: (key: string) => headers.get(key) ?? null },
    } as unknown as Response);

    const response = await fetchWithRateLimit("https://example.com/api");
    expect(response.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the next wait would exceed the remaining retry budget", async () => {
    const headers = new Map([["retry-after", "1.5"]]);
    let callCount = 0;
    fetchSpy.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({
          status: 429,
          headers: { get: (key: string) => headers.get(key) ?? null },
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    const promise = fetchWithRateLimit("https://example.com/api", {
      rateLimit: {
        maxRetries: 3,
        maxRetryDelayMs: 2_000,
        totalRetryBudgetMs: 2_000,
      },
    });

    await vi.advanceTimersByTimeAsync(1_600);
    const response = await promise;
    expect(response.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("aborts sleep when signal fires during rate-limit wait", async () => {
    const controller = new AbortController();
    const headers = new Map([["retry-after", "30"]]); // 30 seconds
    let callCount = 0;
    fetchSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 429,
          headers: { get: (key: string) => headers.get(key) ?? null },
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    const promise = fetchWithRateLimit("https://example.com/api", {
      signal: controller.signal,
      rateLimit: {
        maxRetryDelayMs: 60_000,
        totalRetryBudgetMs: 60_000,
      },
    });

    // Advance a little, then abort (well before the 30s retry-after)
    await vi.advanceTimersByTimeAsync(100);
    controller.abort(new DOMException("Timed out", "TimeoutError"));

    await expect(promise).rejects.toThrow();
    // Should only have made 1 fetch call (the initial 429), not retried
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws immediately if signal already aborted before sleep", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Already aborted", "AbortError"));

    const headers = new Map([["retry-after", "1"]]);
    fetchSpy.mockResolvedValue({
      status: 429,
      headers: { get: (key: string) => headers.get(key) ?? null },
    } as unknown as Response);

    // Attach rejection handler immediately — no timer advance needed since
    // the signal is already aborted and the throw is synchronous.
    await expect(
      fetchWithRateLimit("https://example.com/api", {
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("cleans up abort listener after rate-limit sleep resolves normally", async () => {
    const controller = new AbortController();
    const removeListenerSpy = vi.spyOn(controller.signal, "removeEventListener");

    const headers = new Map([["retry-after", "0.001"]]);
    let callCount = 0;
    fetchSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 429,
          headers: { get: (key: string) => headers.get(key) ?? null },
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    const promise = fetchWithRateLimit("https://example.com/api", {
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(100);
    const response = await promise;
    expect(response.status).toBe(200);
    // The abort listener should have been removed after the sleep resolved
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));
    removeListenerSpy.mockRestore();
  });

  it("uses 1000ms default when no retry-after header", async () => {
    let callCount = 0;
    fetchSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 429,
          headers: { get: () => null },
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    const promise = fetchWithRateLimit("https://example.com/api");
    // Advance past the 1s default wait
    await vi.advanceTimersByTimeAsync(1100);
    const response = await promise;
    expect(response.status).toBe(200);
  });

  it("falls back to x-ratelimit-reset-after when retry-after is malformed", async () => {
    const headers = new Map([
      ["retry-after", "nope"],
      ["x-ratelimit-reset-after", "0.001"],
    ]);
    let callCount = 0;
    fetchSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 429,
          headers: { get: (key: string) => headers.get(key) ?? null },
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    const promise = fetchWithRateLimit("https://example.com/api");
    await vi.advanceTimersByTimeAsync(100);
    const response = await promise;
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("fetchUserGuilds", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("fetches guilds with correct authorization header", async () => {
    const mockGuilds = [
      { id: "1", name: "Test Server", icon: null, owner: true, permissions: "8", features: [] },
    ];

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockGuilds),
    } as Response);

    const guilds = await fetchUserGuilds("test-token");
    expect(guilds).toEqual(mockGuilds);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/users/@me/guilds"),
      expect.objectContaining({
        headers: {
          Authorization: "Bearer test-token",
        },
      }),
    );
  });

  it("throws on non-OK response", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as Response);

    let thrown: unknown;
    try {
      await fetchUserGuilds("bad-token");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("Failed to fetch user guilds");
  });

  it("paginates through multiple pages using after param", async () => {
    // Create 200 guilds for page 1 (triggers pagination)
    const page1 = Array.from({ length: 200 }, (_, i) => ({
      id: String(i + 1),
      name: `Server ${i + 1}`,
      icon: null,
      owner: false,
      permissions: "0",
      features: [],
    }));
    const page2 = [
      { id: "201", name: "Server 201", icon: null, owner: false, permissions: "0", features: [] },
    ];

    let callCount = 0;
    fetchSpy.mockImplementation((url: string | URL | Request) => {
      callCount++;
      const urlStr = url.toString();
      if (callCount === 1) {
        // First call — no "after" param
        expect(urlStr).not.toContain("after=");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(page1),
        } as Response);
      }
      // Second call — should have "after=200"
      expect(urlStr).toContain("after=200");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(page2),
      } as Response);
    });

    const guilds = await fetchUserGuilds("test-token");
    expect(guilds).toHaveLength(201);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("supports AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    fetchSpy.mockRejectedValue(new DOMException("Aborted", "AbortError"));

    await expect(fetchUserGuilds("test-token", controller.signal)).rejects.toThrow();
  });

  it("deduplicates concurrent guild fetches for the same access token", async () => {
    const mockGuilds = [
      { id: "1", name: "Shared Server", icon: null, owner: true, permissions: "8", features: [] },
    ];

    let resolveFetch: ((response: Response) => void) | null = null;
    fetchSpy.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const firstRequest = fetchUserGuilds("shared-token");
    const secondRequest = fetchUserGuilds("shared-token");

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    (resolveFetch as ((response: Response) => void) | null)?.({

      ok: true,
      status: 200,
      json: () => Promise.resolve(mockGuilds),
    } as Response);

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      mockGuilds,
      mockGuilds,
    ]);
  });
});

describe("fetchBotGuilds", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let savedBotApiUrl: string | undefined;
  let savedBotApiSecret: string | undefined;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch");
    savedBotApiUrl = process.env.BOT_API_URL;
    savedBotApiSecret = process.env.BOT_API_SECRET;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    // Restore env vars to prevent pollution
    if (savedBotApiUrl !== undefined) {
      process.env.BOT_API_URL = savedBotApiUrl;
    } else {
      delete process.env.BOT_API_URL;
    }
    if (savedBotApiSecret !== undefined) {
      process.env.BOT_API_SECRET = savedBotApiSecret;
    } else {
      delete process.env.BOT_API_SECRET;
    }
  });

  it("returns unavailable result when BOT_API_URL is not set", async () => {
    delete process.env.BOT_API_URL;

    const result = await fetchBotGuilds();
    expect(result).toEqual({ available: false, guilds: [] });
  });

  it("returns unavailable result when BOT_API_SECRET is missing", async () => {
    process.env.BOT_API_URL = "http://localhost:3001";
    delete process.env.BOT_API_SECRET;

    const result = await fetchBotGuilds();
    expect(result).toEqual({ available: false, guilds: [] });
  });

  it("returns unavailable result when bot API returns non-OK response", async () => {
    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "test-secret";

    fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as Response);

    const result = await fetchBotGuilds();
    expect(result).toEqual({ available: false, guilds: [] });
  });

  it("returns unavailable result when bot API is unreachable", async () => {
    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "test-secret";

    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await fetchBotGuilds();
    expect(result).toEqual({ available: false, guilds: [] });
  });

  it("forwards AbortSignal to the underlying fetch and rethrows aborts", async () => {
    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "test-secret";

    const controller = new AbortController();
    controller.abort(new DOMException("Aborted", "AbortError"));

    fetchSpy.mockRejectedValue(new DOMException("Aborted", "AbortError"));

    await expect(fetchBotGuilds(controller.signal)).rejects.toThrow();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/guilds",
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });

  it("sends x-api-secret header with BOT_API_SECRET", async () => {
    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "my-secret";

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    const result = await fetchBotGuilds();
    expect(result).toEqual({ available: true, guilds: [] });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/guilds",
      expect.objectContaining({
        headers: { "x-api-secret": "my-secret" },
      }),
    );
  });

  it("fails fast when bot API retry-after is too large", async () => {
    vi.useFakeTimers();
    try {
      process.env.BOT_API_URL = "http://localhost:3001";
      process.env.BOT_API_SECRET = "test-secret";

      const headers = new Map([["retry-after", "1"]]);
      fetchSpy.mockResolvedValue({
        status: 429,
        ok: false,
        statusText: "Too Many Requests",
        headers: { get: (key: string) => headers.get(key) ?? null },
      } as unknown as Response);

      const result = await fetchBotGuilds();
      expect(result).toEqual({ available: false, guilds: [] });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

const userGuild = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Server ${id}`,
  icon: null,
  owner: id === '1',
  permissions: id === '1' ? '8' : '0',
  features: [],
  ...overrides,
});

const botGuild = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Server ${id}`,
  icon: null,
  ...overrides,
});

const jsonResponse = (body: unknown, init: Partial<Response> = {}) =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    ...init,
  }) as Response;

function enableBotApiEnv() {
  process.env.BOT_API_URL = 'http://localhost:3001';
  process.env.BOT_API_SECRET = 'test-secret';
}

function restoreBotApiEnv(savedUrl: string | undefined, savedSecret: string | undefined) {
  if (savedUrl !== undefined) {
    process.env.BOT_API_URL = savedUrl;
  } else {
    delete process.env.BOT_API_URL;
  }

  if (savedSecret !== undefined) {
    process.env.BOT_API_SECRET = savedSecret;
  } else {
    delete process.env.BOT_API_SECRET;
  }
}

function mockGuildApis(
  fetchSpy: ReturnType<typeof vi.spyOn>,
  {
    userGuilds,
    botGuilds,
    botResponse,
  }: { userGuilds: unknown[]; botGuilds?: unknown[]; botResponse?: Response | Error },
) {
  fetchSpy.mockImplementation((url: string | URL | Request) => {
    const urlStr = url.toString();
    if (urlStr.includes('/users/@me/guilds')) {
      return Promise.resolve(jsonResponse(userGuilds));
    }
    if (urlStr.includes('/api/v1/guilds')) {
      if (botResponse instanceof Error) {
        return Promise.reject(botResponse);
      }
      return Promise.resolve(botResponse ?? jsonResponse(botGuilds ?? []));
    }
    return Promise.reject(new Error(`Unexpected fetch URL: ${urlStr}`));
  });
}

describe('getUserGuildDirectory', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let savedBotApiUrl: string | undefined;
  let savedBotApiSecret: string | undefined;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
    savedBotApiUrl = process.env.BOT_API_URL;
    savedBotApiSecret = process.env.BOT_API_SECRET;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    restoreBotApiEnv(savedBotApiUrl, savedBotApiSecret);
  });

  it('returns all user guilds and marks whether the bot is present', async () => {
    const userGuilds = [userGuild('1'), userGuild('2'), userGuild('3')];
    const botGuilds = [botGuild('1'), botGuild('3')];

    enableBotApiEnv();
    mockGuildApis(fetchSpy, { userGuilds, botGuilds });

    const guildDirectory = await getUserGuildDirectory('test-token');

    expect(guildDirectory).toHaveLength(3);
    expect(guildDirectory).toEqual([
      expect.objectContaining({ id: '1', botPresent: true }),
      expect.objectContaining({ id: '2', botPresent: false }),
      expect.objectContaining({ id: '3', botPresent: true }),
    ]);
  });

  it('returns all user guilds with unknown bot presence when the bot api fails', async () => {
    const userGuilds = [userGuild('1'), userGuild('2')];

    enableBotApiEnv();
    mockGuildApis(fetchSpy, {
      userGuilds,
      botResponse: jsonResponse(null, { ok: false, status: 500, statusText: 'Internal Server Error' }),
    });

    const guildDirectory = await getUserGuildDirectory('test-token');

    expect(guildDirectory).toHaveLength(2);
    expect(guildDirectory[0]).not.toHaveProperty('botPresent');
    expect(guildDirectory[1]).not.toHaveProperty('botPresent');
  });

  it('treats bot api aborts as unavailable in the guild directory', async () => {
    const userGuilds = [userGuild('1')];
    const timeoutError = new DOMException('Timed out', 'TimeoutError');

    enableBotApiEnv();
    mockGuildApis(fetchSpy, { userGuilds, botResponse: timeoutError });

    await expect(getUserGuildDirectory('test-token')).resolves.toEqual([
      expect.not.objectContaining({ botPresent: expect.anything() }),
    ]);
  });
});

describe('getUserGuilds', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let savedBotApiUrl: string | undefined;
  let savedBotApiSecret: string | undefined;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
    savedBotApiUrl = process.env.BOT_API_URL;
    savedBotApiSecret = process.env.BOT_API_SECRET;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    restoreBotApiEnv(savedBotApiUrl, savedBotApiSecret);
  });

  it('returns only mutual guilds when the bot api is available', async () => {
    const userGuilds = [userGuild('1'), userGuild('2'), userGuild('3')];
    const botGuilds = [botGuild('1'), botGuild('3')];

    enableBotApiEnv();
    mockGuildApis(fetchSpy, { userGuilds, botGuilds });

    const mutualGuilds = await getUserGuilds('test-token');

    expect(mutualGuilds).toEqual([
      expect.objectContaining({ id: '1', botPresent: true }),
      expect.objectContaining({ id: '3', botPresent: true }),
    ]);
  });

  it('fetches bot guilds and user guilds in parallel for mutual guild checks', async () => {
    const userGuilds = [userGuild('1')];
    const botGuilds = [botGuild('1')];

    enableBotApiEnv();

    let userFetchStarted = false;
    let resolveBotFetch: (value: Response) => void;
    let resolveUserFetch: (value: Response) => void;

    const botFetch = new Promise<Response>((resolve) => {
      resolveBotFetch = resolve;
    });
    const userFetch = new Promise<Response>((resolve) => {
      resolveUserFetch = resolve;
    });

    fetchSpy.mockImplementation((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v1/guilds')) {
        return botFetch;
      }
      if (urlStr.includes('/users/@me/guilds')) {
        userFetchStarted = true;
        return userFetch;
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${urlStr}`));
    });

    const mutualGuildsPromise = getUserGuilds('test-token');

    expect(userFetchStarted).toBe(true);

    resolveBotFetch!(jsonResponse(botGuilds));
    resolveUserFetch!(jsonResponse(userGuilds));

    await expect(mutualGuildsPromise).resolves.toEqual([
      expect.objectContaining({ id: '1', botPresent: true }),
    ]);
  });

  it('returns all user guilds marked present when the bot api fails', async () => {
    const userGuilds = [userGuild('1'), userGuild('2')];

    enableBotApiEnv();
    mockGuildApis(fetchSpy, {
      userGuilds,
      botResponse: jsonResponse(null, { ok: false, status: 500, statusText: 'Internal Server Error' }),
    });

    await expect(getUserGuilds('test-token')).resolves.toEqual([
      expect.objectContaining({ id: '1', botPresent: true }),
      expect.objectContaining({ id: '2', botPresent: true }),
    ]);
  });

  it('returns all user guilds marked present when no BOT_API_URL is set', async () => {
    const userGuilds = [userGuild('1')];

    fetchSpy.mockResolvedValue(jsonResponse(userGuilds));

    delete process.env.BOT_API_URL;

    await expect(getUserGuilds('test-token')).resolves.toEqual([
      expect.objectContaining({ id: '1', botPresent: true }),
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/users/@me/guilds'),
      expect.any(Object),
    );
  });
});
