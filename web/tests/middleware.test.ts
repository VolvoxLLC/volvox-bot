import { describe, it, expect } from "vitest";
import { config } from "@/proxy";

describe("proxy config", () => {
  it("protects dashboard routes", () => {
    expect(config.matcher).toContain("/dashboard/:path*");
  });

  it("does not protect root or login", () => {
    // The matcher only includes dashboard routes
    expect(config.matcher).not.toContain("/");
    expect(config.matcher).not.toContain("/login");
  });
});
