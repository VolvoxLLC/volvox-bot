import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next-auth/react
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
let mockSession: { data: unknown; status: string } = { data: null, status: "unauthenticated" };
vi.mock("next-auth/react", () => ({
  useSession: () => mockSession,
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

// Mock next/navigation
let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

import LoginPage from "@/app/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockSignIn.mockClear();
    mockSignOut.mockClear();
    mockPush.mockClear();
    mockSession = { data: null, status: "unauthenticated" };
  });

  it("renders the sign-in card", async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByText("Welcome to Bill Bot")).toBeInTheDocument();
    });
    expect(screen.getByText("Sign in with Discord")).toBeInTheDocument();
  });

  it("calls signIn with /dashboard when no callbackUrl param", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByText("Sign in with Discord")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Sign in with Discord"));
    expect(mockSignIn).toHaveBeenCalledWith("discord", {
      callbackUrl: "/dashboard",
    });
  });

  it("calls signIn with callbackUrl from search params", async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams("callbackUrl=/servers/123");
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByText("Sign in with Discord")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Sign in with Discord"));
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
      ).toBeInTheDocument();
    });
  });

  it("shows login form without calling signOut on RefreshTokenError", async () => {
    mockSession = {
      data: { user: { name: "Test" }, error: "RefreshTokenError" },
      status: "authenticated",
    };
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByText("Sign in with Discord")).toBeInTheDocument();
    });
    // Should NOT redirect to dashboard
    expect(mockPush).not.toHaveBeenCalled();
    // LoginForm no longer calls signOut — Header handles it centrally
    expect(mockSignOut).not.toHaveBeenCalled();
    // Should show the login form (not the loading spinner)
    expect(screen.getByText("Welcome to Bill Bot")).toBeInTheDocument();
  });

  it("redirects authenticated users instead of showing login form", async () => {
    mockSession = {
      data: { user: { name: "Test", email: "test@test.com" } },
      status: "authenticated",
    };
    render(<LoginPage />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
    // Should show loading state, not the login form
    expect(screen.queryByText("Welcome to Bill Bot")).not.toBeInTheDocument();
  });
});
