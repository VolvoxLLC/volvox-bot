import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import { Sidebar } from "@/components/layout/sidebar";

describe("Sidebar", () => {
  it("renders navigation links", () => {
    render(<Sidebar />);
    expect(screen.getByText("Overview")).toBeDefined();
    expect(screen.getByText("Moderation")).toBeDefined();
    expect(screen.getByText("AI Chat")).toBeDefined();
    expect(screen.getByText("Members")).toBeDefined();
    expect(screen.getByText("Bot Config")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("highlights active route", () => {
    render(<Sidebar />);
    const overviewLink = screen.getByText("Overview").closest("a");
    expect(overviewLink?.className).toContain("bg-accent");
  });

  it("calls onNavClick when a link is clicked", () => {
    const onNavClick = vi.fn();
    render(<Sidebar onNavClick={onNavClick} />);
    screen.getByText("Moderation").click();
    expect(onNavClick).toHaveBeenCalled();
  });
});
