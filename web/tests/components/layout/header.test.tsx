import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn(() => '/dashboard');
const mockReplace = vi.fn();
const mockUseSession = vi.fn<() => { data: unknown; status: string }>();
const mockSignOut = vi.fn();
const mockSetTheme = vi.fn();
const mockRefreshAnalytics = vi.fn();
const mockSetRangePreset = vi.fn();
const mockSetCompareMode = vi.fn();
const mockSetCustomRange = vi.fn();
const mockExportCsv = vi.fn();
const mockExportPdf = vi.fn();
const mockUseGuildSelection = vi.fn<() => string | null>(() => 'guild-1');
const mockFetchStats = vi.fn().mockResolvedValue('ok');
const mockFetchCases = vi.fn().mockResolvedValue('ok');
const mockFetchUserHistory = vi.fn().mockResolvedValue('ok');
const mockRefreshMembers = vi.fn().mockResolvedValue('ok');
const mockRefreshTickets = vi.fn().mockResolvedValue('ok');
const mockRefreshConversations = vi.fn();
const mockRefreshAuditLog = vi.fn();
const mockRefreshTempRoles = vi.fn();
const mockRefreshHealth = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: mockSetTheme }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string }) => <img alt={alt} {...props} />,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/components/layout/mobile-sidebar', () => ({
  MobileSidebar: () => <button type="button">Mobile menu</button>,
}));

vi.mock('@/components/dashboard/config-context', () => ({
  useConfigContext: () => ({
    activeCategoryId: null,
    searchQuery: '',
    searchResults: [],
    handleSearchChange: vi.fn(),
    handleSearchSelect: vi.fn(),
  }),
}));

vi.mock('@/components/dashboard/config-workspace/config-search', () => ({
  ConfigSearch: () => <div data-testid="config-search" />,
}));

vi.mock('@/contexts/analytics-context', () => ({
  useAnalytics: () => ({
    rangePreset: 'week',
    setRangePreset: mockSetRangePreset,
    compareMode: false,
    setCompareMode: mockSetCompareMode,
    refresh: mockRefreshAnalytics,
    exportCsv: mockExportCsv,
    exportPdf: mockExportPdf,
    loading: false,
    customFromApplied: '2026-04-01',
    customToApplied: '2026-04-07',
    setCustomRange: mockSetCustomRange,
  }),
}));

vi.mock('@/hooks/use-guild-selection', () => ({
  useGuildSelection: () => mockUseGuildSelection(),
}));

vi.mock('@/stores/moderation-store', () => ({
  useModerationStore: () => ({
    fetchStats: mockFetchStats,
    fetchCases: mockFetchCases,
    fetchUserHistory: mockFetchUserHistory,
    lookupUserId: null,
    userHistoryPage: 1,
    statsLoading: false,
    casesLoading: false,
  }),
}));

vi.mock('@/stores/members-store', () => ({
  useMembersStore: () => ({ refresh: mockRefreshMembers, loading: false }),
}));

vi.mock('@/stores/tickets-store', () => ({
  useTicketsStore: () => ({ refresh: mockRefreshTickets, loading: false }),
}));

vi.mock('@/stores/conversations-store', () => ({
  useConversationsStore: () => ({ refresh: mockRefreshConversations, loading: false }),
}));

vi.mock('@/stores/audit-log-store', () => ({
  useAuditLogStore: () => ({ refresh: mockRefreshAuditLog, loading: false }),
}));

vi.mock('@/stores/temp-roles-store', () => ({
  useTempRolesStore: () => ({ refresh: mockRefreshTempRoles, loading: false }),
}));

vi.mock('@/stores/health-store', () => ({
  useHealthStore: () => ({ refresh: mockRefreshHealth, loading: false }),
}));

