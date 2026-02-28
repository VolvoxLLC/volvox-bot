import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogViewer } from "@/components/dashboard/log-viewer";
import type { LogEntry } from "@/lib/log-ws";

const logWithMeta: LogEntry = {
  id: "log-1",
  timestamp: "2026-01-01T12:00:00.000Z",
  level: "info",
  message: "hello world",
  module: "test",
  meta: { requestId: "abc123" },
};

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("LogViewer keyboard activation", () => {
  it("toggles once when pressing Space on metadata row button", async () => {
    const user = userEvent.setup();

    render(<LogViewer logs={[logWithMeta]} status="connected" onClear={() => {}} />);

    const rowButton = screen.getByRole("button", { expanded: false });
    rowButton.focus();

    await user.keyboard("[Space]");
    expect(rowButton).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("[Space]");
    expect(rowButton).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles once when pressing Enter on metadata row button", async () => {
    const user = userEvent.setup();

    render(<LogViewer logs={[logWithMeta]} status="connected" onClear={() => {}} />);

    const rowButton = screen.getByRole("button", { expanded: false });
    rowButton.focus();

    await user.keyboard("[Enter]");
    expect(rowButton).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("[Enter]");
    expect(rowButton).toHaveAttribute("aria-expanded", "false");
  });
});
