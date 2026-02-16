import { describe, it, expect, vi, beforeEach } from "vitest";
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
const mockGetMutualGuilds = vi.fn();
vi.mock("@/lib/discord.server", () => ({
  getMutualGuilds: (...args: unknown[]) => mockGetMutualGuilds(...args),
}));

import { GET } from "@/app/api/guilds/route";

function createMockRequest(url = "http://localhost:3000/api/guilds"): NextRequest {
  return new NextRequest(new URL(url));
}

describe("GET /api/guilds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = "a-valid-secret-that-is-at-least-32-characters-long";
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
    mockGetMutualGuilds.mockResolvedValue(mockGuilds);

    const response = await GET(createMockRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(mockGuilds);
    expect(mockGetMutualGuilds).toHaveBeenCalledWith(
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
    expect(mockGetMutualGuilds).not.toHaveBeenCalled();
  });

  it("returns 500 on discord API error", async () => {
    mockGetToken.mockResolvedValue({
      sub: "123",
      accessToken: "valid-discord-token",
      refreshToken: "refresh-token",
      accessTokenExpires: Date.now() + 60_000,
      id: "discord-user-123",
    });
    mockGetMutualGuilds.mockRejectedValue(new Error("Discord API error"));

    const response = await GET(createMockRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to fetch guilds");
  });
});
