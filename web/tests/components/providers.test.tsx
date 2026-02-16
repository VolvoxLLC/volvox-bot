import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next-auth/react
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  ),
}));

import { Providers } from "@/components/providers";

describe("Providers", () => {
  it("wraps children in SessionProvider", () => {
    render(
      <Providers>
        <div data-testid="child">Hello</div>
      </Providers>,
    );
    expect(screen.getByTestId("session-provider")).toBeDefined();
    expect(screen.getByTestId("child")).toBeDefined();
  });
});
