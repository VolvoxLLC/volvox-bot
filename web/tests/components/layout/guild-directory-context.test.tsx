import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GuildDirectoryProvider,
  useGuildDirectory,
} from '@/components/layout/guild-directory-context';

function GuildDirectoryConsumer() {
  const { error, guilds, loading, refreshGuilds } = useGuildDirectory();

  return (
    <div>
      <div data-testid="guild-directory-status">
        {loading ? 'loading' : 'idle'}:{error ? 'error' : 'ok'}:
        {guilds.map((guild) => guild.name).join(', ') || 'none'}
      </div>
      <button type="button" onClick={() => void refreshGuilds()}>
        Refresh guilds
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <GuildDirectoryProvider>
      <GuildDirectoryConsumer />
    </GuildDirectoryProvider>,
  );
}

describe('GuildDirectoryProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters malformed guild rows while keeping valid mutual guilds', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: '1', name: 'Alpha', botPresent: true, icon: null },
        { id: '2', name: 'Missing bot flag' },
        null,
        { id: 3, name: 'Bad id', botPresent: true },
      ],
    } as Response);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('guild-directory-status')).toHaveTextContent('idle:ok:Alpha');
    });
    expect(fetchSpy).toHaveBeenCalledWith('/api/guilds', { signal: expect.any(AbortSignal) });
  });

  it('surfaces invalid payloads as errors and can refresh successfully', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ guilds: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: '2', name: 'Beta', botPresent: true }],
      } as Response);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('guild-directory-status')).toHaveTextContent('idle:error:none');
    });

    await user.click(screen.getByRole('button', { name: 'Refresh guilds' }));

    await waitFor(() => {
      expect(screen.getByTestId('guild-directory-status')).toHaveTextContent('idle:ok:Beta');
    });
  });

  it('ignores abort errors without entering an error state', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('cancelled', 'AbortError'));

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('guild-directory-status')).toHaveTextContent('idle:ok:none');
    });
  });

  it('redirects to login on unauthorized responses', async () => {
    const originalLocation = window.location;
    // @ts-expect-error jsdom location replacement for redirect assertion
    delete window.location;
    // @ts-expect-error minimal location mock for href assignment
    window.location = { href: '' };

    try {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn(),
      } as unknown as Response);

      renderProvider();

      await waitFor(() => expect(window.location.href).toBe('/login'));
    } finally {
      // @ts-expect-error restore jsdom location
      window.location = originalLocation;
    }
  });

  it('throws when consumed outside the provider boundary', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    function OutsideProvider() {
      useGuildDirectory();
      return null;
    }

    expect(() => render(<OutsideProvider />)).toThrow(
      'useGuildDirectory must be used within GuildDirectoryProvider',
    );

    errorSpy.mockRestore();
  });
});
