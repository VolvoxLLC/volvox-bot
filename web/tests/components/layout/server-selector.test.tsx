import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/image
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    <img alt={alt} {...props} />
  ),
}));

import { ServerSelector } from "@/components/layout/server-selector";

describe("ServerSelector", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("shows loading state initially", () => {
    fetchSpy.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ServerSelector />);
    expect(screen.getByText("Loading servers...")).toBeInTheDocument();
  });

  it("shows no servers message when empty", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("No servers found")).toBeInTheDocument();
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
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(guilds),
    } as Response);
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("Test Server")).toBeInTheDocument();
    });
  });

  it("shows error state with retry button on fetch failure", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load servers")).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  it("shows error state on non-OK response", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load servers")).toBeInTheDocument();
    });
  });

  it("re-fetches guilds when retry button is clicked", async () => {
    const user = userEvent.setup();

    // First call fails
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    // Second call succeeds
    const guilds = [
      {
        id: "1",
        name: "Recovered Server",
        icon: null,
        owner: true,
        permissions: "8",
        features: [],
        botPresent: true,
      },
    ];
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(guilds),
    } as Response);

    await user.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("Recovered Server")).toBeInTheDocument();
    });
    // Initial call + retry call
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
