import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import packageJson from "../package.json" with { type: "json" };

type SecurityHeader = {
  key: string;
  value: string;
};

const TELEMETRY_ENV_KEYS = ["NEXT_PUBLIC_SENTRY_DSN", "NEXT_PUBLIC_AMPLITUDE_API_KEY"] as const;
const originalTelemetryEnv = Object.fromEntries(
  TELEMETRY_ENV_KEYS.map((key) => [key, process.env[key]]),
);

async function loadNextConfig(env: Partial<Record<(typeof TELEMETRY_ENV_KEYS)[number], string>> = {}) {
  vi.resetModules();
  for (const key of TELEMETRY_ENV_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, env);

  const module = await import("../next.config.mjs");
  return module.default;
}

function restoreTelemetryEnv() {
  for (const key of TELEMETRY_ENV_KEYS) {
    const originalValue = originalTelemetryEnv[key];
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
}

function getCspDirectiveTokens(cspValue: string, directiveName: string) {
  const directive = cspValue
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${directiveName} `));

  expect(directive).toBeDefined();
  return directive!.split(/\s+/);
}

describe("next.config security headers", () => {
  let nextConfig: Awaited<ReturnType<typeof loadNextConfig>>;

  beforeEach(async () => {
    nextConfig = await loadNextConfig();
  });

  afterEach(() => {
    restoreTelemetryEnv();
  });

  it("should export a headers() function", () => {
    expect(nextConfig.headers).toBeDefined();
    expect(typeof nextConfig.headers).toBe("function");
  });

  it("should return headers for all routes", async () => {
    const headerGroups = await nextConfig.headers!();
    expect(headerGroups).toHaveLength(1);
    expect(headerGroups[0].source).toBe("/(.*)");
  });

  it("should allow 127.0.0.1 as a dev origin for HMR and MCP verification", () => {
    expect(nextConfig.allowedDevOrigins).toEqual(["127.0.0.1"]);
  });

  it("should expose the public web app version at build time", () => {
    expect(nextConfig.env?.NEXT_PUBLIC_WEB_APP_VERSION).toBe(packageJson.version);
  });

  it("should include X-Frame-Options: DENY", async () => {
    const headers = (await nextConfig.headers!())[0].headers;
    const header = headers.find((h: SecurityHeader) => h.key === "X-Frame-Options");
    expect(header).toBeDefined();
    expect(header!.value).toBe("DENY");
  });

  it("should include X-Content-Type-Options: nosniff", async () => {
    const headers = (await nextConfig.headers!())[0].headers;
    const header = headers.find((h: SecurityHeader) => h.key === "X-Content-Type-Options");
    expect(header).toBeDefined();
    expect(header!.value).toBe("nosniff");
  });

  it("should include Referrer-Policy", async () => {
    const headers = (await nextConfig.headers!())[0].headers;
    const header = headers.find((h: SecurityHeader) => h.key === "Referrer-Policy");
    expect(header).toBeDefined();
    expect(header!.value).toBe("strict-origin-when-cross-origin");
  });

  it("should include Strict-Transport-Security", async () => {
    const headers = (await nextConfig.headers!())[0].headers;
    const header = headers.find((h: SecurityHeader) => h.key === "Strict-Transport-Security");
    expect(header).toBeDefined();
    expect(header!.value).toContain("max-age=63072000");
    expect(header!.value).toContain("includeSubDomains");
    expect(header!.value).toContain("preload");
  });

  it("should include Content-Security-Policy", async () => {
    const headers = (await nextConfig.headers!())[0].headers;
    const csp = headers.find((h: SecurityHeader) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp!.value).toContain("default-src 'self'");
  });

  describe("Content-Security-Policy directives", () => {
    let cspValue: string;

    beforeEach(async () => {
      const headers = (await nextConfig.headers!())[0].headers;
      cspValue = headers.find((h: SecurityHeader) => h.key === "Content-Security-Policy")!.value;
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

    it("should include self in connect-src", () => {
      expect(getCspDirectiveTokens(cspValue, "connect-src")).toContain("'self'");
    });

    it("should omit Sentry ingest endpoints when browser error capture is disabled", () => {
      const connectSrcTokens = getCspDirectiveTokens(cspValue, "connect-src");

      expect(connectSrcTokens).not.toContain("https://*.ingest.sentry.io");
      expect(connectSrcTokens).not.toContain("https://*.ingest.us.sentry.io");
      expect(connectSrcTokens).not.toContain("https://*.ingest.eu.sentry.io");
    });

    it("should allow Sentry ingest endpoints when browser error capture is enabled", async () => {
      nextConfig = await loadNextConfig({ NEXT_PUBLIC_SENTRY_DSN: "https://key@sentry.example.com/0" });
      const headers = (await nextConfig.headers!())[0].headers;
      const enabledCspValue = headers.find(
        (h: SecurityHeader) => h.key === "Content-Security-Policy",
      )!.value;

      expect(getCspDirectiveTokens(enabledCspValue, "connect-src")).toEqual(
        expect.arrayContaining([
          "https://sentry.example.com",
          "https://*.ingest.sentry.io",
          "https://*.ingest.us.sentry.io",
          "https://*.ingest.eu.sentry.io",
        ]),
      );
    });

    it("should omit Amplitude ingest endpoints when dashboard analytics is disabled", () => {
      const connectSrcTokens = getCspDirectiveTokens(cspValue, "connect-src");

      expect(connectSrcTokens).not.toContain("https://api2.amplitude.com");
      expect(connectSrcTokens).not.toContain("https://api.eu.amplitude.com");
    });

    it("should allow Amplitude ingest endpoints when dashboard analytics is enabled", async () => {
      nextConfig = await loadNextConfig({ NEXT_PUBLIC_AMPLITUDE_API_KEY: "amplitude-key" });
      const headers = (await nextConfig.headers!())[0].headers;
      const enabledCspValue = headers.find(
        (h: SecurityHeader) => h.key === "Content-Security-Policy",
      )!.value;

      expect(getCspDirectiveTokens(enabledCspValue, "connect-src")).toEqual(
        expect.arrayContaining(["https://api2.amplitude.com", "https://api.eu.amplitude.com"]),
      );
    });

    it("should restrict font-src to self", () => {
      expect(cspValue).toContain("font-src 'self'");
    });

    it("should deny framing via frame-ancestors 'none'", () => {
      expect(cspValue).toContain("frame-ancestors 'none'");
    });
  });
});
