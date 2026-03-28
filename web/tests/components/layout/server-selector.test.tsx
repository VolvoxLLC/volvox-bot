import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

import { ServerSelector } from '@/components/layout/server-selector';
import { SELECTED_GUILD_KEY } from '@/lib/guild-selection';

describe('ServerSelector', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const originalClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;

  beforeEach(() => {
    localStorage.clear();
    mockBroadcastSelectedGuild.mockReset();
    fetchSpy = vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (originalClientId === undefined) {
      delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    } else {
      process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = originalClientId;
    }
  });

  it('shows loading state initially', () => {
    fetchSpy.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ServerSelector />);
    expect(screen.getByText('Loading workspaces...')).toBeInTheDocument();
  });

  it('shows no mutual servers message when empty', async () => {
    delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText('No shared servers yet')).toBeInTheDocument();
      expect(
        screen.getByText(/Volvox.Bot isn't in any of your Discord servers/),
      ).toBeInTheDocument();
    });
  });

  it('shows the invite button when no mutual servers and a client id exists', async () => {
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = "discord-client-id";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    render(<ServerSelector />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Invite Volvox\.Bot/i })).toHaveAttribute(
        "href",
        expect.stringContaining("client_id=discord-client-id"),
      );
    });
  });

  it('renders guild name when guilds are returned', async () => {
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

  it('does not rebroadcast restored guild selection from localStorage', async () => {
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

  it('broadcasts selected guild when defaulting to first guild', async () => {
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

  it('does nothing when clicking the currently selected guild', async () => {
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

  it('shows error state with retry button on fetch failure', async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't load workspaces")).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('shows error state on non-OK response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    render(<ServerSelector />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't load workspaces")).toBeInTheDocument();
    });
  });

  it('re-fetches guilds when retry button is clicked', async () => {
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

  it('shows member-only servers when the user cannot manage any guilds', async () => {
    const guilds = [
      {
        id: "viewer-1",
        name: "Viewer Server",
        icon: "a_hash",
        owner: false,
        permissions: "0",
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
      expect(screen.getByText("No manageable servers")).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByRole("button", { name: /No manageable servers/i }));

    expect(screen.getByText(/You need mod or admin permissions/i)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Viewer Server/i })).toHaveAttribute(
      "href",
      "/community/viewer-1",
    );
    expect(screen.getByAltText("Viewer Server")).toHaveAttribute(
      "src",
      expect.stringContaining("/icons/viewer-1/a_hash.gif"),
    );
    expect(mockBroadcastSelectedGuild).not.toHaveBeenCalled();
  });

  it('ignores invalid guild records from the api response', async () => {
    const guilds = [
      {
        id: "valid-1",
        name: "Valid Server",
        icon: null,
        owner: true,
        permissions: "8",
        features: [],
        botPresent: true,
      },
      {
        id: "broken-1",
        name: "Broken Server",
        owner: "yes",
        permissions: "8",
      },
    ];

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(guilds),
    } as Response);

    render(<ServerSelector />);

    await waitFor(() => {
      expect(screen.getByText("Valid Server")).toBeInTheDocument();
    });
    expect(screen.queryByText("Broken Server")).not.toBeInTheDocument();
  });
});
