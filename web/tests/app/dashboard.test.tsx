import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/layout/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-shell">{children}</div>
  ),
}));

import DashboardPage from "@/app/dashboard/page";
import DashboardLayout from "@/app/dashboard/layout";

describe("DashboardPage", () => {
  it("renders the dashboard heading", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(
      screen.getByText("Overview of your Bill Bot server."),
    ).toBeDefined();
  });

  it("renders stat cards", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Total server members")).toBeDefined();
    expect(screen.getByText("Total moderation actions")).toBeDefined();
    expect(screen.getByText("AI messages this week")).toBeDefined();
    expect(screen.getByText("Bot uptime")).toBeDefined();
  });

  it("renders getting started card", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Getting Started")).toBeDefined();
  });
});

describe("DashboardLayout", () => {
  it("wraps children in DashboardShell", () => {
    render(
      <DashboardLayout>
        <div data-testid="child">Child</div>
      </DashboardLayout>,
    );
    expect(screen.getByTestId("dashboard-shell")).toBeDefined();
    expect(screen.getByTestId("child")).toBeDefined();
  });
});
