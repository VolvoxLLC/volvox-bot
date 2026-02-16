import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next-auth/react
const mockSignIn = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import LoginPage from "@/app/login/page";

describe("LoginPage", () => {
  it("renders the sign-in card", () => {
    render(<LoginPage />);
    expect(screen.getByText("Welcome to Bill Bot")).toBeDefined();
    expect(screen.getByText("Sign in with Discord")).toBeDefined();
  });

  it("calls signIn when button is clicked", () => {
    render(<LoginPage />);
    screen.getByText("Sign in with Discord").click();
    expect(mockSignIn).toHaveBeenCalledWith("discord", {
      callbackUrl: "/dashboard",
    });
  });

  it("shows privacy note", () => {
    render(<LoginPage />);
    expect(
      screen.getByText(
        "We'll only access your Discord profile and server list.",
      ),
    ).toBeDefined();
  });
});
