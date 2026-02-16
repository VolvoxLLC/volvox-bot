import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next-auth/react
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        name: "TestUser",
        email: "test@example.com",
        image: "https://cdn.discordapp.com/avatars/123/abc.png",
      },
    },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

import { Header } from "@/components/layout/header";

describe("Header", () => {
  it("renders the brand name", () => {
    render(<Header onMenuClick={vi.fn()} />);
    expect(screen.getByText("Bill Bot Dashboard")).toBeDefined();
  });

  it("renders the hamburger menu button", () => {
    render(<Header onMenuClick={vi.fn()} />);
    expect(screen.getByLabelText("Toggle menu")).toBeDefined();
  });

  it("calls onMenuClick when hamburger is clicked", () => {
    const onMenuClick = vi.fn();
    render(<Header onMenuClick={onMenuClick} />);
    screen.getByLabelText("Toggle menu").click();
    expect(onMenuClick).toHaveBeenCalled();
  });

  it("renders user fallback avatar when authenticated", () => {
    render(<Header onMenuClick={vi.fn()} />);
    // Radix Avatar shows fallback initially in jsdom
    expect(screen.getByText("T")).toBeDefined();
  });
});
