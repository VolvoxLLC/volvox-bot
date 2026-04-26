import { afterEach, describe, expect, it, vi } from "vitest";

describe("WEB_APP_VERSION", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the injected public version when configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_VERSION", "9.9.9");

    const { WEB_APP_VERSION } = await import("../../src/lib/app-version");

    expect(WEB_APP_VERSION).toBe("9.9.9");
  });

  it("falls back to 0.0.0 when the public version is missing", async () => {
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_WEB_APP_VERSION;

    const { WEB_APP_VERSION } = await import("../../src/lib/app-version");

    expect(WEB_APP_VERSION).toBe("0.0.0");
  });
});