vi.mock('@/components/ui/material-dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, ...props }: { children: ReactNode }) => <button type="button" {...props}>{children}</button>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuPageTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  DropdownMenuRadioGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuRadioItem: ({ children, value, onClick, ...props }: { children: ReactNode; value: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick} data-value={value} {...props}>{children}</button>
  ),
  DropdownMenuCheckboxItem: ({ children, checked, onCheckedChange }: { children: ReactNode; checked: boolean; onCheckedChange: (checked: boolean) => void }) => (
    <button type="button" aria-pressed={checked} onClick={() => onCheckedChange(!checked)}>{children}</button>
  ),
  DropdownMenuItem: ({ children, onClick, disabled, asChild }: { children: ReactNode; onClick?: () => void; disabled?: boolean; asChild?: boolean }) =>
    asChild ? <>{children}</> : <button type="button" disabled={disabled} onClick={onClick}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, asChild, ...props }: { children: ReactNode; onClick?: () => void; disabled?: boolean; asChild?: boolean }) =>
    asChild ? <>{children}</> : <button type="button" disabled={disabled} onClick={onClick} {...props}>{children}</button>,
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarImage: ({ alt }: { alt: string }) => <span>{alt}</span>,
  AvatarFallback: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props: Record<string, unknown>) => <div {...props} />,
}));

import { Header } from '@/components/layout/header';

