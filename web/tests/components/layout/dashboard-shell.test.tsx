import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock child components — DashboardShell is now a server component
vi.mock("@/components/layout/header", () => ({
  Header: () => <header data-testid="header">Header</header>,
}));

vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: () => <nav data-testid="sidebar">Sidebar</nav>,
}));

vi.mock("@/components/layout/server-selector", () => ({
  ServerSelector: () => <div data-testid="server-selector">Servers</div>,
}));

import { DashboardShell } from "@/components/layout/dashboard-shell";

describe("DashboardShell", () => {
  it("renders header, sidebar, and content", () => {
    render(
      <DashboardShell>
        <div data-testid="content">Content</div>
      </DashboardShell>,
    );
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("renders server selector in desktop sidebar", () => {
    render(
      <DashboardShell>
        <div>Content</div>
      </DashboardShell>,
    );
    expect(screen.getByTestId("server-selector")).toBeInTheDocument();
  });
});
