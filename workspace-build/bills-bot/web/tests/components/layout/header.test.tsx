import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Hoist mock variables so they can be mutated per-test
const mockUseSession = vi.fn<() => { data: unknown; status: string }>();
const mockSignOut = vi.fn();

// Mock next-auth/react
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

// Mock the MobileSidebar client component
vi.mock("@/components/layout/mobile-sidebar", () => ({
  MobileSidebar: () => (
    <button data-testid="mobile-sidebar-toggle" aria-label="Toggle menu">
      Menu
    </button>
  ),
}));

import { Header } from "@/components/layout/header";

const authenticatedSession = {
  data: {
    user: {
      id: "discord-user-123",
      name: "TestUser",
      email: "test@example.com",
      image: "https://cdn.discordapp.com/avatars/123/abc.png",
    },
  },
  status: "authenticated",
};

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue(authenticatedSession);
  });

  it("renders the brand name", () => {
    render(<Header />);
    expect(screen.getByText("Bill Bot Dashboard")).toBeInTheDocument();
  });

  it("renders the mobile sidebar toggle", () => {
    render(<Header />);
    expect(screen.getByTestId("mobile-sidebar-toggle")).toBeInTheDocument();
  });

  it("renders user fallback avatar when authenticated", () => {
    render(<Header />);
    // Radix Avatar shows fallback initially in jsdom
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  describe("loading state", () => {
    it("renders a loading skeleton when session is loading", () => {
      mockUseSession.mockReturnValue({ data: null, status: "loading" });
      render(<Header />);
      expect(screen.getByTestId("header-skeleton")).toBeInTheDocument();
      // No user dropdown should appear
      expect(screen.queryByText("T")).not.toBeInTheDocument();
      expect(screen.queryByText("TestUser")).not.toBeInTheDocument();
    });
  });

  describe("unauthenticated state", () => {
    it("renders a sign-in link when unauthenticated", () => {
      mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
      render(<Header />);
      const signInLink = screen.getByRole("link", { name: "Sign in" });
      expect(signInLink).toBeInTheDocument();
      expect(signInLink).toHaveAttribute("href", "/login");
      // User-specific elements should not be present
      expect(screen.queryByText("T")).not.toBeInTheDocument();
    });
  });

  describe("RefreshTokenError", () => {
    it("calls signOut when session has RefreshTokenError", () => {
      mockUseSession.mockReturnValue({
        data: {
          user: { id: "123", name: "TestUser" },
          error: "RefreshTokenError",
        },
        status: "authenticated",
      });

      render(<Header />);

      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
    });

    it("does not call signOut when session has no error", () => {
      render(<Header />);
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe("user dropdown interactions", () => {
    it("opens dropdown menu when avatar is clicked", async () => {
      const user = userEvent.setup();
      render(<Header />);

      // The avatar button's accessible name comes from the AvatarFallback text "T"
      const avatarButton = screen.getByRole("button", { name: "T" });
      await user.click(avatarButton);

      // Dropdown content should now be visible
      await waitFor(() => {
        expect(screen.getByText("TestUser")).toBeInTheDocument();
      });
      expect(screen.getByText("Documentation")).toBeInTheDocument();
      expect(screen.getByText("Sign out")).toBeInTheDocument();
    });

    it("calls signOut when sign-out button is clicked", async () => {
      const user = userEvent.setup();
      render(<Header />);

      // Open dropdown
      const avatarButton = screen.getByRole("button", { name: "T" });
      await user.click(avatarButton);

      // Wait for dropdown to open, then click sign out
      await waitFor(() => {
        expect(screen.getByText("Sign out")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Sign out"));

      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    });
  });
});
