import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockInitDashboardAmplitude, mockTrackDashboardEvent, mockUseSession, mockUseTheme } =
  vi.hoisted(() => ({
    mockInitDashboardAmplitude: vi.fn(),
    mockTrackDashboardEvent: vi.fn(),
    mockUseSession: vi.fn(),
    mockUseTheme: vi.fn(),
  }));

const { mockSetContext, mockUseGuildSelection, mockUsePathname } = vi.hoisted(() => ({
  mockSetContext: vi.fn(),
  mockUseGuildSelection: vi.fn(),
  mockUsePathname: vi.fn(),
}));

vi.mock('@/lib/amplitude', () => ({
  DASHBOARD_PAGE_VIEW_EVENT: 'dashboard_page_viewed',
  initDashboardAmplitude: mockInitDashboardAmplitude,
  trackDashboardEvent: mockTrackDashboardEvent,
}));

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  ),
  useSession: () => mockUseSession(),
  signIn: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => mockUseTheme(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@sentry/nextjs', () => ({
  setContext: mockSetContext,
}));

vi.mock('@/hooks/use-guild-selection', () => ({
  useGuildSelection: () => mockUseGuildSelection(),
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));

vi.mock('sonner', () => ({
  Toaster: ({ theme }: { theme: string }) => <div data-testid="toaster" data-theme={theme} />,
}));

import { Providers } from '@/components/providers';

describe('Providers', () => {
  beforeEach(() => {
    mockInitDashboardAmplitude.mockClear();
    mockSetContext.mockClear();
    mockTrackDashboardEvent.mockClear();
    mockUseGuildSelection.mockReturnValue(null);
    mockUsePathname.mockReturnValue('/');
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('wraps children in SessionProvider', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });

    render(
      <Providers>
        <div data-testid="child">Hello</div>
      </Providers>,
    );
    const sessionProvider = screen.getByTestId('session-provider');
    const child = screen.getByTestId('child');

    expect(sessionProvider).toContainElement(child);
    expect(screen.getByTestId('toaster')).toHaveAttribute('data-theme', 'dark');
  });

  it('falls back to the system theme when no resolved theme exists', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: undefined });

    render(
      <Providers>
        <div>Fallback</div>
      </Providers>,
    );

    expect(screen.getByTestId('toaster')).toHaveAttribute('data-theme', 'system');
  });

  it('sets Sentry route and guild context tags for authenticated dashboard routes', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });
    mockUsePathname.mockReturnValue('/dashboard/settings');
    mockUseGuildSelection.mockReturnValue('1234567890');
    mockUseSession.mockReturnValue({
      data: { user: { id: 'discord-user-123' } },
      status: 'authenticated',
    });

    render(
      <Providers>
        <div>Dashboard</div>
      </Providers>,
    );

    expect(mockSetContext).toHaveBeenCalledWith('routing', { route: '/dashboard/settings' });
    expect(mockSetContext).toHaveBeenCalledWith('guild', { selection: 'selected' });
    expect(JSON.stringify(mockSetContext.mock.calls)).not.toContain('1234567890');
  });

  it.each([
    ['/dashboard/members/123456789012345678', '/dashboard/members/[userId]'],
    ['/dashboard/conversations/conv-private-123', '/dashboard/conversations/[conversationId]'],
    ['/dashboard/tickets/ticket-123456789012345678', '/dashboard/tickets/[ticketId]'],
    ['/dashboard/settings/moderation', '/dashboard/settings/[category]'],
  ])('generalizes dynamic dashboard route %s for Sentry telemetry', (route, telemetryRoute) => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });
    mockUsePathname.mockReturnValue(route);
    mockUseGuildSelection.mockReturnValue('123456789012345678');
    mockUseSession.mockReturnValue({
      data: { user: { id: 'discord-user-123' } },
      status: 'authenticated',
    });

    render(
      <Providers>
        <div>Dashboard</div>
      </Providers>,
    );

    expect(mockSetContext).toHaveBeenCalledWith('routing', { route: telemetryRoute });
    expect(JSON.stringify(mockSetContext.mock.calls)).not.toContain('123456789012345678');
    expect(JSON.stringify(mockSetContext.mock.calls)).not.toContain('conv-private-123');
    expect(JSON.stringify(mockSetContext.mock.calls)).not.toContain('ticket-123456789012345678');
  });

  it('generalizes dynamic community routes for Sentry telemetry', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });
    mockUsePathname.mockReturnValue('/community/123456789012345678/987654321098765432');
    mockUseGuildSelection.mockReturnValue('1234567890');
    mockUseSession.mockReturnValue({
      data: { user: { id: 'discord-user-123' } },
      status: 'authenticated',
    });

    render(
      <Providers>
        <div>Community</div>
      </Providers>,
    );

    expect(mockSetContext).toHaveBeenCalledWith('routing', {
      route: '/community/[guildId]/[userId]',
    });
    expect(JSON.stringify(mockSetContext.mock.calls)).not.toContain('123456789012345678');
    expect(JSON.stringify(mockSetContext.mock.calls)).not.toContain('987654321098765432');
  });

  it('clears Sentry guild context outside dashboard routes', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });
    mockUsePathname.mockReturnValue('/');
    mockUseGuildSelection.mockReturnValue('1234567890');
    mockUseSession.mockReturnValue({
      data: { user: { id: 'discord-user-123' } },
      status: 'authenticated',
    });

    render(
      <Providers>
        <div>Home</div>
      </Providers>,
    );

    expect(mockSetContext).toHaveBeenCalledWith('routing', { route: '/' });
    expect(mockSetContext).toHaveBeenCalledWith('guild', null);
  });

  it('clears Sentry guild context for unauthenticated dashboard routes', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });
    mockUsePathname.mockReturnValue('/dashboard/settings');
    mockUseGuildSelection.mockReturnValue('1234567890');
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });

    render(
      <Providers>
        <div>Dashboard</div>
      </Providers>,
    );

    expect(mockSetContext).toHaveBeenCalledWith('routing', { route: '/dashboard/settings' });
    expect(mockSetContext).toHaveBeenCalledWith('guild', null);
  });

  it('initializes Amplitude and tracks dashboard page views without PII', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });
    mockUsePathname.mockReturnValue('/dashboard/members/1234567890');
    mockUseGuildSelection.mockReturnValue('1234567890');
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'discord-user-123',
          email: 'person@example.com',
          name: 'Person',
        },
      },
      status: 'authenticated',
    });

    render(
      <Providers>
        <div>Dashboard</div>
      </Providers>,
    );

    expect(mockInitDashboardAmplitude).toHaveBeenCalledWith('discord-user-123');
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith('dashboard_page_viewed', {
      authStatus: 'authenticated',
      guildSelection: 'selected',
      route: '/dashboard/members/[userId]',
    });
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain('1234567890');
  });

  it.each(['/', '/privacy', '/login', '/error', '/dashboard-login'])(
    'does not track dashboard page views on non-dashboard route %s',
    (route) => {
      mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });
      mockUsePathname.mockReturnValue(route);
      mockUseGuildSelection.mockReturnValue('1234567890');
      mockUseSession.mockReturnValue({
        data: { user: { id: 'discord-user-123' } },
        status: 'authenticated',
      });

      render(
        <Providers>
          <div>Public page</div>
        </Providers>,
      );

      expect(mockInitDashboardAmplitude).toHaveBeenCalledWith('discord-user-123');
      expect(mockTrackDashboardEvent).not.toHaveBeenCalled();
    },
  );

  it('dedupes dashboard page views by generalized route', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });
    mockUsePathname.mockReturnValue('/dashboard/members/111111111111111111');
    mockUseGuildSelection.mockReturnValue('1234567890');
    mockUseSession.mockReturnValue({
      data: { user: { id: 'discord-user-123' } },
      status: 'authenticated',
    });

    const { rerender } = render(
      <Providers>
        <div>Dashboard</div>
      </Providers>,
    );

    mockUsePathname.mockReturnValue('/dashboard/members/222222222222222222');

    rerender(
      <Providers>
        <div>Dashboard</div>
      </Providers>,
    );

    expect(mockTrackDashboardEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith('dashboard_page_viewed', {
      authStatus: 'authenticated',
      guildSelection: 'selected',
      route: '/dashboard/members/[userId]',
    });
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain('111111111111111111');
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain('222222222222222222');
  });

  it('waits for auth status to settle and dedupes dashboard page views without navigation', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });
    mockUsePathname.mockReturnValue('/dashboard/settings');
    mockUseGuildSelection.mockReturnValue(null);
    mockUseSession.mockReturnValue({ data: null, status: 'loading' });

    const { rerender } = render(
      <Providers>
        <div>Dashboard</div>
      </Providers>,
    );

    expect(mockTrackDashboardEvent).not.toHaveBeenCalled();

    mockUseGuildSelection.mockReturnValue('1234567890');
    mockUseSession.mockReturnValue({
      data: { user: { id: 'discord-user-123' } },
      status: 'authenticated',
    });

    rerender(
      <Providers>
        <div>Dashboard</div>
      </Providers>,
    );

    expect(mockTrackDashboardEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackDashboardEvent).toHaveBeenLastCalledWith('dashboard_page_viewed', {
      authStatus: 'authenticated',
      guildSelection: 'selected',
      route: '/dashboard/settings',
    });
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain('1234567890');

    mockUsePathname.mockReturnValue('/dashboard/moderation');

    rerender(
      <Providers>
        <div>Dashboard</div>
      </Providers>,
    );

    expect(mockTrackDashboardEvent).toHaveBeenCalledTimes(2);
    expect(mockTrackDashboardEvent).toHaveBeenLastCalledWith('dashboard_page_viewed', {
      authStatus: 'authenticated',
      guildSelection: 'selected',
      route: '/dashboard/moderation',
    });
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain('1234567890');
  });
});
