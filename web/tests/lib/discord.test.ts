import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getGuildIconUrl } from "@/lib/discord";
import {
  fetchUserGuilds,
  fetchBotGuilds,
  getMutualGuilds,
  fetchWithRateLimit,
} from "@/lib/discord.server";

describe("getGuildIconUrl", () => {
  it("returns default icon when no icon hash", () => {
    const url = getGuildIconUrl("123", null);
    expect(url).toBe("https://cdn.discordapp.com/embed/avatars/0.png");
  });

  it("returns webp icon for non-animated hash", () => {
    const url = getGuildIconUrl("123", "abc123", 128);
    expect(url).toBe(
      "https://cdn.discordapp.com/icons/123/abc123.webp?size=128",
    );
  });

  it("returns gif icon for animated hash", () => {
    const url = getGuildIconUrl("123", "a_abc123", 64);
    expect(url).toBe(
      "https://cdn.discordapp.com/icons/123/a_abc123.gif?size=64",
    );
  });

  it("defaults to size 128", () => {
    const url = getGuildIconUrl("123", "abc123");
    expect(url).toContain("size=128");
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

    await expect(fetchUserGuilds("bad-token")).rejects.toThrow(
      "Failed to fetch user guilds",
    );
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

  it("forwards AbortSignal to the underlying fetch", async () => {
    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "test-secret";

    const controller = new AbortController();
    controller.abort(new DOMException("Aborted", "AbortError"));

    fetchSpy.mockRejectedValue(new DOMException("Aborted", "AbortError"));

    // fetchBotGuilds catches errors internally and returns unavailable
    const result = await fetchBotGuilds(controller.signal);
    expect(result).toEqual({ available: false, guilds: [] });

    // Verify signal was forwarded to fetch
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/api/guilds",
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });

  it("sends Authorization header with BOT_API_SECRET", async () => {
    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "my-secret";

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    const result = await fetchBotGuilds();
    expect(result).toEqual({ available: true, guilds: [] });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/api/guilds",
      expect.objectContaining({
        headers: { Authorization: "Bearer my-secret" },
      }),
    );
  });
});

describe("getMutualGuilds", () => {
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

  it("returns only guilds where bot is present", async () => {
    const userGuilds = [
      { id: "1", name: "Server 1", icon: null, owner: true, permissions: "8", features: [] },
      { id: "2", name: "Server 2", icon: null, owner: false, permissions: "0", features: [] },
      { id: "3", name: "Server 3", icon: null, owner: false, permissions: "0", features: [] },
    ];
    const botGuilds = [
      { id: "1", name: "Server 1", icon: null },
      { id: "3", name: "Server 3", icon: null },
    ];

    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "test-secret";

    fetchSpy.mockImplementation((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/users/@me/guilds")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(userGuilds) } as Response);
      }
      if (urlStr.includes("/api/guilds")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(botGuilds) } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${urlStr}`));
    });

    const mutualGuilds = await getMutualGuilds("test-token");

    expect(mutualGuilds).toHaveLength(2);
    expect(mutualGuilds[0].id).toBe("1");
    expect(mutualGuilds[1].id).toBe("3");
    expect(mutualGuilds[0].botPresent).toBe(true);
  });

  it("returns all user guilds unfiltered when bot API fails", async () => {
    const userGuilds = [
      { id: "1", name: "Server 1", icon: null, owner: true, permissions: "8", features: [] },
      { id: "2", name: "Server 2", icon: null, owner: false, permissions: "0", features: [] },
    ];

    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "test-secret";

    fetchSpy.mockImplementation((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/users/@me/guilds")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(userGuilds) } as Response);
      }
      if (urlStr.includes("/api/guilds")) {
        return Promise.resolve({ ok: false, status: 500, statusText: "Internal Server Error" } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${urlStr}`));
    });

    const mutualGuilds = await getMutualGuilds("test-token");

    expect(mutualGuilds).toHaveLength(2);
    expect(mutualGuilds[0].botPresent).toBe(false);
    expect(mutualGuilds[1].botPresent).toBe(false);
  });

  it("returns all user guilds when no BOT_API_URL is set", async () => {
    const userGuilds = [
      { id: "1", name: "Server 1", icon: null, owner: true, permissions: "8", features: [] },
    ];

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(userGuilds),
    } as Response);

    delete process.env.BOT_API_URL;

    const mutualGuilds = await getMutualGuilds("test-token");

    expect(mutualGuilds).toHaveLength(1);
    expect(mutualGuilds[0].botPresent).toBe(false);
  });
});
