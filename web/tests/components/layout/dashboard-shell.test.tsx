import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock child components
vi.mock("@/components/layout/header", () => ({
  Header: ({ onMenuClick }: { onMenuClick: () => void }) => (
    <header data-testid="header">
      <button onClick={onMenuClick} data-testid="menu-btn">
        Menu
      </button>
    </header>
  ),
}));

vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: ({ onNavClick }: { onNavClick?: () => void }) => (
    <nav data-testid="sidebar" onClick={onNavClick}>
      Sidebar
    </nav>
  ),
}));

vi.mock("@/components/layout/server-selector", () => ({
  ServerSelector: () => <div data-testid="server-selector">Servers</div>,
}));

// Mock radix dialog for Sheet
vi.mock("@radix-ui/react-dialog", () => {
  const React = require("react");
  return {
    Root: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
      <div data-testid="sheet-root" data-open={open}>
        {children}
      </div>
    ),
    Trigger: ({ children }: { children: React.ReactNode }) => children,
    Portal: ({ children }: { children: React.ReactNode }) => children,
    Overlay: React.forwardRef((_: unknown, ref: React.Ref<HTMLDivElement>) => (
      <div ref={ref} data-testid="sheet-overlay" />
    )),
    Content: React.forwardRef(
      ({ children }: { children: React.ReactNode }, ref: React.Ref<HTMLDivElement>) => (
        <div ref={ref} data-testid="sheet-content">
          {children}
        </div>
      ),
    ),
    Close: React.forwardRef(
      ({ children }: { children: React.ReactNode }, ref: React.Ref<HTMLButtonElement>) => (
        <button ref={ref} data-testid="sheet-close">
          {children}
        </button>
      ),
    ),
    Title: React.forwardRef(
      ({ children }: { children: React.ReactNode }, ref: React.Ref<HTMLHeadingElement>) => (
        <h2 ref={ref}>{children}</h2>
      ),
    ),
  };
});

import { DashboardShell } from "@/components/layout/dashboard-shell";

describe("DashboardShell", () => {
  it("renders header, sidebar, and content", () => {
    render(
      <DashboardShell>
        <div data-testid="content">Content</div>
      </DashboardShell>,
    );
    expect(screen.getByTestId("header")).toBeDefined();
    expect(screen.getAllByTestId("sidebar").length).toBeGreaterThan(0);
    expect(screen.getByTestId("content")).toBeDefined();
  });

  it("renders server selector in desktop sidebar", () => {
    render(
      <DashboardShell>
        <div>Content</div>
      </DashboardShell>,
    );
    expect(screen.getAllByTestId("server-selector").length).toBeGreaterThan(0);
  });
});
