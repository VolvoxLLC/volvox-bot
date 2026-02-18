import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// Use vi.hoisted so mocks are available inside hoisted vi.mock factories
const { mockGetServerSession, mockRedirect } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockRedirect: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  usePathname: () => "/dashboard",
}));

vi.mock("@/components/layout/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="dashboard-shell">{children}</div>
  ),
}));

vi.mock("@/components/dashboard/analytics-dashboard", () => ({
  AnalyticsDashboard: () => <div>Analytics dashboard component</div>,
}));

import DashboardPage from "@/app/dashboard/page";
import DashboardLayout from "@/app/dashboard/layout";

describe("DashboardPage", () => {
  it("renders analytics dashboard component", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Analytics dashboard component")).toBeInTheDocument();
  });
});

describe("DashboardLayout", () => {
  it("wraps children in DashboardShell when authenticated", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "123", name: "Test" },
    });

    const result = await DashboardLayout({
      children: <div data-testid="child">Child</div>,
    });
    render(result);
    expect(screen.getByTestId("dashboard-shell")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    // redirect() throws in Next.js to halt rendering — simulate that
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });

    await expect(
      DashboardLayout({
        children: <div>Child</div>,
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});
