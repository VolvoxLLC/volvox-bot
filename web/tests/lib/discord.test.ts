import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGuildIconUrl, getUserAvatarUrl, fetchUserGuilds, fetchBotGuilds, getMutualGuilds } from "@/lib/discord";

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

describe("fetchUserGuilds", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches guilds with correct authorization header", async () => {
    const mockGuilds = [
      { id: "1", name: "Test Server", icon: null, owner: true, permissions: "8", features: [] },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
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
});

describe("fetchBotGuilds", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty array when bot API returns non-OK response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    const originalEnv = process.env.BOT_API_URL;
    process.env.BOT_API_URL = "http://localhost:3001";

    const result = await fetchBotGuilds();

    process.env.BOT_API_URL = originalEnv;

    expect(result).toEqual([]);
  });

  it("returns empty array when bot API is unreachable (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const originalEnv = process.env.BOT_API_URL;
    process.env.BOT_API_URL = "http://localhost:3001";

    const result = await fetchBotGuilds();

    process.env.BOT_API_URL = originalEnv;

    expect(result).toEqual([]);
  });

  it("returns empty array when BOT_API_URL is not set", async () => {
    const originalEnv = process.env.BOT_API_URL;
    delete process.env.BOT_API_URL;

    const result = await fetchBotGuilds();

    process.env.BOT_API_URL = originalEnv;

    expect(result).toEqual([]);
  });
});

describe("getMutualGuilds", () => {
  beforeEach(() => {
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

    // Mock fetchUserGuilds call (first fetch) and fetchBotGuilds call (second fetch)
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(userGuilds) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(botGuilds) });
    });

    // Need BOT_API_URL to be set for fetchBotGuilds to actually call fetch
    const originalEnv = process.env.BOT_API_URL;
    process.env.BOT_API_URL = "http://localhost:3001";

    const mutualGuilds = await getMutualGuilds("test-token");

    process.env.BOT_API_URL = originalEnv;

    expect(mutualGuilds).toHaveLength(2);
    expect(mutualGuilds[0].id).toBe("1");
    expect(mutualGuilds[1].id).toBe("3");
    expect(mutualGuilds[0].botPresent).toBe(true);
  });

  it("returns all user guilds unfiltered when bot API returns non-OK response", async () => {
    const userGuilds = [
      { id: "1", name: "Server 1", icon: null, owner: true, permissions: "8", features: [] },
      { id: "2", name: "Server 2", icon: null, owner: false, permissions: "0", features: [] },
    ];

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(userGuilds) });
      }
      // Bot API returns 500
      return Promise.resolve({ ok: false, status: 500, statusText: "Internal Server Error" });
    });

    const originalEnv = process.env.BOT_API_URL;
    process.env.BOT_API_URL = "http://localhost:3001";

    const mutualGuilds = await getMutualGuilds("test-token");

    process.env.BOT_API_URL = originalEnv;

    // Bot API failed — should return all user guilds unfiltered with botPresent=false
    expect(mutualGuilds).toHaveLength(2);
    expect(mutualGuilds[0].botPresent).toBe(false);
    expect(mutualGuilds[1].botPresent).toBe(false);
  });

  it("returns all user guilds unfiltered when bot API is unreachable", async () => {
    const userGuilds = [
      { id: "1", name: "Server 1", icon: null, owner: true, permissions: "8", features: [] },
    ];

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(userGuilds) });
      }
      // Bot API network error
      return Promise.reject(new Error("ECONNREFUSED"));
    });

    const originalEnv = process.env.BOT_API_URL;
    process.env.BOT_API_URL = "http://localhost:3001";

    const mutualGuilds = await getMutualGuilds("test-token");

    process.env.BOT_API_URL = originalEnv;

    // Bot API unreachable — should return all user guilds unfiltered
    expect(mutualGuilds).toHaveLength(1);
    expect(mutualGuilds[0].botPresent).toBe(false);
  });

  it("returns empty when no BOT_API_URL is set", async () => {
    const userGuilds = [
      { id: "1", name: "Server 1", icon: null, owner: true, permissions: "8", features: [] },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(userGuilds),
    });

    const originalEnv = process.env.BOT_API_URL;
    delete process.env.BOT_API_URL;

    const mutualGuilds = await getMutualGuilds("test-token");

    process.env.BOT_API_URL = originalEnv;

    // With no BOT_API_URL, fetchBotGuilds returns [] so all user guilds
    // are returned unfiltered with botPresent=false
    expect(mutualGuilds).toHaveLength(1);
    expect(mutualGuilds[0].botPresent).toBe(false);
  });
});
