import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleDirectoryProvider, useGuildRoles } from '@/components/layout/role-directory-context';
import { abortableFetch, createDeferred } from '../../helpers/async';

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

function roleResponse(...roles: Array<{ id: string; name: string; color: number }>) {
  return {
    ok: true,
    status: 200,
    json: async () => roles,
  } as Response;
}

function failedResponse(status: number, statusText: string) {
  return {
    ok: false,
    status,
    statusText,
  } as Response;
}

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

function RefreshConsumer({ buttonLabel }: Readonly<{ buttonLabel: string }>) {
  const { error, loading, refreshRoles, roles } = useGuildRoles('guild-1');
  const roleNames = roles.map((role) => role.name).join(', ');

  return (
    <div>
      <button type="button" onClick={() => void refreshRoles()}>
        {buttonLabel}
      </button>
      <span>{error ?? (loading ? 'Loading roles' : roleNames)}</span>
    </div>
  );
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
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        roleResponse(
          { id: '1', name: 'Admin', color: 15_292_223 },
          { id: '2', name: 'Mod', color: 3_443_003 },
        ),
      );

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
      .mockResolvedValueOnce(roleResponse({ id: '1', name: 'Admin', color: 15_292_223 }))
      .mockResolvedValueOnce(roleResponse({ id: '2', name: 'Helper', color: 3_443_003 }));

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
      .mockResolvedValueOnce(roleResponse({ id: '1', name: 'Admin', color: 15_292_223 }))
      .mockResolvedValueOnce(roleResponse({ id: '1', name: 'Owner', color: 16_711_680 }));

    render(
      <RoleDirectoryProvider>
        <RefreshConsumer buttonLabel="Refresh" />
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
      .mockResolvedValueOnce(failedResponse(503, 'Service Unavailable'))
      .mockResolvedValueOnce(roleResponse({ id: '1', name: 'Admin', color: 15_292_223 }));

    render(
      <RoleDirectoryProvider>
        <RefreshConsumer buttonLabel="Retry" />
      </RoleDirectoryProvider>,
    );

    await screen.findByText('Failed to fetch roles: Service Unavailable');
    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    await screen.findByText('Admin');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('clears loading and redirects with a callback URL after an unauthorized response', async () => {
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({
      href: 'http://localhost:3000/dashboard/moderation',
    } as Location);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(failedResponse(401, 'Unauthorized'));

    render(
      <RoleDirectoryProvider>
        <RoleConsumer guildId="guild-1" />
      </RoleDirectoryProvider>,
    );

    await screen.findByText('Unauthorized');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(globalThis.location.href).toBe('/login?callbackUrl=%2Fdashboard%2Fmoderation');
  });

  it('forces a new fetch during an in-flight request', async () => {
    const user = userEvent.setup();
    const firstRequest = createDeferred<Response>();
    const secondRequest = createDeferred<Response>();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(abortableFetch(firstRequest))
      .mockImplementationOnce(() => secondRequest.promise);

    render(
      <RoleDirectoryProvider>
        <RefreshConsumer buttonLabel="Refresh" />
      </RoleDirectoryProvider>,
    );

    await screen.findByText('Loading roles');
    await user.click(await screen.findByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    secondRequest.resolve(roleResponse({ id: '1', name: 'Owner', color: 16_711_680 }));

    await screen.findByText('Owner');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
