import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleDirectoryProvider, useGuildRoles } from '@/components/layout/role-directory-context';

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

function RoleConsumer({ guildId }: { guildId: string | null }) {
  const { roles, loading, error } = useGuildRoles(guildId);

  if (!guildId) {
    return <div>No guild</div>;
  }

  if (loading) {
    return <div>Loading roles</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  return <div>{roles.map((role) => role.name).join(', ')}</div>;
}

describe('RoleDirectoryProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/dashboard/moderation');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shares a single client-side role fetch across duplicate consumers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: '1', name: 'Admin', color: 15_292_223 },
        { id: '2', name: 'Mod', color: 3_443_003 },
      ],
    } as Response);

    render(
      <RoleDirectoryProvider>
        <RoleConsumer guildId="guild-1" />
        <RoleConsumer guildId="guild-1" />
      </RoleDirectoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Admin, Mod')).toHaveLength(2);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('/api/guilds/guild-1/roles', {
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
        json: async () => [{ id: '1', name: 'Admin', color: 15_292_223 }],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: '2', name: 'Helper', color: 3_443_003 }],
      } as Response);

    const view = render(
      <RoleDirectoryProvider>
        <RoleConsumer guildId="guild-1" />
      </RoleDirectoryProvider>,
    );

    await screen.findByText('Admin');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    mockUsePathname.mockReturnValue('/dashboard/onboarding');
    view.rerender(
      <RoleDirectoryProvider>
        <RoleConsumer guildId="guild-1" />
      </RoleDirectoryProvider>,
    );

    await screen.findByText('Helper');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('refreshes already-loaded role data on demand', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: '1', name: 'Admin', color: 15_292_223 }],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: '1', name: 'Owner', color: 16_711_680 }],
      } as Response);

    function RefreshConsumer() {
      const { roles, refreshRoles } = useGuildRoles('guild-1');

      return (
        <div>
          <button type="button" onClick={() => void refreshRoles()}>
            Refresh
          </button>
          <span>{roles.map((role) => role.name).join(', ')}</span>
        </div>
      );
    }

    render(
      <RoleDirectoryProvider>
        <RefreshConsumer />
      </RoleDirectoryProvider>,
    );

    await screen.findByText('Admin');
    await user.click(await screen.findByRole('button', { name: 'Refresh' }));

    await screen.findByText('Owner');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('allows retrying after a failed fetch', async () => {
    const user = userEvent.setup();
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
        json: async () => [{ id: '1', name: 'Admin', color: 15_292_223 }],
      } as Response);

    function RefreshConsumer() {
      const { roles, error, refreshRoles } = useGuildRoles('guild-1');

      return (
        <div>
          <button type="button" onClick={() => void refreshRoles()}>
            Retry
          </button>
          <span>{error ?? roles.map((role) => role.name).join(', ')}</span>
        </div>
      );
    }

    render(
      <RoleDirectoryProvider>
        <RefreshConsumer />
      </RoleDirectoryProvider>,
    );

    await screen.findByText('Failed to fetch roles: Service Unavailable');
    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    await screen.findByText('Admin');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
