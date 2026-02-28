import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
    process.env.NEXTAUTH_SECRET = "a-valid-secret-that-is-at-least-32-characters-long";
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
    if (!jwtCallback) return;

    const result = await jwtCallback({
      token: { sub: "123" },
      account: {
        access_token: "discord-access-token",
        refresh_token: "discord-refresh-token",
        expires_at: 1700000000,
        provider: "discord",
        type: "oauth",
        providerAccountId: "discord-user-123",
        token_type: "Bearer",
      },
      user: { id: "123", name: "Test", email: "test@test.com" },
      trigger: "signIn",
    } as Parameters<NonNullable<typeof jwtCallback>>[0]);

    expect(result.accessToken).toBe("discord-access-token");
    expect(result.refreshToken).toBe("discord-refresh-token");
    expect(result.id).toBe("discord-user-123");
  });

  it("jwt callback returns existing token when no account", async () => {
    const { authOptions } = await import("@/lib/auth");
    const jwtCallback = authOptions.callbacks?.jwt;
    expect(jwtCallback).toBeDefined();
    if (!jwtCallback) return;

    const existingToken = {
      sub: "123",
      accessToken: "existing-token",
      accessTokenExpires: Date.now() + 60_000, // not expired
      id: "user-123",
    };

    const result = await jwtCallback({
      token: existingToken,
      user: { id: "123", name: "Test", email: "test@test.com" },
      trigger: "update",
    } as Parameters<NonNullable<typeof jwtCallback>>[0]);

    expect(result.accessToken).toBe("existing-token");
    expect(result.id).toBe("user-123");
  });

  it("session callback exposes user id but NOT access token", async () => {
    const { authOptions } = await import("@/lib/auth");
    const sessionCallback = authOptions.callbacks?.session;
    expect(sessionCallback).toBeDefined();
    if (!sessionCallback) return;

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

    // Access token should NOT be exposed to client session
    expect((result as unknown as Record<string, unknown>).accessToken).toBeUndefined();
    // User id should be exposed
    expect((result as unknown as { user: { id: string } }).user.id).toBe("discord-user-123");
  });

  it("session callback propagates RefreshTokenError", async () => {
    const { authOptions } = await import("@/lib/auth");
    const sessionCallback = authOptions.callbacks?.session;
    expect(sessionCallback).toBeDefined();
    if (!sessionCallback) return;

    const result = await sessionCallback({
      session: {
        user: { name: "Test", email: "test@test.com", image: null },
        expires: "2099-01-01",
      },
      token: {
        sub: "123",
        id: "discord-user-123",
        error: "RefreshTokenError",
      },
    } as Parameters<NonNullable<typeof sessionCallback>>[0]);

    expect((result as unknown as Record<string, unknown>).error).toBe("RefreshTokenError");
  });

  it("rejects default NEXTAUTH_SECRET placeholder", async () => {
    vi.resetModules();
    process.env.NEXTAUTH_SECRET = "change-me-in-production";
    const { getAuthOptions } = await import("@/lib/auth");
    expect(() => getAuthOptions()).toThrow("NEXTAUTH_SECRET");
  });

  it("rejects NEXTAUTH_SECRET shorter than 32 chars", async () => {
    vi.resetModules();
    process.env.NEXTAUTH_SECRET = "too-short";
    const { getAuthOptions } = await import("@/lib/auth");
    expect(() => getAuthOptions()).toThrow("NEXTAUTH_SECRET");
  });

  it("rejects the new CHANGE_ME placeholder in NEXTAUTH_SECRET", async () => {
    vi.resetModules();
    process.env.NEXTAUTH_SECRET = "CHANGE_ME_generate_with_openssl_rand_base64_32";
    const { getAuthOptions } = await import("@/lib/auth");
    expect(() => getAuthOptions()).toThrow("NEXTAUTH_SECRET");
  });

  it("rejects missing DISCORD_CLIENT_ID", async () => {
    vi.resetModules();
    delete process.env.DISCORD_CLIENT_ID;
    process.env.DISCORD_CLIENT_SECRET = "test-client-secret";
    process.env.NEXTAUTH_SECRET = "a-valid-secret-that-is-at-least-32-characters-long";
    const { getAuthOptions } = await import("@/lib/auth");
    expect(() => getAuthOptions()).toThrow("DISCORD_CLIENT_ID");
  });

  it("rejects missing DISCORD_CLIENT_SECRET", async () => {
    vi.resetModules();
    process.env.DISCORD_CLIENT_ID = "test-client-id";
    delete process.env.DISCORD_CLIENT_SECRET;
    process.env.NEXTAUTH_SECRET = "a-valid-secret-that-is-at-least-32-characters-long";
    const { getAuthOptions } = await import("@/lib/auth");
    expect(() => getAuthOptions()).toThrow("DISCORD_CLIENT_SECRET");
  });
});

