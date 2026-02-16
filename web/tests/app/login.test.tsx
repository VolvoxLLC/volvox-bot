import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock next-auth/react
const mockSignIn = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

// Mock next/navigation
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

import LoginPage from "@/app/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockSignIn.mockClear();
  });

  it("renders the sign-in card", async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByText("Welcome to Bill Bot")).toBeDefined();
    });
    expect(screen.getByText("Sign in with Discord")).toBeDefined();
  });

  it("calls signIn with /dashboard when no callbackUrl param", async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByText("Sign in with Discord")).toBeDefined();
    });
    screen.getByText("Sign in with Discord").click();
    expect(mockSignIn).toHaveBeenCalledWith("discord", {
      callbackUrl: "/dashboard",
    });
  });

  it("calls signIn with callbackUrl from search params", async () => {
    mockSearchParams = new URLSearchParams("callbackUrl=/servers/123");
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByText("Sign in with Discord")).toBeDefined();
    });
    screen.getByText("Sign in with Discord").click();
    expect(mockSignIn).toHaveBeenCalledWith("discord", {
      callbackUrl: "/servers/123",
    });
  });

  it("shows privacy note", async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(
        screen.getByText(
          "We'll only access your Discord profile and server list.",
        ),
      ).toBeDefined();
    });
  });
});
