/**
 * Tests for web/src/app/api/guilds/[guildId]/tickets/route.ts
 * Covers GET endpoint for listing tickets with pagination and filters
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

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

import { GET } from "@/app/api/guilds/[guildId]/tickets/route";
import { NextResponse } from "next/server";

function createMockRequest(
  guildId: string,
  searchParams?: Record<string, string>
): NextRequest {
  let url = `http://localhost:3000/api/guilds/${guildId}/tickets`;
  if (searchParams) {
    const params = new URLSearchParams(searchParams);
    url += `?${params.toString()}`;
  }
  return new NextRequest(new URL(url));
}

async function mockParams(guildId: string) {
  return { guildId };
}

describe("GET /api/guilds/:guildId/tickets", () => {
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
        tickets: [],
        total: 0,
        page: 1,
        limit: 25,
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Auth & Validation ───────────────────────────────────────

  it("should return 400 when guildId is missing", async () => {
    const request = createMockRequest("");
    const response = await GET(request, { params: mockParams("") });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing guildId");
  });

  it("should return error when authorization fails", async () => {
    const authError = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    mockAuthorizeGuildAdmin.mockResolvedValue(authError);

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response).toBe(authError);
    expect(mockAuthorizeGuildAdmin).toHaveBeenCalledWith(
      request,
      "guild1",
      "[api/guilds/:guildId/tickets]"
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

  it("should fetch tickets successfully", async () => {
    const mockTickets = {
      tickets: [
        {
          id: 1,
          guild_id: "guild1",
          user_id: "user1",
          topic: "Need help",
          status: "open",
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
    };

    mockProxyToBotApi.mockResolvedValue(NextResponse.json(mockTickets));

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tickets).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("should build correct upstream URL", async () => {
    const request = createMockRequest("guild1");
    await GET(request, { params: mockParams("guild1") });

    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1",
      "/guilds/guild1/tickets",
      "[api/guilds/:guildId/tickets]"
    );
  });

  it("should call proxyToBotApi with correct parameters", async () => {
    const upstreamUrl = new URL("http://localhost:3001/api/v1/guilds/guild1/tickets");
    mockBuildUpstreamUrl.mockReturnValue(upstreamUrl);

    const request = createMockRequest("guild1");
    await GET(request, { params: mockParams("guild1") });

    expect(mockProxyToBotApi).toHaveBeenCalledWith(
      upstreamUrl,
      "test-secret",
      "[api/guilds/:guildId/tickets]",
      "Failed to fetch tickets"
    );
  });

  // ─── Query parameters ────────────────────────────────────────

  it("should forward page parameter", async () => {
    const upstreamUrl = new URL("http://localhost:3001/api/v1/guilds/guild1/tickets");
    mockBuildUpstreamUrl.mockReturnValue(upstreamUrl);

    const request = createMockRequest("guild1", { page: "2" });
    await GET(request, { params: mockParams("guild1") });

    expect(mockProxyToBotApi).toHaveBeenCalled();
    const calledUrl = mockProxyToBotApi.mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get("page")).toBe("2");
  });

  it("should forward limit parameter", async () => {
    const upstreamUrl = new URL("http://localhost:3001/api/v1/guilds/guild1/tickets");
    mockBuildUpstreamUrl.mockReturnValue(upstreamUrl);

    const request = createMockRequest("guild1", { limit: "50" });
    await GET(request, { params: mockParams("guild1") });

    const calledUrl = mockProxyToBotApi.mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get("limit")).toBe("50");
  });

  it("should forward status parameter", async () => {
    const upstreamUrl = new URL("http://localhost:3001/api/v1/guilds/guild1/tickets");
    mockBuildUpstreamUrl.mockReturnValue(upstreamUrl);

    const request = createMockRequest("guild1", { status: "closed" });
    await GET(request, { params: mockParams("guild1") });

    const calledUrl = mockProxyToBotApi.mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get("status")).toBe("closed");
  });

  it("should forward user parameter", async () => {
    const upstreamUrl = new URL("http://localhost:3001/api/v1/guilds/guild1/tickets");
    mockBuildUpstreamUrl.mockReturnValue(upstreamUrl);

    const request = createMockRequest("guild1", { user: "user123" });
    await GET(request, { params: mockParams("guild1") });

    const calledUrl = mockProxyToBotApi.mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get("user")).toBe("user123");
  });

  it("should forward multiple parameters", async () => {
    const upstreamUrl = new URL("http://localhost:3001/api/v1/guilds/guild1/tickets");
    mockBuildUpstreamUrl.mockReturnValue(upstreamUrl);

    const request = createMockRequest("guild1", {
      page: "2",
      limit: "10",
      status: "open",
      user: "user456",
    });
    await GET(request, { params: mockParams("guild1") });

    const calledUrl = mockProxyToBotApi.mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get("page")).toBe("2");
    expect(calledUrl.searchParams.get("limit")).toBe("10");
    expect(calledUrl.searchParams.get("status")).toBe("open");
    expect(calledUrl.searchParams.get("user")).toBe("user456");
  });

  it("should not forward unrecognized parameters", async () => {
    const upstreamUrl = new URL("http://localhost:3001/api/v1/guilds/guild1/tickets");
    mockBuildUpstreamUrl.mockReturnValue(upstreamUrl);

    const request = createMockRequest("guild1", { invalidParam: "value" });
    await GET(request, { params: mockParams("guild1") });

    const calledUrl = mockProxyToBotApi.mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.has("invalidParam")).toBe(false);
  });

  it("should omit null parameters", async () => {
    const upstreamUrl = new URL("http://localhost:3001/api/v1/guilds/guild1/tickets");
    mockBuildUpstreamUrl.mockReturnValue(upstreamUrl);

    const request = createMockRequest("guild1");
    await GET(request, { params: mockParams("guild1") });

    const calledUrl = mockProxyToBotApi.mock.calls[0][0] as URL;
    // Only parameters explicitly set should be present
    expect(calledUrl.searchParams.toString()).toBe("");
  });

  // ─── Error handling ──────────────────────────────────────────

  it("should handle proxy errors gracefully", async () => {
    mockProxyToBotApi.mockResolvedValue(
      NextResponse.json({ error: "Upstream error" }, { status: 500 })
    );

    const request = createMockRequest("guild1");
    const response = await GET(request, { params: mockParams("guild1") });

    expect(response.status).toBe(500);
  });

  // ─── Guild ID encoding ───────────────────────────────────────

  it("should properly encode guild ID in URL", async () => {
    const guildIdWithSpecialChars = "guild/special";
    const request = createMockRequest(guildIdWithSpecialChars);
    await GET(request, { params: mockParams(guildIdWithSpecialChars) });

    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      expect.any(String),
      "/guilds/guild%2Fspecial/tickets",
      expect.any(String)
    );
  });
});