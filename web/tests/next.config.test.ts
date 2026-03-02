import { describe, it, expect, beforeEach } from "vitest";
import nextConfig from "../next.config";

describe("next.config security headers", () => {
  it("should export a headers() function", () => {
    expect(nextConfig.headers).toBeDefined();
    expect(typeof nextConfig.headers).toBe("function");
  });

  it("should return headers for all routes", async () => {
    const headerGroups = await nextConfig.headers!();
    expect(headerGroups).toHaveLength(1);
    expect(headerGroups[0].source).toBe("/(.*)");
  });

  it("should include X-Frame-Options: DENY", async () => {
    const headers = (await nextConfig.headers!())[0].headers;
    const header = headers.find((h) => h.key === "X-Frame-Options");
    expect(header).toBeDefined();
    expect(header!.value).toBe("DENY");
  });

  it("should include X-Content-Type-Options: nosniff", async () => {
    const headers = (await nextConfig.headers!())[0].headers;
    const header = headers.find((h) => h.key === "X-Content-Type-Options");
    expect(header).toBeDefined();
    expect(header!.value).toBe("nosniff");
  });

  it("should include Referrer-Policy", async () => {
    const headers = (await nextConfig.headers!())[0].headers;
    const header = headers.find((h) => h.key === "Referrer-Policy");
    expect(header).toBeDefined();
    expect(header!.value).toBe("strict-origin-when-cross-origin");
  });

  it("should include Strict-Transport-Security", async () => {
    const headers = (await nextConfig.headers!())[0].headers;
    const header = headers.find((h) => h.key === "Strict-Transport-Security");
    expect(header).toBeDefined();
    expect(header!.value).toContain("max-age=63072000");
    expect(header!.value).toContain("includeSubDomains");
    expect(header!.value).toContain("preload");
  });

  it("should include Content-Security-Policy", async () => {
    const headers = (await nextConfig.headers!())[0].headers;
    const csp = headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp!.value).toContain("default-src 'self'");
  });

  describe("Content-Security-Policy directives", () => {
    let cspValue: string;

    beforeEach(async () => {
      const headers = (await nextConfig.headers!())[0].headers;
      cspValue = headers.find((h) => h.key === "Content-Security-Policy")!.value;
    });

    it("should restrict default-src to self", () => {
      expect(cspValue).toContain("default-src 'self'");
    });

    it("should allow inline scripts (required for Next.js RSC streaming)", () => {
      expect(cspValue).toContain("script-src 'self' 'unsafe-inline'");
    });

    it("should allow inline styles (required for Tailwind)", () => {
      expect(cspValue).toContain("style-src 'self' 'unsafe-inline'");
    });

    it("should allow Discord CDN images", () => {
      expect(cspValue).toContain("img-src 'self' cdn.discordapp.com data:");
    });

    it("should restrict connect-src to self", () => {
      expect(cspValue).toContain("connect-src 'self'");
    });

    it("should restrict font-src to self", () => {
      expect(cspValue).toContain("font-src 'self'");
    });

    it("should deny framing via frame-ancestors 'none'", () => {
      expect(cspValue).toContain("frame-ancestors 'none'");
    });
  });
});