describe("refreshDiscordToken", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    process.env.DISCORD_CLIENT_ID = "test-client-id";
    process.env.DISCORD_CLIENT_SECRET = "test-client-secret";
    process.env.NEXTAUTH_SECRET = "a-valid-secret-that-is-at-least-32-characters-long";
    fetchSpy = vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns refreshed token on success", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "new-access-token",
          expires_in: 604800,
          refresh_token: "new-refresh-token",
        }),
    } as Response);

    const { refreshDiscordToken } = await import("@/lib/auth");
    const result = await refreshDiscordToken({
      accessToken: "old-token",
      refreshToken: "old-refresh",
    });

    expect(result.accessToken).toBe("new-access-token");
    expect(result.refreshToken).toBe("new-refresh-token");
    expect(result.error).toBeUndefined();
    expect(typeof result.accessTokenExpires).toBe("number");
  });

  it("returns RefreshTokenError on failure", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as Response);

    const { refreshDiscordToken } = await import("@/lib/auth");
    const result = await refreshDiscordToken({
      accessToken: "old-token",
      refreshToken: "old-refresh",
    });

    expect(result.error).toBe("RefreshTokenError");
    expect(result.accessToken).toBe("old-token");
  });

  it("handles token rotation — keeps original refresh token if not rotated", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "new-access-token",
          expires_in: 604800,
          // No refresh_token in response — Discord didn't rotate
        }),
    } as Response);

    const { refreshDiscordToken } = await import("@/lib/auth");
    const result = await refreshDiscordToken({
      accessToken: "old-token",
      refreshToken: "original-refresh-token",
    });

    expect(result.accessToken).toBe("new-access-token");
    expect(result.refreshToken).toBe("original-refresh-token");
  });

  it("returns RefreshTokenError on network failure", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

    const { refreshDiscordToken } = await import("@/lib/auth");
    const result = await refreshDiscordToken({
      accessToken: "old-token",
      refreshToken: "old-refresh",
    });

    expect(result.error).toBe("RefreshTokenError");
    expect(result.accessToken).toBe("old-token");
  });

  it("returns RefreshTokenError when Discord returns non-JSON response", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    } as unknown as Response);

    const { refreshDiscordToken } = await import("@/lib/auth");
    const result = await refreshDiscordToken({
      accessToken: "old-token",
      refreshToken: "old-refresh",
    });

    expect(result.error).toBe("RefreshTokenError");
    expect(result.accessToken).toBe("old-token");
  });

  it("returns RefreshTokenError when env validation fails", async () => {
    vi.resetModules();
    process.env.DISCORD_CLIENT_ID = "test-client-id";
    process.env.DISCORD_CLIENT_SECRET = "test-client-secret";
    process.env.NEXTAUTH_SECRET = "too-short";

    const { refreshDiscordToken } = await import("@/lib/auth");
    const result = await refreshDiscordToken({
      accessToken: "old-token",
      refreshToken: "old-refresh",
    });

    expect(result.error).toBe("RefreshTokenError");
    expect(result.accessToken).toBe("old-token");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("jwt callback skips refresh when no refresh token exists", async () => {
    const { authOptions } = await import("@/lib/auth");
    const jwtCallback = authOptions.callbacks?.jwt;
    expect(jwtCallback).toBeDefined();
    if (!jwtCallback) return;

    const expiredToken = {
      sub: "123",
      accessToken: "expired-token",
      accessTokenExpires: Date.now() - 60_000, // expired
      id: "user-123",
      // No refreshToken
    };

    const result = await jwtCallback({
      token: expiredToken,
      user: { id: "123", name: "Test", email: "test@test.com" },
      trigger: "update",
    } as Parameters<NonNullable<typeof jwtCallback>>[0]);

    // Should return the token as-is without attempting refresh
    expect(result.accessToken).toBe("expired-token");
  });
});
