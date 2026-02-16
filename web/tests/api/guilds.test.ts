import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next-auth
vi.mock("next-auth", () => ({
  default: vi.fn(),
}));

vi.mock("next-auth/providers/discord", () => ({
  default: vi.fn((config: Record<string, unknown>) => ({
    id: "discord",
    name: "Discord",
    type: "oauth",
    ...config,
  })),
}));

// Mock getServerSession
const mockGetServerSession = vi.fn();
vi.mock("next-auth", async () => {
  return {
    default: vi.fn(),
    getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
  };
});

// Mock discord lib
const mockGetMutualGuilds = vi.fn();
vi.mock("@/lib/discord", () => ({
  getMutualGuilds: (...args: unknown[]) => mockGetMutualGuilds(...args),
}));

describe("GET /api/guilds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/guilds/route");
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when session has no access token", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: "Test" },
      // No accessToken
    });

    const { GET } = await import("@/app/api/guilds/route");
    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns guilds when authenticated", async () => {
    const mockGuilds = [
      { id: "1", name: "Server 1", icon: null, botPresent: true },
    ];

    mockGetServerSession.mockResolvedValue({
      user: { name: "Test" },
      accessToken: "valid-token",
    });
    mockGetMutualGuilds.mockResolvedValue(mockGuilds);

    const { GET } = await import("@/app/api/guilds/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(mockGuilds);
    expect(mockGetMutualGuilds).toHaveBeenCalledWith("valid-token");
  });

  it("returns 500 on discord API error", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: "Test" },
      accessToken: "valid-token",
    });
    mockGetMutualGuilds.mockRejectedValue(new Error("Discord API error"));

    const { GET } = await import("@/app/api/guilds/route");
    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Discord API error");
  });
});