const authenticatedSession = {
  data: {
    user: {
      id: 'discord-user-123',
      name: 'TestUser',
      email: 'test@example.com',
      image: 'https://cdn.discordapp.com/avatars/123/abc.png',
    },
  },
  status: 'authenticated',
};

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/dashboard');
    mockUseGuildSelection.mockReturnValue('guild-1');
    mockUseSession.mockReturnValue(authenticatedSession);
  });

  it('renders dashboard branding and the session user', () => {
    render(<Header />);

    expect(screen.getAllByText(/Volvox/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('TestUser').length).toBeGreaterThan(0);
    expect(screen.getByText('Mobile menu')).toBeInTheDocument();
  });

  it('renders loading and unauthenticated session states', () => {
    mockUseSession.mockReturnValueOnce({ data: null, status: 'loading' });
    const { rerender } = render(<Header />);
    expect(screen.getByTestId('header-skeleton')).toBeInTheDocument();

    mockUseSession.mockReturnValueOnce({ data: null, status: 'unauthenticated' });
    rerender(<Header />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('signs out once when the session carries RefreshTokenError', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: '123', name: 'TestUser' }, error: 'RefreshTokenError' },
      status: 'authenticated',
    });

    const { rerender } = render(<Header />);
    rerender(<Header />);

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/login' });
  });

  it('signs out from the account menu', async () => {
    const user = userEvent.setup();
    render(<Header />);

    await user.click(screen.getByRole('button', { name: /Terminate Session/i }));

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' });
  });

  it('runs analytics refresh, comparison, date range, and export actions on the dashboard', async () => {
    const user = userEvent.setup();
    render(<Header />);

    await user.click(screen.getByRole('button', { name: /Refresh Data/i }));
    await user.click(screen.getByRole('button', { name: /Compare Mode/i }));
    await user.click(screen.getByRole('button', { name: /Export to CSV/i }));
    await user.click(screen.getByRole('button', { name: /Export to PDF/i }));

    await user.clear(screen.getByDisplayValue('2026-04-01'));
    await user.type(screen.getByDisplayValue(''), '2026-04-02');
    await user.clear(screen.getByDisplayValue('2026-04-07'));
    await user.type(screen.getByDisplayValue(''), '2026-04-09');
    await user.click(screen.getByRole('button', { name: /Apply Range/i }));

    expect(mockRefreshAnalytics).toHaveBeenCalledTimes(1);
    expect(mockSetCompareMode).toHaveBeenCalledWith(true);
    expect(mockExportCsv).toHaveBeenCalledTimes(1);
    expect(mockExportPdf).toHaveBeenCalledTimes(1);
    expect(mockSetCustomRange).toHaveBeenCalledWith('2026-04-02', '2026-04-09');
  });

  it('dispatches the performance refresh event', async () => {
    mockUsePathname.mockReturnValue('/dashboard/performance');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    try {
      const user = userEvent.setup();
      render(<Header />);

      await user.click(screen.getByRole('button', { name: /Refresh Metrics/i }));

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'refresh-performance' }));
    } finally {
      dispatchSpy.mockRestore();
    }
  });

  it.each([
    [
      '/dashboard/moderation',
      /Refresh Mod Data/i,
      async () => {
        await waitFor(() => {
          expect(mockFetchStats).toHaveBeenCalledWith('guild-1', expect.any(Object));
          expect(mockFetchCases).toHaveBeenCalledWith('guild-1', expect.any(Object));
        });
      },
    ],
    ['/dashboard/members', /Refresh Members/i, () => expect(mockRefreshMembers).toHaveBeenCalledWith('guild-1')],
    ['/dashboard/tickets', /Refresh Tickets/i, () => expect(mockRefreshTickets).toHaveBeenCalledWith('guild-1')],
    ['/dashboard/conversations', /Refresh Conversations/i, () => expect(mockRefreshConversations).toHaveBeenCalledWith('guild-1')],
    ['/dashboard/audit-log', /Refresh Audit Log/i, () => expect(mockRefreshAuditLog).toHaveBeenCalledWith('guild-1')],
    ['/dashboard/temp-roles', /Refresh Temp Roles/i, () => expect(mockRefreshTempRoles).toHaveBeenCalledWith('guild-1')],
    ['/dashboard/logs', /Refresh Health/i, () => expect(mockRefreshHealth).toHaveBeenCalledWith('guild-1')],
  ] as const)('runs route-specific refresh action for %s', async (pathname, buttonName, assertion) => {
    mockUsePathname.mockReturnValue(pathname);
    const user = userEvent.setup();
    render(<Header />);

    await user.click(screen.getByRole('button', { name: buttonName }));

    await assertion();
  });

  it.each([
    ['/dashboard/moderation', /Refresh Mod Data/i],
    ['/dashboard/members', /Refresh Members/i],
    ['/dashboard/tickets', /Refresh Tickets/i],
    ['/dashboard/conversations', /Refresh Conversations/i],
    ['/dashboard/audit-log', /Refresh Audit Log/i],
    ['/dashboard/temp-roles', /Refresh Temp Roles/i],
    ['/dashboard/logs', /Refresh Health/i],
  ] as const)('disables guild-scoped refresh action without a selected guild for %s', (pathname, buttonName) => {
    mockUsePathname.mockReturnValue(pathname);
    mockUseGuildSelection.mockReturnValue(null);

    render(<Header />);

    expect(screen.getByRole('button', { name: buttonName })).toBeDisabled();
  });

  it('redirects to login when moderation, members, or tickets refreshes are unauthorized', async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValue('/dashboard/moderation');
    mockFetchStats.mockResolvedValueOnce('unauthorized');
    mockFetchCases.mockResolvedValueOnce('ok');
    const { rerender } = render(<Header />);
    await user.click(screen.getByRole('button', { name: /Refresh Mod Data/i }));
    await waitFor(() => expect(mockReplace).toHaveBeenNthCalledWith(1, '/login'));

    mockUsePathname.mockReturnValue('/dashboard/members');
    mockRefreshMembers.mockResolvedValueOnce('unauthorized');
    rerender(<Header />);
    await user.click(screen.getByRole('button', { name: /Refresh Members/i }));
    await waitFor(() => expect(mockReplace).toHaveBeenNthCalledWith(2, '/login'));

    mockUsePathname.mockReturnValue('/dashboard/tickets');
    mockRefreshTickets.mockResolvedValueOnce('unauthorized');
    rerender(<Header />);
    await user.click(screen.getByRole('button', { name: /Refresh Tickets/i }));
    await waitFor(() => expect(mockReplace).toHaveBeenNthCalledWith(3, '/login'));
    expect(mockReplace).toHaveBeenCalledTimes(3);
  });
});
