/**
 * Tests for web/src/app/api/guilds/[guildId]/tickets/stats/route.ts
 * Covers GET endpoint for fetching ticket statistics
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mock bot-api-proxy module
const mockAuthorizeGuildAdmin = vi.fn();
const mockGetBotApiConfig = vi.fn();
const mockBuildUpstreamUrl = vi.fn();
const mockProxyToBotApi = vi.fn();

vi.mock("@/lib/bot-api-proxy", () => ({
  authorizeGuildAdmin: (...args: unknown[]) => mockAuthorizeGuildAdmin(...args),
  getBotApiConfig: (...args: unknown[]) => mockGetBotApiConfig(...args),
  buildUpstreamUrl: (...args: unknown[]) => mockBuildUpstreamUrl(...args),
  proxyToBotApi: (...args: unknown[]) => mockProxyToBotApi(...args),
}));

import { GET } from "@/app/api/guilds/[guildId]/tickets/stats/route";

function createMockRequest(guildId: string): NextRequest {
  const url = `http://localhost:3000/api/guilds/${guildId}/tickets/stats`;
  return new NextRequest(new URL(url));
}

async function mockParams(guildId: string) {
  return { guildId };
}

describe("GET /api/guilds/:guildId/tickets/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful auth
    mockAuthorizeGuildAdmin.mockResolvedValue(null);

    // Default successful config
    mockGetBotApiConfig.mockReturnValue({
      baseUrl: "http://localhost:3001/api/v1",
      secret: "test-secret",
    });

    // Default successful URL build
    mockBuildUpstreamUrl.mockImplementation((baseUrl, path) => {
      return new URL(path, baseUrl);
    });

    // Default successful proxy with zero stats
    mockProxyToBotApi.mockResolvedValue(
      NextResponse.json({
        openCount: 0,
        avgResolutionSeconds: 0,
        ticketsThisWeek: 0,
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Validation ──────────────────────────────────────────────

  it("should return 400 when guildId is missing", async () => {
    const request = createMockRequest("");
    const response = await GET(request, { params: mockParams("") });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing guildId");
  });

  // ─── Auth & Config ───────────────────────────────────────────

  it("should return error when authorization fails", async () => {
    const authError = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    mockAuthorizeGuildAdmin.mockResolvedValue(authError);

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response).toBe(authError);
    expect(mockAuthorizeGuildAdmin).toHaveBeenCalledWith(
      request,
      "guild1",
      "[api/guilds/:guildId/tickets/stats]"
    );
  });

  it("should return error when bot API config is invalid", async () => {
    const configError = NextResponse.json(
      { error: "Bot API not configured" },
      { status: 500 }
    );
    mockGetBotApiConfig.mockReturnValue(configError);

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response).toBe(configError);
  });

  it("should return error when upstream URL build fails", async () => {
    const urlError = NextResponse.json({ error: "Invalid URL" }, { status: 500 });
    mockBuildUpstreamUrl.mockReturnValue(urlError);

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response).toBe(urlError);
  });

  // ─── Successful requests ─────────────────────────────────────

  it("should fetch ticket stats successfully", async () => {
    const mockStats = {
      openCount: 5,
      avgResolutionSeconds: 3600,
      ticketsThisWeek: 12,
    };

    mockProxyToBotApi.mockResolvedValue(NextResponse.json(mockStats));

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.openCount).toBe(5);
    expect(body.avgResolutionSeconds).toBe(3600);
    expect(body.ticketsThisWeek).toBe(12);
  });

  it("should build correct upstream URL", async () => {
    const request = createMockRequest("guild1");
    await GET(request, { params: mockParams("guild1") });

    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1",
      "/guilds/guild1/tickets/stats",
      "[api/guilds/:guildId/tickets/stats]"
    );
  });

  it("should call proxyToBotApi with correct parameters", async () => {
    const upstreamUrl = new URL("http://localhost:3001/api/v1/guilds/guild1/tickets/stats");
    mockBuildUpstreamUrl.mockReturnValue(upstreamUrl);

    const request = createMockRequest("guild1");
    await GET(request, { params: mockParams("guild1") });

    expect(mockProxyToBotApi).toHaveBeenCalledWith(
      upstreamUrl,
      "test-secret",
      "[api/guilds/:guildId/tickets/stats]",
      "Failed to fetch ticket stats"
    );
  });

  // ─── Zero stats ──────────────────────────────────────────────

  it("should return zero stats for guild with no tickets", async () => {
    const mockStats = {
      openCount: 0,
      avgResolutionSeconds: 0,
      ticketsThisWeek: 0,
    };

    mockProxyToBotApi.mockResolvedValue(NextResponse.json(mockStats));

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.openCount).toBe(0);
    expect(body.avgResolutionSeconds).toBe(0);
    expect(body.ticketsThisWeek).toBe(0);
  });

  // ─── High-traffic scenarios ──────────────────────────────────

  it("should handle guilds with many open tickets", async () => {
    const mockStats = {
      openCount: 150,
      avgResolutionSeconds: 7200,
      ticketsThisWeek: 300,
    };

    mockProxyToBotApi.mockResolvedValue(NextResponse.json(mockStats));

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.openCount).toBe(150);
    expect(body.ticketsThisWeek).toBe(300);
  });

  it("should handle very fast resolution times", async () => {
    const mockStats = {
      openCount: 2,
      avgResolutionSeconds: 60, // 1 minute average
      ticketsThisWeek: 50,
    };

    mockProxyToBotApi.mockResolvedValue(NextResponse.json(mockStats));

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.avgResolutionSeconds).toBe(60);
  });

  it("should handle very slow resolution times", async () => {
    const mockStats = {
      openCount: 10,
      avgResolutionSeconds: 604800, // 1 week
      ticketsThisWeek: 5,
    };

    mockProxyToBotApi.mockResolvedValue(NextResponse.json(mockStats));

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.avgResolutionSeconds).toBe(604800);
  });

  // ─── URL encoding ────────────────────────────────────────────

  it("should properly encode guild ID in URL", async () => {
    const guildIdWithSpecialChars = "guild/special";
    const request = createMockRequest(guildIdWithSpecialChars);
    await GET(request, { params: mockParams(guildIdWithSpecialChars) });

    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      expect.any(String),
      "/guilds/guild%2Fspecial/tickets/stats",
      expect.any(String)
    );
  });

  // ─── Error responses ─────────────────────────────────────────

  it("should handle 500 from upstream", async () => {
    mockProxyToBotApi.mockResolvedValue(
      NextResponse.json({ error: "Failed to fetch ticket stats" }, { status: 500 })
    );

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to fetch ticket stats");
  });

  // ─── Edge cases ──────────────────────────────────────────────

  it("should handle stats with partial data", async () => {
    const mockStats = {
      openCount: 3,
      avgResolutionSeconds: 0, // No closed tickets yet
      ticketsThisWeek: 3,
    };

    mockProxyToBotApi.mockResolvedValue(NextResponse.json(mockStats));

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.openCount).toBe(3);
    expect(body.avgResolutionSeconds).toBe(0);
  });

  it("should handle stats for different guilds independently", async () => {
    // First guild
    mockProxyToBotApi.mockResolvedValueOnce(
      NextResponse.json({
        openCount: 5,
        avgResolutionSeconds: 1800,
        ticketsThisWeek: 10,
      })
    );

    const request1 = createMockRequest("guild1");
    const response1 = await GET(request1, { params: mockParams("guild1") });
    const body1 = await response1.json();

    expect(body1.openCount).toBe(5);

    // Second guild
    mockProxyToBotApi.mockResolvedValueOnce(
      NextResponse.json({
        openCount: 0,
        avgResolutionSeconds: 0,
        ticketsThisWeek: 0,
      })
    );

    const request2 = createMockRequest("guild2");
    const response2 = await GET(request2, { params: mockParams("guild2") });
    const body2 = await response2.json();

    expect(body2.openCount).toBe(0);
  });

  // ─── Boundary values ─────────────────────────────────────────

  it("should handle maximum safe integer values", async () => {
    const mockStats = {
      openCount: Number.MAX_SAFE_INTEGER,
      avgResolutionSeconds: Number.MAX_SAFE_INTEGER,
      ticketsThisWeek: Number.MAX_SAFE_INTEGER,
    };

    mockProxyToBotApi.mockResolvedValue(NextResponse.json(mockStats));

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.openCount).toBe(Number.MAX_SAFE_INTEGER);
  });
});