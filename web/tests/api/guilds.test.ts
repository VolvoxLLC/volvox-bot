import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock next-auth/providers/discord
vi.mock("next-auth/providers/discord", () => ({
  default: vi.fn((config: Record<string, unknown>) => ({
    id: "discord",
    name: "Discord",
    type: "oauth",
    ...config,
  })),
}));

// Mock getToken from next-auth/jwt (used in the new API route)
const mockGetToken = vi.fn();
vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

// Mock discord server lib
const mockGetUserGuildDirectory = vi.fn();
vi.mock("@/lib/discord.server", () => ({
  getUserGuildDirectory: (...args: unknown[]) => mockGetUserGuildDirectory(...args),
}));
const mockGetBotApiBaseUrl = vi.fn();
vi.mock("@/lib/bot-api", () => ({
  getBotApiBaseUrl: () => mockGetBotApiBaseUrl(),
}));

import { GET } from "@/app/api/guilds/route";

function createMockRequest(url = "http://localhost:3000/api/guilds"): NextRequest {
  return new NextRequest(new URL(url));
}

describe("GET /api/guilds", () => {
  const originalSecret = process.env.NEXTAUTH_SECRET;
  const originalBotApiUrl = process.env.BOT_API_URL;
  const originalBotApiSecret = process.env.BOT_API_SECRET;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = "a-valid-secret-that-is-at-least-32-characters-long";
    delete process.env.BOT_API_URL;
    delete process.env.BOT_API_SECRET;
    mockGetBotApiBaseUrl.mockReturnValue(null);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (originalBotApiUrl === undefined) {
      delete process.env.BOT_API_URL;
    } else {
      process.env.BOT_API_URL = originalBotApiUrl;
    }
    if (originalBotApiSecret === undefined) {
      delete process.env.BOT_API_SECRET;
    } else {
      process.env.BOT_API_SECRET = originalBotApiSecret;
    }
    if (originalSecret === undefined) {
      delete process.env.NEXTAUTH_SECRET;
    } else {
      process.env.NEXTAUTH_SECRET = originalSecret;
    }
  });

  it("returns 401 when no token exists", async () => {
    mockGetToken.mockResolvedValue(null);

    const response = await GET(createMockRequest());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when token has no access token", async () => {
    mockGetToken.mockResolvedValue({
      sub: "123",
      id: "user-123",
      // No accessToken
    });

    const response = await GET(createMockRequest());

    expect(response.status).toBe(401);
  });

  it("returns guilds when authenticated with valid token", async () => {
    const mockGuilds = [
      { id: "1", name: "Server 1", icon: null, botPresent: true },
    ];

    mockGetToken.mockResolvedValue({
      sub: "123",
      accessToken: "valid-discord-token",
      refreshToken: "refresh-token",
      accessTokenExpires: Date.now() + 60_000,
      id: "discord-user-123",
    });
    mockGetUserGuildDirectory.mockResolvedValue(mockGuilds);

    const response = await GET(createMockRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(mockGuilds);
    expect(mockGetUserGuildDirectory).toHaveBeenCalledWith(
      "valid-discord-token",
      expect.any(AbortSignal),
    );
  });

  it("returns 401 when token has RefreshTokenError", async () => {
    mockGetToken.mockResolvedValue({
      sub: "123",
      accessToken: "stale-token",
      id: "discord-user-123",
      error: "RefreshTokenError",
    });

    const response = await GET(createMockRequest());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/sign in/i);
    expect(mockGetUserGuildDirectory).not.toHaveBeenCalled();
  });

  it("returns 500 on discord API error", async () => {
    mockGetToken.mockResolvedValue({
      sub: "123",
      accessToken: "valid-discord-token",
      refreshToken: "refresh-token",
      accessTokenExpires: Date.now() + 60_000,
      id: "discord-user-123",
    });
    mockGetUserGuildDirectory.mockRejectedValue(new Error("Discord API error"));

    const response = await GET(createMockRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to fetch guilds");
  });

  it("augments guilds with bot-evaluated access levels when bot api is configured", async () => {
    process.env.BOT_API_SECRET = "bot-secret";
    mockGetBotApiBaseUrl.mockReturnValue("http://bot.internal/api/v1");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "1", access: "moderator" }],
      status: 200,
      statusText: "OK",
    } as Response);

    mockGetToken.mockResolvedValue({
      sub: "123",
      id: "discord-user-123",
      accessToken: "valid-discord-token",
    });
    mockGetUserGuildDirectory.mockResolvedValue([
      {
        id: "1",
        name: "Server 1",
        icon: null,
        owner: false,
        permissions: "0",
        features: [],
        botPresent: true,
      },
    ]);

    const response = await GET(createMockRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([
      expect.objectContaining({
        id: "1",
        access: "moderator",
      }),
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/guilds/access?"),
      expect.objectContaining({
        headers: { "x-api-secret": "bot-secret" },
      }),
    );
  });

  it("ignores unknown access values from the bot api", async () => {
    process.env.BOT_API_SECRET = "bot-secret";
    mockGetBotApiBaseUrl.mockReturnValue("http://bot.internal/api/v1");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "1", access: "super-admin" }],
      status: 200,
      statusText: "OK",
    } as Response);

    mockGetToken.mockResolvedValue({
      sub: "123",
      id: "discord-user-123",
      accessToken: "valid-discord-token",
    });
    mockGetUserGuildDirectory.mockResolvedValue([
      {
        id: "1",
        name: "Server 1",
        icon: null,
        owner: false,
        permissions: "0",
        features: [],
        botPresent: true,
        access: "viewer",
      },
    ]);

    const response = await GET(createMockRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([
      expect.objectContaining({
        id: "1",
        access: "viewer",
      }),
    ]);
  });

  it("batches guild access lookups to avoid exceeding the 100-guild API cap", async () => {
    process.env.BOT_API_SECRET = "bot-secret";
    mockGetBotApiBaseUrl.mockReturnValue("http://bot.internal/api/v1");

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => [],
        status: 200,
        statusText: "OK",
      } as Response);

    mockGetToken.mockResolvedValue({
      sub: "123",
      id: "discord-user-123",
      accessToken: "valid-discord-token",
    });
    mockGetUserGuildDirectory.mockResolvedValue(
      Array.from({ length: 205 }, (_, index) => ({
        id: String(index + 1),
        name: `Server ${index + 1}`,
        icon: null,
        owner: false,
        permissions: "0",
        features: [],
        botPresent: true,
      })),
    );

    const response = await GET(createMockRequest());

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    const urls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => new URL(call[0] as string),
    );
    expect(urls.map((url) => url.searchParams.get("guildIds")?.split(",").length)).toEqual([
      100, 100, 5,
    ]);
  });
});
