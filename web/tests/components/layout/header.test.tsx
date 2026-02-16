import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next-auth/react
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "discord-user-123",
        name: "TestUser",
        email: "test@example.com",
        image: "https://cdn.discordapp.com/avatars/123/abc.png",
      },
    },
    status: "authenticated",
  }),
  signOut: vi.fn(),
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

describe("Header", () => {
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
});
