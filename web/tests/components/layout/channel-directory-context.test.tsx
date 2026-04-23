import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChannelDirectoryProvider,
  useGuildChannels,
} from '@/components/layout/channel-directory-context';

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

function ChannelConsumer({ guildId }: { guildId: string | null }) {
  const { channels, loading, error } = useGuildChannels(guildId);

  if (!guildId) {
    return <div>No guild</div>;
  }

  if (loading) {
    return <div>Loading channels</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  return <div>{channels.map((channel) => channel.name).join(', ')}</div>;
}

describe('ChannelDirectoryProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/dashboard/logs');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shares a single client-side channel fetch across duplicate consumers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: '2', name: 'beta', type: 0 },
        { id: '1', name: 'alpha', type: 0 },
      ],
    } as Response);

    render(
      <ChannelDirectoryProvider>
        <ChannelConsumer guildId="guild-1" />
        <ChannelConsumer guildId="guild-1" />
      </ChannelDirectoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('alpha, beta')).toHaveLength(2);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('/api/guilds/guild-1/channels', {
      signal: expect.any(AbortSignal),
      cache: 'no-store',
    });
  });

  it('resets the client cache and refetches when the dashboard route changes', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: '1', name: 'alpha', type: 0 }],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: '2', name: 'gamma', type: 0 }],
      } as Response);

    const view = render(
      <ChannelDirectoryProvider>
        <ChannelConsumer guildId="guild-1" />
      </ChannelDirectoryProvider>,
    );

    await screen.findByText('alpha');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    mockUsePathname.mockReturnValue('/dashboard/conversations');
    view.rerender(
      <ChannelDirectoryProvider>
        <ChannelConsumer guildId="guild-1" />
      </ChannelDirectoryProvider>,
    );

    await screen.findByText('gamma');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('refreshes already-loaded channel data on demand', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: '1', name: 'alpha', type: 0 }],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: '1', name: 'omega', type: 0 }],
      } as Response);

    function RefreshConsumer() {
      const { channels, refreshChannels } = useGuildChannels('guild-1');

      return (
        <div>
          <button type="button" onClick={() => void refreshChannels()}>
            Refresh
          </button>
          <span>{channels.map((channel) => channel.name).join(', ')}</span>
        </div>
      );
    }

    render(
      <ChannelDirectoryProvider>
        <RefreshConsumer />
      </ChannelDirectoryProvider>,
    );

    await screen.findByText('alpha');
    const refreshButton = await screen.findByRole('button', { name: 'Refresh' });
    refreshButton.click();

    await screen.findByText('omega');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('allows retrying after a failed fetch', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: '1', name: 'alpha', type: 0 }],
      } as Response);

    function RefreshConsumer() {
      const { channels, error, refreshChannels } = useGuildChannels('guild-1');

      return (
        <div>
          <button type="button" onClick={() => void refreshChannels()}>
            Retry
          </button>
          <span>{error ?? channels.map((channel) => channel.name).join(', ')}</span>
        </div>
      );
    }

    render(
      <ChannelDirectoryProvider>
        <RefreshConsumer />
      </ChannelDirectoryProvider>,
    );

    await screen.findByText('Failed to fetch channels: Service Unavailable');
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    const retryButton = await screen.findByRole('button', { name: 'Retry' });
    retryButton.click();

    await screen.findByText('alpha');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
