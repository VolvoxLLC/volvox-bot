import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getGuildIconUrl, getUserAvatarUrl } from "@/lib/discord";
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

describe("getUserAvatarUrl", () => {
  it("returns default avatar when no avatar hash", () => {
    const url = getUserAvatarUrl("123456789012345678", null);
    expect(url).toMatch(
      /https:\/\/cdn\.discordapp\.com\/embed\/avatars\/\d\.png/,
    );
  });

  it("returns webp avatar for non-animated hash", () => {
    const url = getUserAvatarUrl("123", "abc123", "0", 128);
    expect(url).toBe(
      "https://cdn.discordapp.com/avatars/123/abc123.webp?size=128",
    );
  });

  it("returns gif avatar for animated hash", () => {
    const url = getUserAvatarUrl("123", "a_abc123", "0", 64);
    expect(url).toBe(
      "https://cdn.discordapp.com/avatars/123/a_abc123.gif?size=64",
    );
  });

  it("uses discriminator for default avatar when not 0", () => {
    const url = getUserAvatarUrl("123", null, "1234");
    expect(url).toBe("https://cdn.discordapp.com/embed/avatars/4.png");
  });
});

describe("fetchWithRateLimit", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns response directly when not rate limited", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    });

    const response = await fetchWithRateLimit("https://example.com/api");
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 with retry-after header", async () => {
    const headers = new Map([["retry-after", "0.01"]]);
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 429,
          headers: { get: (key: string) => headers.get(key) ?? null },
        });
      }
      return Promise.resolve({ ok: true, status: 200 });
    });

    const response = await fetchWithRateLimit("https://example.com/api");
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("parses retry-after header as seconds and waits", async () => {
    const headers = new Map([["retry-after", "0.001"]]); // 1ms
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({
          status: 429,
          headers: { get: (key: string) => headers.get(key) ?? null },
        });
      }
      return Promise.resolve({ ok: true, status: 200 });
    });

    const response = await fetchWithRateLimit("https://example.com/api");
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("returns 429 after exhausting max retries", async () => {
    const headers = new Map([["retry-after", "0.001"]]);
    global.fetch = vi.fn().mockResolvedValue({
      status: 429,
      headers: { get: (key: string) => headers.get(key) ?? null },
    });

    const response = await fetchWithRateLimit("https://example.com/api");
    expect(response.status).toBe(429);
    // 1 initial + 3 retries = 4 total calls
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it("uses 1000ms default when no retry-after header", async () => {
    // We can't easily test the exact timing, but we can verify the behavior
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 429,
          headers: { get: () => null },
        });
      }
      return Promise.resolve({ ok: true, status: 200 });
    });

    // This will wait 1s due to default, so we just verify it eventually resolves
    const response = await fetchWithRateLimit("https://example.com/api");
    expect(response.status).toBe(200);
  });
});

describe("fetchUserGuilds", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("fetches guilds with correct authorization header", async () => {
    const mockGuilds = [
      { id: "1", name: "Test Server", icon: null, owner: true, permissions: "8", features: [] },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockGuilds),
    });

    const guilds = await fetchUserGuilds("test-token");
    expect(guilds).toEqual(mockGuilds);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/users/@me/guilds"),
      expect.objectContaining({
        headers: {
          Authorization: "Bearer test-token",
        },
      }),
    );
  });

  it("throws on non-OK response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

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
    global.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (callCount === 1) {
        // First call — no "after" param
        expect(url).not.toContain("after=");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(page1),
        });
      }
      // Second call — should have "after=200"
      expect(url).toContain("after=200");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(page2),
      });
    });

    const guilds = await fetchUserGuilds("test-token");
    expect(guilds).toHaveLength(201);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("supports AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    global.fetch = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));

    await expect(fetchUserGuilds("test-token", controller.signal)).rejects.toThrow();
  });
});

describe("fetchBotGuilds", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns empty array when BOT_API_URL is not set", async () => {
    const originalEnv = process.env.BOT_API_URL;
    delete process.env.BOT_API_URL;

    const result = await fetchBotGuilds();
    expect(result).toEqual([]);

    process.env.BOT_API_URL = originalEnv;
  });

  it("returns empty array when BOT_API_SECRET is missing", async () => {
    const originalUrl = process.env.BOT_API_URL;
    const originalSecret = process.env.BOT_API_SECRET;
    process.env.BOT_API_URL = "http://localhost:3001";
    delete process.env.BOT_API_SECRET;

    const result = await fetchBotGuilds();
    expect(result).toEqual([]);

    process.env.BOT_API_URL = originalUrl;
    process.env.BOT_API_SECRET = originalSecret;
  });

  it("returns empty array when bot API returns non-OK response", async () => {
    const originalUrl = process.env.BOT_API_URL;
    const originalSecret = process.env.BOT_API_SECRET;
    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "test-secret";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    const result = await fetchBotGuilds();
    expect(result).toEqual([]);

    process.env.BOT_API_URL = originalUrl;
    process.env.BOT_API_SECRET = originalSecret;
  });

  it("returns empty array when bot API is unreachable", async () => {
    const originalUrl = process.env.BOT_API_URL;
    const originalSecret = process.env.BOT_API_SECRET;
    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "test-secret";

    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await fetchBotGuilds();
    expect(result).toEqual([]);

    process.env.BOT_API_URL = originalUrl;
    process.env.BOT_API_SECRET = originalSecret;
  });

  it("sends Authorization header with BOT_API_SECRET", async () => {
    const originalUrl = process.env.BOT_API_URL;
    const originalSecret = process.env.BOT_API_SECRET;
    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "my-secret";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await fetchBotGuilds();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/guilds",
      expect.objectContaining({
        headers: { Authorization: "Bearer my-secret" },
      }),
    );

    process.env.BOT_API_URL = originalUrl;
    process.env.BOT_API_SECRET = originalSecret;
  });
});

describe("getMutualGuilds", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
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

    const originalUrl = process.env.BOT_API_URL;
    const originalSecret = process.env.BOT_API_SECRET;
    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "test-secret";

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(userGuilds) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(botGuilds) });
    });

    const mutualGuilds = await getMutualGuilds("test-token");

    process.env.BOT_API_URL = originalUrl;
    process.env.BOT_API_SECRET = originalSecret;

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

    const originalUrl = process.env.BOT_API_URL;
    const originalSecret = process.env.BOT_API_SECRET;
    process.env.BOT_API_URL = "http://localhost:3001";
    process.env.BOT_API_SECRET = "test-secret";

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(userGuilds) });
      }
      return Promise.resolve({ ok: false, status: 500, statusText: "Internal Server Error" });
    });

    const mutualGuilds = await getMutualGuilds("test-token");

    process.env.BOT_API_URL = originalUrl;
    process.env.BOT_API_SECRET = originalSecret;

    expect(mutualGuilds).toHaveLength(2);
    expect(mutualGuilds[0].botPresent).toBe(false);
    expect(mutualGuilds[1].botPresent).toBe(false);
  });

  it("returns all user guilds when no BOT_API_URL is set", async () => {
    const userGuilds = [
      { id: "1", name: "Server 1", icon: null, owner: true, permissions: "8", features: [] },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(userGuilds),
    });

    const originalEnv = process.env.BOT_API_URL;
    delete process.env.BOT_API_URL;

    const mutualGuilds = await getMutualGuilds("test-token");

    process.env.BOT_API_URL = originalEnv;

    expect(mutualGuilds).toHaveLength(1);
    expect(mutualGuilds[0].botPresent).toBe(false);
  });
});
