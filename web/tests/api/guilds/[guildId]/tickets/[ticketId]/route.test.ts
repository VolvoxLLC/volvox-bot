/**
 * Tests for web/src/app/api/guilds/[guildId]/tickets/[ticketId]/route.ts
 * Covers GET endpoint for fetching a specific ticket with transcript
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

import { GET } from "@/app/api/guilds/[guildId]/tickets/[ticketId]/route";

function createMockRequest(guildId: string, ticketId: string): NextRequest {
  const url = `http://localhost:3000/api/guilds/${guildId}/tickets/${ticketId}`;
  return new NextRequest(new URL(url));
}

async function mockParams(guildId: string, ticketId: string) {
  return { guildId, ticketId };
}

describe("GET /api/guilds/:guildId/tickets/:ticketId", () => {
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

    // Default successful proxy
    mockProxyToBotApi.mockResolvedValue(
      NextResponse.json({
        id: 1,
        guild_id: "guild1",
        user_id: "user1",
        topic: "Need help",
        status: "open",
        thread_id: "thread1",
        created_at: "2024-01-01T00:00:00Z",
        transcript: null,
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Validation ──────────────────────────────────────────────

  it("should return 400 when guildId is missing", async () => {
    const request = createMockRequest("", "1");
    const response = await GET(request, { params: mockParams("", "1") });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing guildId or ticketId");
  });

  it("should return 400 when ticketId is missing", async () => {
    const request = createMockRequest("guild1", "");
    const response = await GET(request, { params: mockParams("guild1", "") });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing guildId or ticketId");
  });

  it("should return 400 when both IDs are missing", async () => {
    const request = createMockRequest("", "");
    const response = await GET(request, { params: mockParams("", "") });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing guildId or ticketId");
  });

  // ─── Auth & Config ───────────────────────────────────────────

  it("should return error when authorization fails", async () => {
    const authError = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    mockAuthorizeGuildAdmin.mockResolvedValue(authError);

    const request = createMockRequest("guild1", "1");
    const response = await GET(request, { params: mockParams("guild1", "1") });

    expect(response).toBe(authError);
    expect(mockAuthorizeGuildAdmin).toHaveBeenCalledWith(
      request,
      "guild1",
      "[api/guilds/:guildId/tickets/:ticketId]"
    );
  });

  it("should return error when bot API config is invalid", async () => {
    const configError = NextResponse.json(
      { error: "Bot API not configured" },
      { status: 500 }
    );
    mockGetBotApiConfig.mockReturnValue(configError);

    const request = createMockRequest("guild1", "1");
    const response = await GET(request, { params: mockParams("guild1", "1") });

    expect(response).toBe(configError);
  });

  it("should return error when upstream URL build fails", async () => {
    const urlError = NextResponse.json({ error: "Invalid URL" }, { status: 500 });
    mockBuildUpstreamUrl.mockReturnValue(urlError);

    const request = createMockRequest("guild1", "1");
    const response = await GET(request, { params: mockParams("guild1", "1") });

    expect(response).toBe(urlError);
  });

  // ─── Successful requests ─────────────────────────────────────

  it("should fetch ticket detail successfully", async () => {
    const mockTicket = {
      id: 1,
      guild_id: "guild1",
      user_id: "user1",
      topic: "Bug report",
      status: "closed",
      thread_id: "thread1",
      channel_id: "channel1",
      closed_by: "staff1",
      close_reason: "Resolved",
      created_at: "2024-01-01T00:00:00Z",
      closed_at: "2024-01-01T01:00:00Z",
      transcript: [
        { author: "User#1234", content: "I found a bug", timestamp: "2024-01-01T00:00:00Z" },
        { author: "Staff#5678", content: "Thanks, fixed!", timestamp: "2024-01-01T00:30:00Z" },
      ],
    };

    mockProxyToBotApi.mockResolvedValue(NextResponse.json(mockTicket));

    const request = createMockRequest("guild1", "1");
    const response = await GET(request, { params: mockParams("guild1", "1") });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(1);
    expect(body.transcript).toHaveLength(2);
    expect(body.closed_by).toBe("staff1");
  });

  it("should build correct upstream URL", async () => {
    const request = createMockRequest("guild1", "42");
    await GET(request, { params: mockParams("guild1", "42") });

    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1",
      "/guilds/guild1/tickets/42",
      "[api/guilds/:guildId/tickets/:ticketId]"
    );
  });

  it("should call proxyToBotApi with correct parameters", async () => {
    const upstreamUrl = new URL("http://localhost:3001/api/v1/guilds/guild1/tickets/1");
    mockBuildUpstreamUrl.mockReturnValue(upstreamUrl);

    const request = createMockRequest("guild1", "1");
    await GET(request, { params: mockParams("guild1", "1") });

    expect(mockProxyToBotApi).toHaveBeenCalledWith(
      upstreamUrl,
      "test-secret",
      "[api/guilds/:guildId/tickets/:ticketId]",
      "Failed to fetch ticket"
    );
  });

  // ─── URL encoding ────────────────────────────────────────────

  it("should properly encode guild ID in URL", async () => {
    const guildIdWithSpecialChars = "guild/special";
    const request = createMockRequest(guildIdWithSpecialChars, "1");
    await GET(request, { params: mockParams(guildIdWithSpecialChars, "1") });

    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      expect.any(String),
      "/guilds/guild%2Fspecial/tickets/1",
      expect.any(String)
    );
  });

  it("should properly encode ticket ID in URL", async () => {
    const ticketIdWithSpecialChars = "ticket#1";
    const request = createMockRequest("guild1", ticketIdWithSpecialChars);
    await GET(request, { params: mockParams("guild1", ticketIdWithSpecialChars) });

    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      expect.any(String),
      "/guilds/guild1/tickets/ticket%231",
      expect.any(String)
    );
  });

  // ─── Error responses ─────────────────────────────────────────

  it("should handle 404 from upstream", async () => {
    mockProxyToBotApi.mockResolvedValue(
      NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    );

    const request = createMockRequest("guild1", "999");
    const response = await GET(request, { params: mockParams("guild1", "999") });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Ticket not found");
  });

  it("should handle 500 from upstream", async () => {
    mockProxyToBotApi.mockResolvedValue(
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );

    const request = createMockRequest("guild1", "1");
    const response = await GET(request, { params: mockParams("guild1", "1") });

    expect(response.status).toBe(500);
  });

  // ─── Open tickets ────────────────────────────────────────────

  it("should fetch open ticket without transcript", async () => {
    const mockTicket = {
      id: 2,
      guild_id: "guild1",
      user_id: "user2",
      topic: "Question",
      status: "open",
      thread_id: "thread2",
      channel_id: "channel2",
      closed_by: null,
      close_reason: null,
      created_at: "2024-01-02T00:00:00Z",
      closed_at: null,
      transcript: null,
    };

    mockProxyToBotApi.mockResolvedValue(NextResponse.json(mockTicket));

    const request = createMockRequest("guild1", "2");
    const response = await GET(request, { params: mockParams("guild1", "2") });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("open");
    expect(body.transcript).toBeNull();
    expect(body.closed_at).toBeNull();
  });

  // ─── Edge cases ──────────────────────────────────────────────

  it("should handle numeric ticket IDs", async () => {
    const request = createMockRequest("guild1", "123");
    await GET(request, { params: mockParams("guild1", "123") });

    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      expect.any(String),
      "/guilds/guild1/tickets/123",
      expect.any(String)
    );
  });

  it("should handle very large ticket IDs", async () => {
    const largeId = "99999999999999";
    const request = createMockRequest("guild1", largeId);
    await GET(request, { params: mockParams("guild1", largeId) });

    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      expect.any(String),
      `/guilds/guild1/tickets/${largeId}`,
      expect.any(String)
    );
  });
});