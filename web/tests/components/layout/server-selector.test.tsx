import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock next/image
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    <img alt={alt} {...props} />
  ),
}));

import { ServerSelector } from "@/components/layout/server-selector";

describe("ServerSelector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state initially", () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    render(<ServerSelector />);
    expect(screen.getByText("Loading servers...")).toBeDefined();
  });

  it("shows no servers message when empty", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("No servers found")).toBeDefined();
    });
  });

  it("renders guild name when guilds are returned", async () => {
    const guilds = [
      {
        id: "1",
        name: "Test Server",
        icon: null,
        owner: true,
        permissions: "8",
        features: [],
        botPresent: true,
      },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(guilds),
    });
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("Test Server")).toBeDefined();
    });
  });

  it("shows error state with retry button on fetch failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load servers")).toBeDefined();
      expect(screen.getByText("Retry")).toBeDefined();
    });
  });

  it("shows error state on non-OK response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load servers")).toBeDefined();
    });
  });
});
