import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { proxyToBotApi } from "@/lib/bot-api-proxy";

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe("proxyToBotApi", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      headers: new Headers({ "content-type": "application/json" }),
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("should not allow options.headers to override x-api-secret", async () => {
    const url = new URL("http://localhost:3001/api/v1/config");
    const serverSecret = "real-server-secret";

    await proxyToBotApi(url, serverSecret, "[test]", "error", {
      headers: {
        "x-api-secret": "injected-evil-secret",
        "content-type": "application/json",
      },
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers["x-api-secret"]).toBe(serverSecret);
    // Other headers should still pass through
    expect(headers["content-type"]).toBe("application/json");
  });

  it("should set x-api-secret even when no options.headers provided", async () => {
    const url = new URL("http://localhost:3001/api/v1/config");
    const serverSecret = "my-secret";

    await proxyToBotApi(url, serverSecret, "[test]", "error");

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers["x-api-secret"]).toBe(serverSecret);
  });
});
