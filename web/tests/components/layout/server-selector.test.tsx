import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/image
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    <img alt={alt} {...props} />
  ),
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
import { GuildDirectoryProvider } from '@/components/layout/guild-directory-context';
import { SELECTED_GUILD_KEY } from '@/lib/guild-selection';

const originalAnimate = HTMLElement.prototype.animate;

function renderServerSelector() {
  return render(
    <GuildDirectoryProvider>
      <ServerSelector />
    </GuildDirectoryProvider>,
  );
}

function renderDuplicateServerSelectors() {
  return render(
    <GuildDirectoryProvider>
      <ServerSelector />
      <ServerSelector />
    </GuildDirectoryProvider>,
  );
}

describe('ServerSelector', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const originalClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;

  beforeEach(() => {
    localStorage.clear();
    mockBroadcastSelectedGuild.mockReset();
    mockPush.mockReset();
    fetchSpy = vi.spyOn(global, "fetch");
    HTMLElement.prototype.animate = vi.fn(
      () =>
        ({
          cancel: vi.fn(),
          finished: Promise.resolve(),
        }) as unknown as Animation,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (originalAnimate) {
      HTMLElement.prototype.animate = originalAnimate;
    } else {
      // @ts-expect-error jsdom does not define animate by default
      delete HTMLElement.prototype.animate;
    }
    if (originalClientId === undefined) {
      delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    } else {
      process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = originalClientId;
    }
  });

  it('shows loading state initially', () => {
    fetchSpy.mockReturnValue(new Promise(() => {})); // never resolves
    renderServerSelector();
    expect(screen.getByLabelText('Loading server selector')).toBeInTheDocument();
    expect(screen.queryByText('Infrastructure Hubs')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Bot')).not.toBeInTheDocument();
    expect(screen.queryByText('Community Hubs')).not.toBeInTheDocument();
  });

  it('shows no mutual servers message when empty', async () => {
    delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderServerSelector();
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

    renderServerSelector();

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
    renderServerSelector();
    await waitFor(() => {
      expect(screen.getByText("Test Server")).toBeInTheDocument();
    });
  });

  it('shares the guild directory fetch across multiple server selectors', async () => {
    const guilds = [
      {
        id: '1',
        name: 'Shared Server',
        icon: null,
        owner: true,
        permissions: '8',
        features: [],
        botPresent: true,
      },
    ];

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(guilds),
    } as Response);

    renderDuplicateServerSelectors();

    await waitFor(() => {
      expect(screen.getAllByText('Shared Server')).toHaveLength(2);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
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

    renderServerSelector();

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

    renderServerSelector();

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

    renderServerSelector();

    await waitFor(() => {
      expect(screen.getByText("Default Server")).toBeInTheDocument();
    });

    expect(mockBroadcastSelectedGuild).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: /Default Server/i }),
    );
    const entries = await screen.findAllByText('Default Server');
    await user.click(entries[entries.length - 1]);

    expect(mockBroadcastSelectedGuild).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('shows error state with retry button on fetch failure', async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));
    renderServerSelector();
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
    renderServerSelector();
    await waitFor(() => {
      expect(screen.getByText("Couldn't load workspaces")).toBeInTheDocument();
    });
  });

  it('re-fetches guilds when retry button is clicked', async () => {
    const user = userEvent.setup();

    // First call fails
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    renderServerSelector();
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

  it('shows community hubs when the user cannot manage any guilds', async () => {
    const guilds = [
      {
        id: 'viewer-1',
        name: 'Viewer Server',
        icon: 'a_hash',
        owner: false,
        permissions: '0',
        features: [],
        botPresent: true,
      },
    ];

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(guilds),
    } as Response);

    renderServerSelector();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Community Hubs/i })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Community Hubs/i }));

    expect(
      screen.queryByText(/Read-only spaces and servers without install access/i),
    ).not.toBeInTheDocument();

    const communityItem = await screen.findByRole('menuitem', { name: /Viewer Server/i });
    expect(communityItem).toBeInTheDocument();
    await user.click(communityItem);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledTimes(1);
    });
    expect(mockPush).toHaveBeenCalledWith('/community/viewer-1');
    expect(mockBroadcastSelectedGuild).not.toHaveBeenCalled();
  });

  it('shows add bot actions for guilds where the bot is not installed yet', async () => {
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = 'discord-client-id';
    const guilds = [
      {
        id: 'add-bot-1',
        name: 'Invite Me',
        icon: null,
        owner: false,
        permissions: '32',
        features: [],
        botPresent: false,
      },
    ];

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(guilds),
    } as Response);

    renderServerSelector();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Invite Volvox\.Bot/i })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Invite Volvox\.Bot/i }));

    const inviteMenuItem = await screen.findByRole('menuitem', { name: /Invite Me/i });
    expect(inviteMenuItem).toBeInTheDocument();
    expect(screen.getByText('Invite Bot')).toBeInTheDocument();

    await user.click(inviteMenuItem);
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledTimes(1);
    });
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('guild_id=add-bot-1'),
      '_blank',
      'noopener,noreferrer',
    );
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('disable_guild_select=true'),
      '_blank',
      'noopener,noreferrer',
    );
    expect(mockBroadcastSelectedGuild).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it('shows unknown bot status guilds in the infrastructure bucket when the user can manage them', async () => {
    const guilds = [
      {
        id: 'unknown-1',
        name: 'Unknown Status Server',
        icon: null,
        owner: false,
        permissions: '32',
        features: [],
      },
    ];

    const originalLocation = window.location;
    // @ts-expect-error -- mocking location
    delete window.location;
    // @ts-expect-error -- mocking location
    window.location = { href: '' };

    try {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(guilds),
      } as Response);

      renderServerSelector();

      await waitFor(() => {
        expect(screen.getByText('Unknown Status Server')).toBeInTheDocument();
      });

      expect(screen.getByText('1 dashboard hub • 1 status unknown')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Community Hubs/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Invite Bot/i })).not.toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(screen.getByText('Unknown Status Server'));

      const infrastructureMenuItem = screen.getByRole('menuitem', { name: /Unknown Status Server/i });
      expect(infrastructureMenuItem).toBeInTheDocument();
      expect(screen.getByText('Status unknown')).toBeInTheDocument();
      expect(screen.queryByText('Live')).not.toBeInTheDocument();
      expect(mockBroadcastSelectedGuild).toHaveBeenCalledWith('unknown-1');
      expect(window.location.href).toBe('');
    } finally {
      // @ts-expect-error -- restoring location mock
      window.location = originalLocation;
    }
  });

  it('treats explicit moderator access as manageable without discord permission bits', async () => {
    const guilds = [
      {
        id: "mod-1",
        name: "Moderator Server",
        icon: null,
        owner: false,
        permissions: "0",
        access: "moderator",
        features: [],
        botPresent: true,
      },
    ];

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(guilds),
    } as Response);

    renderServerSelector();

    await waitFor(() => {
      expect(screen.getByText("Moderator Server")).toBeInTheDocument();
    });

    expect(screen.queryByText("No manageable servers")).not.toBeInTheDocument();
    expect(mockBroadcastSelectedGuild).toHaveBeenCalledWith("mod-1");
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

    renderServerSelector();

    await waitFor(() => {
      expect(screen.getByText("Valid Server")).toBeInTheDocument();
    });
    expect(screen.queryByText("Broken Server")).not.toBeInTheDocument();
  });
});
