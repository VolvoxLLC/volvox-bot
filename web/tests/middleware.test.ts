import { describe, it, expect, vi, beforeEach } from "vitest";
import { config, proxy } from "@/proxy";

// Mock next-auth/jwt
vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(),
}));

describe("proxy config", () => {
  it("protects dashboard routes", () => {
    expect(config.matcher).toContain("/dashboard/:path*");
  });

  it("does not protect root or login", () => {
    expect(config.matcher).not.toContain("/");
    expect(config.matcher).not.toContain("/login");
  });
});

describe("proxy function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when no token exists", async () => {
    const { getToken } = await import("next-auth/jwt");
    vi.mocked(getToken).mockResolvedValue(null);

    const mockRequest = {
      url: "http://localhost:3000/dashboard",
      nextUrl: new URL("http://localhost:3000/dashboard"),
    } as Parameters<typeof proxy>[0];

    const response = await proxy(mockRequest);

    // Should be a redirect response
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("callbackUrl=");
  });

  it("includes the original URL as callbackUrl in redirect", async () => {
    const { getToken } = await import("next-auth/jwt");
    vi.mocked(getToken).mockResolvedValue(null);

    const mockRequest = {
      url: "http://localhost:3000/dashboard/settings",
      nextUrl: new URL("http://localhost:3000/dashboard/settings"),
    } as Parameters<typeof proxy>[0];

    const response = await proxy(mockRequest);

    const location = response.headers.get("location");
    expect(location).toContain(
      encodeURIComponent("http://localhost:3000/dashboard/settings"),
    );
  });

  it("allows access when valid token exists", async () => {
    const { getToken } = await import("next-auth/jwt");
    vi.mocked(getToken).mockResolvedValue({
      sub: "123",
      accessToken: "valid-token",
      id: "user-123",
      name: "Test",
      email: "test@test.com",
      picture: null,
      iat: 0,
      exp: 0,
      jti: "",
    });

    const mockRequest = {
      url: "http://localhost:3000/dashboard",
      nextUrl: new URL("http://localhost:3000/dashboard"),
    } as Parameters<typeof proxy>[0];

    const response = await proxy(mockRequest);

    // NextResponse.next() returns a response that passes through (not a redirect)
    expect(response.status).not.toBe(307);
    expect(response.headers.get("location")).toBeNull();
  });
});
