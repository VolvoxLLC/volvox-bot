import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/components/layout/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="dashboard-shell">{children}</div>
  ),
}));

import DashboardPage from "@/app/dashboard/page";
import DashboardLayout from "@/app/dashboard/layout";

describe("DashboardPage", () => {
  it("renders the dashboard heading", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(
      screen.getByText("Overview of your Bill Bot server."),
    ).toBeInTheDocument();
  });

  it("renders stat cards", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Total server members")).toBeInTheDocument();
    expect(screen.getByText("Total moderation actions")).toBeInTheDocument();
    expect(screen.getByText("AI messages this week")).toBeInTheDocument();
    expect(screen.getByText("Bot uptime")).toBeInTheDocument();
  });

  it("renders getting started card", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
  });
});

describe("DashboardLayout", () => {
  it("wraps children in DashboardShell", () => {
    render(
      <DashboardLayout>
        <div data-testid="child">Child</div>
      </DashboardLayout>,
    );
    expect(screen.getByTestId("dashboard-shell")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
