import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the next-auth/providers/discord module
vi.mock("next-auth/providers/discord", () => ({
  default: vi.fn((config: Record<string, unknown>) => ({
    id: "discord",
    name: "Discord",
    type: "oauth",
    ...config,
  })),
}));

describe("authOptions", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DISCORD_CLIENT_ID = "test-client-id";
    process.env.DISCORD_CLIENT_SECRET = "test-client-secret";
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  it("has discord provider configured", async () => {
    const { authOptions } = await import("@/lib/auth");
    expect(authOptions.providers).toHaveLength(1);
    expect(authOptions.providers[0]).toMatchObject({
      id: "discord",
    });
  });

  it("uses JWT session strategy", async () => {
    const { authOptions } = await import("@/lib/auth");
    expect(authOptions.session?.strategy).toBe("jwt");
  });

  it("sets custom sign-in page to /login", async () => {
    const { authOptions } = await import("@/lib/auth");
    expect(authOptions.pages?.signIn).toBe("/login");
  });

  it("sets session max age to 7 days", async () => {
    const { authOptions } = await import("@/lib/auth");
    expect(authOptions.session?.maxAge).toBe(7 * 24 * 60 * 60);
  });

  it("jwt callback persists access token on sign-in", async () => {
    const { authOptions } = await import("@/lib/auth");
    const jwtCallback = authOptions.callbacks?.jwt;
    expect(jwtCallback).toBeDefined();

    if (jwtCallback) {
      const result = await jwtCallback({
        token: { sub: "123" },
        account: {
          access_token: "discord-access-token",
          refresh_token: "discord-refresh-token",
          expires_at: 1700000000,
          provider: "discord",
          type: "oauth",
          providerAccountId: "discord-user-123",
        },
        user: { id: "123", name: "Test", email: "test@test.com" },
        trigger: "signIn",
      } as Parameters<NonNullable<typeof jwtCallback>>[0]);

      expect(result.accessToken).toBe("discord-access-token");
      expect(result.refreshToken).toBe("discord-refresh-token");
      expect(result.id).toBe("discord-user-123");
    }
  });

  it("jwt callback returns existing token when no account", async () => {
    const { authOptions } = await import("@/lib/auth");
    const jwtCallback = authOptions.callbacks?.jwt;
    expect(jwtCallback).toBeDefined();

    if (jwtCallback) {
      const existingToken = {
        sub: "123",
        accessToken: "existing-token",
        id: "user-123",
      };

      const result = await jwtCallback({
        token: existingToken,
        user: { id: "123", name: "Test", email: "test@test.com" },
        trigger: "update",
      } as Parameters<NonNullable<typeof jwtCallback>>[0]);

      expect(result.accessToken).toBe("existing-token");
      expect(result.id).toBe("user-123");
    }
  });

  it("session callback exposes access token and user id", async () => {
    const { authOptions } = await import("@/lib/auth");
    const sessionCallback = authOptions.callbacks?.session;
    expect(sessionCallback).toBeDefined();

    if (sessionCallback) {
      const result = await sessionCallback({
        session: {
          user: { name: "Test", email: "test@test.com", image: null },
          expires: "2099-01-01",
        },
        token: {
          sub: "123",
          accessToken: "discord-access-token",
          id: "discord-user-123",
        },
      } as Parameters<NonNullable<typeof sessionCallback>>[0]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).accessToken).toBe("discord-access-token");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).user.id).toBe("discord-user-123");
    }
  });
});
