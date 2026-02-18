import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetToken, mockGetMutualGuilds } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockGetMutualGuilds: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: mockGetToken,
}));

vi.mock("@/lib/discord.server", () => ({
  getMutualGuilds: mockGetMutualGuilds,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { GET } from "@/app/api/guilds/[guildId]/analytics/route";

function createRequest(
  url = "http://localhost:3000/api/guilds/guild-1/analytics?range=week",
): NextRequest {
  return new NextRequest(new URL(url));
}

describe("GET /api/guilds/[guildId]/analytics", () => {
  const originalBotApiUrl = process.env.BOT_API_URL;
  const originalBotApiSecret = process.env.BOT_API_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_URL = "http://bot.internal:3001";
    process.env.BOT_API_SECRET = "bot-secret";
    mockGetMutualGuilds.mockResolvedValue([
      {
        id: "guild-1",
        permissions: String(0x8),
        owner: false,
      },
    ]);
  });

  afterEach(() => {
    if (originalBotApiUrl === undefined) delete process.env.BOT_API_URL;
    else process.env.BOT_API_URL = originalBotApiUrl;

    if (originalBotApiSecret === undefined) delete process.env.BOT_API_SECRET;
    else process.env.BOT_API_SECRET = originalBotApiSecret;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetToken.mockResolvedValue(null);

    const response = await GET(createRequest(), {
      params: Promise.resolve({ guildId: "guild-1" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when user does not have admin access to requested guild", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "discord-token" });
    mockGetMutualGuilds.mockResolvedValue([
      {
        id: "guild-1",
        permissions: "0",
        owner: false,
      },
    ]);

    const response = await GET(createRequest(), {
      params: Promise.resolve({ guildId: "guild-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("returns 403 when requested guild is not in user's mutual guilds", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "discord-token" });
    mockGetMutualGuilds.mockResolvedValue([
      {
        id: "guild-other",
        permissions: String(0x8),
        owner: false,
      },
    ]);

    const response = await GET(createRequest(), {
      params: Promise.resolve({ guildId: "guild-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("allows guild owner access even without ADMINISTRATOR permission bit", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "discord-token" });
    mockGetMutualGuilds.mockResolvedValue([
      {
        id: "guild-1",
        permissions: "0",
        owner: true,
      },
    ]);

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ ok: true }),
    } as Response);

    const response = await GET(createRequest(), {
      params: Promise.resolve({ guildId: "guild-1" }),
    });

    expect(response.status).toBe(200);
  });

  it("returns 502 when guild permission verification fails", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "discord-token" });
    mockGetMutualGuilds.mockRejectedValue(new Error("Discord unavailable"));

    const response = await GET(createRequest(), {
      params: Promise.resolve({ guildId: "guild-1" }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to verify guild permissions",
    });
  });

  it("returns 500 when bot API env vars are missing", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "discord-token" });
    delete process.env.BOT_API_URL;

    const response = await GET(createRequest(), {
      params: Promise.resolve({ guildId: "guild-1" }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/not configured/i);
  });

  it("returns 500 when BOT_API_SECRET is missing", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "discord-token" });
    delete process.env.BOT_API_SECRET;

    const response = await GET(createRequest(), {
      params: Promise.resolve({ guildId: "guild-1" }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/not configured/i);
  });

  it("returns 500 when BOT_API_URL is malformed", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "discord-token" });
    process.env.BOT_API_URL = "http://[";

    const response = await GET(createRequest(), {
      params: Promise.resolve({ guildId: "guild-1" }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Bot API is not configured correctly",
    });
  });

  it("proxies analytics request to bot API v1 with x-api-secret", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "discord-token" });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ guildId: "guild-1", kpis: { totalMessages: 1 } }),
    } as Response);

    const response = await GET(createRequest(), {
      params: Promise.resolve({ guildId: "guild-1" }),
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "http://bot.internal:3001/api/v1/guilds/guild-1/analytics?range=week",
      ),
      expect.objectContaining({
        headers: { "x-api-secret": "bot-secret" },
      }),
    );
  });

  it("forwards upstream error status and message", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "discord-token" });

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ error: "Guild not found" }),
    } as Response);

    const response = await GET(createRequest(), {
      params: Promise.resolve({ guildId: "guild-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Guild not found" });
  });
});
