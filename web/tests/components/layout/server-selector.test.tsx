import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/image
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    <img alt={alt} {...props} />
  ),
}));

const mockBroadcastSelectedGuild = vi.fn();
vi.mock("@/lib/guild-selection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/guild-selection")>(
    "@/lib/guild-selection",
  );
  return {
    ...actual,
    broadcastSelectedGuild: (...args: unknown[]) =>
      mockBroadcastSelectedGuild(...args),
  };
});

import { ServerSelector } from "@/components/layout/server-selector";
import { SELECTED_GUILD_KEY } from "@/lib/guild-selection";

describe("ServerSelector", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    mockBroadcastSelectedGuild.mockReset();
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

  it("shows no mutual servers message when empty", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("No mutual servers")).toBeInTheDocument();
      expect(
        screen.getByText(/Bill Bot isn't in any of your Discord servers/),
      ).toBeInTheDocument();
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

  it("does not rebroadcast restored guild selection from localStorage", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "1");

    const guilds = [
      {
        id: "1",
        name: "Restored Server",
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
      expect(screen.getByText("Restored Server")).toBeInTheDocument();
    });

    expect(mockBroadcastSelectedGuild).not.toHaveBeenCalled();
  });

  it("broadcasts selected guild when defaulting to first guild", async () => {
    const guilds = [
      {
        id: "1",
        name: "Default Server",
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
      expect(screen.getByText("Default Server")).toBeInTheDocument();
    });

    expect(mockBroadcastSelectedGuild).toHaveBeenCalledWith("1");
  });

  it("does nothing when clicking the currently selected guild", async () => {
    const user = userEvent.setup();
    const guilds = [
      {
        id: "1",
        name: "Default Server",
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
      expect(screen.getByText("Default Server")).toBeInTheDocument();
    });

    expect(mockBroadcastSelectedGuild).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: /Default Server/i }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Default Server" }),
    );

    expect(mockBroadcastSelectedGuild).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
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
