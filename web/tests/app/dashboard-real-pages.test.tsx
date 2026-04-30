import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NativeURL = globalThis.URL;

const {
  mockBack,
  mockPush,
  mockReplace,
  mockGuildSelection,
  mockParams,
  mockSearchParamsState,
  mockUseGuildChannels,
  mockUseLogStream,
  mockAuditState,
  mockAuditReset,
  mockAuditAbort,
  mockTempRolesState,
  mockTempRolesReset,
  mockToastSuccess,
  mockToastError,
  mockRouter,
} = vi.hoisted(() => {
  const mockBack = vi.fn();
  const mockPush = vi.fn();
  const mockReplace = vi.fn();
  return {
  mockBack,
  mockPush,
  mockReplace,
  mockGuildSelection: vi.fn(),
  mockParams: {} as Record<string, string>,
  mockSearchParamsState: { value: new URLSearchParams() },
  mockUseGuildChannels: vi.fn(),
  mockUseLogStream: vi.fn(),
  mockAuditState: {} as Record<string, unknown>,
  mockAuditReset: vi.fn(),
  mockAuditAbort: vi.fn(),
  mockTempRolesState: {} as Record<string, unknown>,
  mockTempRolesReset: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockRouter: { back: mockBack, push: mockPush, replace: mockReplace },
};
});

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useParams: () => mockParams,
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParamsState.value,
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    // biome-ignore lint/a11y/useAltText: test double forwards the Next Image alt prop.
    <img alt={alt} {...props} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

vi.mock('@/hooks/use-guild-selection', () => ({
  useGuildSelection: (opts?: { onGuildChange?: () => void }) => {
    void opts;
    return mockGuildSelection();
  },
}));

vi.mock('@/components/layout/channel-directory-context', () => ({
  useGuildChannels: (guildId: string | null) => mockUseGuildChannels(guildId),
}));

vi.mock('@/lib/log-ws', () => ({
  useLogStream: (opts: unknown) => mockUseLogStream(opts),
}));

vi.mock('@/components/dashboard/health-section', () => ({
  HealthSection: ({ children }: { children: React.ReactNode }) => (
    <section aria-label="health">{children}</section>
  ),
}));

vi.mock('@/components/dashboard/log-filters', () => ({
  LogFilters: ({ onFilterChange, disabled }: { onFilterChange: (filter: unknown) => void; disabled: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => onFilterChange({ level: 'warn' })}>
      Apply log filter
    </button>
  ),
}));

vi.mock('@/components/dashboard/log-viewer', () => ({
  LogViewer: ({ logs, status, onClear, resolveChannelName }: { logs: Array<{ channelId?: string }>; status: string; onClear: () => void; resolveChannelName: (id?: string) => string | null }) => (
    <div>
      <span>viewer:{status}</span>
      <span>channel:{resolveChannelName(logs[0]?.channelId)}</span>
      <button type="button" onClick={onClear}>Clear logs</button>
    </div>
  ),
}));

vi.mock('@/components/dashboard/conversation-replay', () => ({
  ConversationReplay: ({ channelName, messages, onFlagSubmitted }: { channelName?: string | null; messages: Array<{ content: string }>; onFlagSubmitted: () => void }) => (
    <div data-testid="conversation-replay">
      <span>{channelName}</span>
      <span>{messages[0]?.content}</span>
      <button type="button" onClick={onFlagSubmitted}>Flag done</button>
    </div>
  ),
}));

vi.mock('@/components/dashboard/action-badge', () => ({
  ActionBadge: ({ action }: { action: string }) => <span>{action}</span>,
}));

vi.mock('@/components/dashboard/empty-state', () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock('@/stores/audit-log-store', () => {
  const useAuditLogStore = Object.assign(() => mockAuditState, {
    getState: () => ({ reset: mockAuditReset, abortInFlight: mockAuditAbort }),
  });
  return { useAuditLogStore };
});

vi.mock('@/stores/temp-roles-store', () => {
  const useTempRolesStore = Object.assign(() => mockTempRolesState, {
    getState: () => ({ reset: mockTempRolesReset }),
  });
  return { useTempRolesStore };
});

import CommunityPage, { generateMetadata as generateCommunityMetadata } from '@/app/community/[guildId]/page';
import ProfilePage, { generateMetadata as generateProfileMetadata } from '@/app/community/[guildId]/[userId]/page';
import AuditLogPage from '@/app/dashboard/audit-log/page';
import ConversationDetailPage from '@/app/dashboard/conversations/[conversationId]/page';
import LogsPage from '@/app/dashboard/logs/page';
import MemberDetailPage from '@/app/dashboard/members/[userId]/page';
import TempRolesPage from '@/app/dashboard/temp-roles/page';
import TicketDetailPage from '@/app/dashboard/tickets/[ticketId]/page';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

function resetMocks() {
  vi.clearAllMocks();
  mockGuildSelection.mockReturnValue('guild-1');
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  mockSearchParamsState.value = new URLSearchParams();
}

beforeEach(() => {
  resetMocks();
  mockUseGuildChannels.mockReturnValue({ channels: [{ id: 'chan-1', name: 'general' }] });
  mockUseLogStream.mockReturnValue({
    logs: [{ message: 'ready', channelId: 'chan-1' }],
    status: 'connected',
    sendFilter: vi.fn(),
    clearLogs: vi.fn(),
  });

  Object.assign(mockAuditState, {
    entries: [
      {
        id: 1,
        action: 'moderation.delete',
        user_id: 'user-1234',
        user_tag: '',
        target_id: 'target-9999',
        target_tag: '',
        target_type: 'member',
        created_at: '2026-04-28T08:00:00Z',
        ip_address: '127.0.0.1',
        details: { reason: 'cleanup' },
      },
      {
        id: 2,
        action: 'config.update',
        user_id: 'user-5678',
        user_tag: 'Ada#0001',
        target_id: null,
        target_tag: null,
        target_type: null,
        created_at: '2026-04-28T09:00:00Z',
        ip_address: null,
        details: null,
      },
    ],
    total: 60,
    loading: false,
    error: null,
    filters: { action: '', userId: '', startDate: '', endDate: '', offset: 0 },
    setFilters: vi.fn(),
    fetch: vi.fn().mockResolvedValue('ok'),
  });

  Object.assign(mockTempRolesState, {
    data: {
      data: [
        {
          id: 7,
          guild_id: 'guild-1',
          user_id: 'user-1',
          user_tag: 'Ada#0001',
          role_id: 'role-1',
          role_name: 'Muted',
          moderator_id: 'mod-1',
          moderator_tag: 'Mod#0001',
          reason: null,
          duration: '1h',
          expires_at: new Date(Date.now() + 90_000).toISOString(),
          created_at: '2026-04-28T08:00:00Z',
        },
      ],
      pagination: { total: 30, page: 1, pages: 2 },
    },
    loading: false,
    error: null,
    page: 1,
    setPage: vi.fn(),
    fetch: vi.fn().mockResolvedValue('ok'),
  });

  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  class TestURL extends NativeURL {}

  Object.defineProperties(TestURL, {
    createObjectURL: {
      configurable: true,
      value: vi.fn(() => 'blob:members'),
    },
    revokeObjectURL: {
      configurable: true,
      value: vi.fn(),
    },
  });

  vi.stubGlobal('URL', TestURL);
});

describe('previously unexcluded app pages', () => {
  it('renders community hub data and metadata from public API responses', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ memberCount: 12, totalMessagesSent: 3456, activeProjects: 3, challengesCompleted: 4, topContributors: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ memberCount: 12, totalMessagesSent: 3456, activeProjects: 3, challengesCompleted: 4, topContributors: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ members: [{ userId: 'u1', username: 'ada', displayName: 'Ada', avatar: null, xp: 1200, level: 4, badge: 'Helper', rank: 1, currentLevelXp: 1000, nextLevelXp: 1500 }], total: 1 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ projects: [{ id: 1, title: 'Bot Tools', description: 'Useful utilities', tech: ['TS'], repoUrl: 'https://github.com/example/repo', liveUrl: null, authorName: 'Ada', authorAvatar: null, upvotes: 9, createdAt: '2026-04-28T08:00:00Z' }], total: 1 }),
      );

    await expect(generateCommunityMetadata({ params: Promise.resolve({ guildId: 'guild-1' }) })).resolves.toMatchObject({
      title: 'Community Hub — Leaderboard & Showcases',
    });

    render(await CommunityPage({ params: Promise.resolve({ guildId: 'guild-1' }) }));

    expect(screen.getByRole('heading', { name: /community hub/i })).toBeInTheDocument();
    expect(screen.getAllByText('Ada').length).toBeGreaterThan(0);
    expect(screen.getByText('Bot Tools')).toBeInTheDocument();
  });

  it('renders community profile data and metadata', async () => {
    const profile = {
      username: 'ada',
      displayName: 'Ada Lovelace',
      avatar: null,
      xp: 2400,
      level: 5,
      currentLevelXp: 2000,
      nextLevelXp: 3000,
      badge: 'Mentor',
      joinedAt: '2026-01-01T00:00:00Z',
      stats: { messagesSent: 100, reactionsGiven: 8, reactionsReceived: 12, daysActive: 20 },
      projects: [{ id: 2, title: 'Analytical Engine', description: 'Math notes', tech: ['Docs'], repoUrl: null, liveUrl: 'https://example.com', upvotes: 4, createdAt: '2026-04-01T00:00:00Z' }],
      recentBadges: [{ name: 'Helpful', description: 'Helped people' }],
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(profile))
      .mockResolvedValueOnce(jsonResponse(profile));

    await expect(generateProfileMetadata({ params: Promise.resolve({ guildId: 'guild-1', userId: 'u1' }) })).resolves.toMatchObject({
      title: 'Ada Lovelace — Community Profile',
    });

    render(await ProfilePage({ params: Promise.resolve({ guildId: 'guild-1', userId: 'u1' }) }));

    expect(screen.getByRole('heading', { name: /ada lovelace/i })).toBeInTheDocument();
    expect(screen.getByText('Analytical Engine')).toBeInTheDocument();
    expect(screen.getByText('Helpful')).toBeInTheDocument();
  });

  it('renders logs and wires filter/clear handlers', async () => {
    const stream = { logs: [{ message: 'ready', channelId: 'chan-1' }], status: 'connected', sendFilter: vi.fn(), clearLogs: vi.fn() };
    mockUseLogStream.mockReturnValue(stream);

    render(<LogsPage />);

    expect(screen.getByRole('heading', { name: /log\s*stream/i })).toBeInTheDocument();
    expect(screen.getByText('channel:general')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /apply log filter/i }));
    await userEvent.click(screen.getByRole('button', { name: /clear logs/i }));

    expect(stream.sendFilter).toHaveBeenCalledWith({ level: 'warn' });
    expect(stream.clearLogs).toHaveBeenCalled();
  });

  it('renders audit log rows, filters, expansion, pagination, and copy controls', async () => {
    render(<AuditLogPage />);

    await waitFor(() => expect(mockAuditState.fetch).toHaveBeenCalled());
    expect(screen.getByText('Total Entries')).toBeInTheDocument();
    expect(screen.getByText('User 1234')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/filter audit log/i), { target: { value: 'user-1234' } });
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-04-01' } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-04-30' } });
    await userEvent.click(screen.getByText('User 1234').closest('tr') as HTMLElement);
    expect(screen.getByText(/cleanup/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /copy id/i })[0]);
    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('user-1234');
    expect(mockAuditState.setFilters).toHaveBeenCalledWith({ offset: 25 });
  });

  it('renders conversation detail success and error navigation states', async () => {
    mockParams.conversationId = 'conversation-abc123';
    mockSearchParamsState.value = new URLSearchParams('guildId=guild-1');
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ messages: [{ id: 'm1', authorId: 'u1', authorName: 'Ada', content: 'Hello', createdAt: '2026-04-28T08:00:00Z', role: 'user' }], channelId: 'chan-1', channelName: 'general', duration: 12, tokenEstimate: 34 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ messages: [{ id: 'm1', authorId: 'u1', authorName: 'Ada', content: 'Hello again', createdAt: '2026-04-28T08:00:00Z', role: 'user' }], channelId: 'chan-1', channelName: 'general', duration: 12, tokenEstimate: 34 }),
      );

    render(<ConversationDetailPage />);

    await waitFor(() => expect(screen.getByTestId('conversation-replay')).toBeInTheDocument());
    expect(screen.getByText(/#abc123/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /return to logs/i }));
    await userEvent.click(screen.getByRole('button', { name: /flag done/i }));

    expect(mockBack).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('renders member detail and performs XP adjustment and export', async () => {
    mockParams.userId = 'user-1';
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'user-1', username: 'ada', displayName: 'Ada', avatar: null,
          roles: [{ id: 'role-1', name: 'Helper', color: '#000000' }], joinedAt: '2026-01-01T00:00:00Z',
          stats: { messages_sent: 10, reactions_given: 2, reactions_received: 3, days_active: 4, first_seen: null, last_active: null },
          reputation: { xp: 200, level: 2, messages_count: 10, voice_minutes: 0, helps_given: 1, last_xp_gain: null, current_level_xp: 100, next_level_xp: 300 },
          warnings: { count: 1, recent: [{ case_number: 12, action: 'warn', reason: null, moderator_tag: 'Mod#0001', created_at: '2026-04-28T08:00:00Z' }] },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ xp: 250, level: 2, current_level_xp: 100, next_level_xp: 300 }))
      .mockResolvedValueOnce(new Response('id,name\n1,Ada', { status: 200 }));

    render(<MemberDetailPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ada' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/delta amount/i), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText(/authorization reason/i), { target: { value: 'bonus' } });
    await userEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('XP adjusted', expect.any(Object)));

    await userEvent.click(screen.getByRole('button', { name: /download archive/i }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Export downloaded', expect.any(Object)));
  });

  it('renders temp roles, paginates, and revokes a role', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));

    render(<TempRolesPage />);

    await waitFor(() => expect(mockTempRolesState.fetch).toHaveBeenCalledWith('guild-1', 1));
    expect(screen.getByText('Ada#0001')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(mockTempRolesState.setPage).toHaveBeenCalledWith(2);

    await userEvent.click(screen.getByRole('button', { name: /revoke/i }));
    await userEvent.click(screen.getAllByRole('button', { name: /revoke/i }).at(-1) as HTMLElement);
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Temp role revoked', expect.any(Object)));
  });

  it('renders ticket detail with transcript and back navigation', async () => {
    mockParams.ticketId = '7';
    mockSearchParamsState.value = new URLSearchParams('guildId=guild-1');
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ id: 7, guild_id: 'guild-1', user_id: 'user-1', topic: 'Billing', status: 'closed', thread_id: 'thread-1', channel_id: 'chan-1', closed_by: 'mod-1', close_reason: 'resolved', created_at: '2026-04-28T08:00:00Z', closed_at: '2026-04-28T09:00:00Z', transcript: [{ author: 'Ada', authorId: 'user-1', content: 'Need help', timestamp: '2026-04-28T08:10:00Z' }] }),
    );

    render(<TicketDetailPage />);

    await waitFor(() => expect(screen.getByText('#7')).toBeInTheDocument());
    expect(screen.getByText('Need help')).toBeInTheDocument();
    expect(screen.getByText('resolved')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('previously unexcluded app page alternate states', () => {
  it('covers logs connection and channel-name fallbacks', () => {
    mockUseLogStream.mockReturnValue({ logs: [{ message: 'retry', channelId: 'missing' }], status: 'reconnecting', sendFilter: vi.fn(), clearLogs: vi.fn() });
    const first = render(<LogsPage />);
    expect(screen.getByText('reconnecting')).toBeInTheDocument();
    expect(screen.getByText('channel:')).toBeInTheDocument();
    first.unmount();

    mockUseLogStream.mockReturnValue({ logs: [{}], status: 'disconnected', sendFilter: vi.fn(), clearLogs: vi.fn() });
    render(<LogsPage />);
    expect(screen.getByText('disconnected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply log filter/i })).toBeDisabled();
  });

  it('covers audit loading, empty, error, filter clear, and badge variants', async () => {
    Object.assign(mockAuditState, {
      entries: [
        { id: 3, action: 'moderation.create', user_id: 'user-1', user_tag: 'Creator', target_id: null, target_tag: null, target_type: null, created_at: '2026-04-28T08:00:00Z', ip_address: null, details: null },
        { id: 4, action: 'members.update', user_id: 'user-2', user_tag: 'Updater', target_id: 'target-2', target_tag: 'Target Tag', target_type: null, created_at: '2026-04-28T08:00:00Z', ip_address: null, details: { changed: true } },
        { id: 5, action: 'misc.action', user_id: 'user-3', user_tag: 'Other', target_id: null, target_tag: null, target_type: null, created_at: '2026-04-28T08:00:00Z', ip_address: null, details: null },
      ],
      total: 3,
      error: 'Audit failed',
      filters: { action: 'config.update', userId: 'user-1', startDate: '', endDate: '', offset: 25 },
    });
    const loaded = render(<AuditLogPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Audit failed');
    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(mockAuditState.setFilters).toHaveBeenCalledWith({ userId: '', offset: 0 });
    await userEvent.click(screen.getByText('Updater').closest('tr') as HTMLElement);
    expect(screen.getByText(/changed/)).toBeInTheDocument();
    loaded.unmount();

    Object.assign(mockAuditState, {
      entries: [],
      total: 0,
      loading: true,
      error: null,
      filters: { action: '', userId: '', startDate: '', endDate: '', offset: 0 },
    });
    const loading = render(<AuditLogPage />);
    expect(screen.getByText('Action')).toBeInTheDocument();
    loading.unmount();

    Object.assign(mockAuditState, {
      loading: false,
      filters: { action: 'moderation.delete', userId: '', startDate: '', endDate: '', offset: 0 },
    });
    render(<AuditLogPage />);
    expect(screen.getByText('No matching entries')).toBeInTheDocument();
  });

  it('covers temp role empty, unauthorized, expired, and revoke failure states', async () => {
    mockGuildSelection.mockReturnValue(null);
    const noGuild = render(<TempRolesPage />);
    expect(screen.getByText(/select a server/i)).toBeInTheDocument();
    noGuild.unmount();

    mockGuildSelection.mockReturnValue('guild-1');
    Object.assign(mockTempRolesState, {
      data: { data: [], pagination: { total: 0, page: 1, pages: 0 } },
      error: 'Temp role fetch failed',
      loading: false,
      fetch: vi.fn().mockResolvedValue('unauthorized'),
    });
    const errorView = render(<TempRolesPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.getByRole('alert')).toHaveTextContent('Temp role fetch failed');
    errorView.unmount();

    Object.assign(mockTempRolesState, {
      data: { data: [], pagination: { total: 0, page: 1, pages: 0 } },
      error: null,
      loading: true,
      fetch: vi.fn().mockResolvedValue('ok'),
    });
    const loading = render(<TempRolesPage />);
    expect(screen.getByText('Active Roles')).toBeInTheDocument();
    loading.unmount();

    Object.assign(mockTempRolesState, {
      data: { data: [{ id: 8, guild_id: 'guild-1', user_id: 'user-2', user_tag: 'Grace#0001', role_id: 'role-2', role_name: 'Timeout', moderator_id: 'mod-1', moderator_tag: 'Mod#0001', reason: 'spam', duration: '10m', expires_at: new Date(Date.now() - 1_000).toISOString(), created_at: '2026-04-28T08:00:00Z' }], pagination: { total: 1, page: 1, pages: 1 } },
      loading: false,
    });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'Nope' }, { status: 500 }));
    render(<TempRolesPage />);
    expect(screen.getByText('Expired')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /revoke/i }));
    await userEvent.click(screen.getAllByRole('button', { name: /revoke/i }).at(-1) as HTMLElement);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to revoke temp role', expect.any(Object)));
  });

  it('covers conversation and ticket error/empty branches', async () => {
    mockParams.conversationId = 'conversation-empty';
    mockSearchParamsState.value = new URLSearchParams();
    const noGuildConversation = render(<ConversationDetailPage />);
    await waitFor(() => expect(screen.queryByText(/Protocol Error/)).not.toBeInTheDocument());
    noGuildConversation.unmount();

    mockSearchParamsState.value = new URLSearchParams('guildId=guild-1');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'missing' }, { status: 404 }));
    const missingConversation = render(<ConversationDetailPage />);
    await waitFor(() => expect(screen.getByText('Conversation not found')).toBeInTheDocument());
    missingConversation.unmount();

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, { status: 401 }));
    const unauthorizedConversation = render(<ConversationDetailPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    unauthorizedConversation.unmount();

    mockParams.ticketId = '9';
    mockSearchParamsState.value = new URLSearchParams();
    const noGuildTicket = render(<TicketDetailPage />);
    await waitFor(() => expect(screen.getByText(/no guild selected/i)).toBeInTheDocument());
    noGuildTicket.unmount();

    mockSearchParamsState.value = new URLSearchParams('guildId=guild-1');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'missing' }, { status: 404 }));
    const missingTicket = render(<TicketDetailPage />);
    await waitFor(() => expect(screen.getByText(/ticket not found/i)).toBeInTheDocument());
    missingTicket.unmount();

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ id: 9, guild_id: 'guild-1', user_id: 'user-1', topic: null, status: 'open', thread_id: 'thread-1', channel_id: null, closed_by: null, close_reason: null, created_at: '2026-04-28T08:00:00Z', closed_at: null, transcript: null }));
    render(<TicketDetailPage />);
    await waitFor(() => expect(screen.getByText('Open')).toBeInTheDocument());
    expect(screen.queryByText('Topic')).not.toBeInTheDocument();
    expect(screen.getByText('Transcript will be saved when the ticket is closed.')).toBeInTheDocument();
  });

  it('covers member detail errors, fallback fields, and failed actions', async () => {
    mockParams.userId = 'user-2';
    mockGuildSelection.mockReturnValue(null);
    const noMember = render(<MemberDetailPage />);
    expect(screen.getByText(/no member selected/i)).toBeInTheDocument();
    noMember.unmount();

    mockGuildSelection.mockReturnValue('guild-1');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'missing' }, { status: 404 }));
    const missing = render(<MemberDetailPage />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Member not found'));
    await userEvent.click(screen.getByRole('button', { name: /back to members/i }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/members');
    missing.unmount();

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        id: 'user-2', username: 'grace', displayName: null, avatar: 'https://cdn.example/avatar.png', roles: [], joinedAt: null,
        stats: null,
        reputation: { xp: 500, level: 9, messages_count: 0, voice_minutes: 0, helps_given: 0, last_xp_gain: null, current_level_xp: null, next_level_xp: null },
        warnings: { count: 0, recent: [] },
      }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Bad amount' }, { status: 400 }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 500 }));
    render(<MemberDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'grace' })).toBeInTheDocument());
    expect(screen.getByText(/clean record/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/delta amount/i), { target: { value: '25' } });
    await userEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('XP adjustment failed', expect.any(Object)));
    await userEvent.click(screen.getByRole('button', { name: /download archive/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Export failed', expect.any(Object)));
  });

  it('covers community fallback metadata and empty public sections', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({}, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 500 }));

    await expect(generateCommunityMetadata({ params: Promise.resolve({ guildId: 'guild-empty' }) })).resolves.toMatchObject({
      description: 'Explore our community leaderboard, project showcases, and stats.',
    });
    render(await CommunityPage({ params: Promise.resolve({ guildId: 'guild-empty' }) }));
    expect(screen.getByText(/no public members yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/project showcase/i)).not.toBeInTheDocument();

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, { status: 404 }));
    await expect(generateProfileMetadata({ params: Promise.resolve({ guildId: 'guild-1', userId: 'missing' }) })).resolves.toMatchObject({ title: 'Profile Not Found' });
  });
});

describe('community public page variants', () => {
  it('covers community rank, avatar, contributor, and showcase link variants', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        memberCount: 5,
        totalMessagesSent: 1000,
        activeProjects: 2,
        challengesCompleted: 1,
        topContributors: [
          { userId: 'c1', username: 'grace', displayName: undefined, avatar: 'https://cdn.example/grace.png', xp: 3000, level: 6, badge: 'Builder' },
          { userId: 'c2', username: 'linus', displayName: 'Linus', avatar: null, xp: 2500, level: 5, badge: 'Reviewer' },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        members: [
          { userId: 'u2', username: 'grace', displayName: 'Grace', avatar: 'https://cdn.example/grace.png', xp: 1400, level: 4, badge: 'Helper', rank: 2, currentLevelXp: 1000, nextLevelXp: 1500 },
          { userId: 'u3', username: 'linus', displayName: 'Linus', avatar: null, xp: 1300, level: 3, badge: 'Guide', rank: 3, currentLevelXp: 1500, nextLevelXp: 1500 },
          { userId: 'u4', username: 'margaret', displayName: 'Margaret', avatar: null, xp: 900, level: 2, badge: 'Member', rank: 4, currentLevelXp: 500, nextLevelXp: 1000 },
        ],
        total: 3,
      }))
      .mockResolvedValueOnce(jsonResponse({
        projects: [
          { id: 11, title: 'Live Demo', description: 'Running app', tech: ['Next'], repoUrl: null, liveUrl: 'https://example.com/live', authorName: 'Grace', authorAvatar: 'https://cdn.example/grace.png', upvotes: 7, createdAt: '2026-04-28T08:00:00Z' },
          { id: 12, title: 'Private Notes', description: 'No links', tech: [], repoUrl: null, liveUrl: null, authorName: 'Linus', authorAvatar: null, upvotes: 0, createdAt: '2026-04-28T08:00:00Z' },
        ],
        total: 2,
      }));

    render(await CommunityPage({ params: Promise.resolve({ guildId: 'guild-rich' }) }));

    expect(screen.getByText('🥈')).toBeInTheDocument();
    expect(screen.getByText('🥉')).toBeInTheDocument();
    expect(screen.getByText('#4')).toBeInTheDocument();
    expect(screen.getByText(/Top Contributors/)).toBeInTheDocument();
    expect(screen.getByText('Live Demo')).toBeInTheDocument();
    expect(screen.getByLabelText('View live demo')).toHaveAttribute('href', 'https://example.com/live');
    expect(screen.getByText('Private Notes')).toBeInTheDocument();
  });

  it('covers community profile avatar, maxed XP, and hidden optional sections', async () => {
    const profile = {
      username: 'hopper',
      displayName: 'Grace Hopper',
      avatar: 'https://cdn.example/hopper.png',
      xp: 5000,
      level: 10,
      currentLevelXp: 5000,
      nextLevelXp: 5000,
      badge: 'Admiral',
      joinedAt: null,
      stats: { messagesSent: 1000, reactionsGiven: 10, reactionsReceived: 15, daysActive: 99 },
      projects: [],
      recentBadges: [],
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(profile))
      .mockResolvedValueOnce(jsonResponse(profile));

    await expect(generateProfileMetadata({ params: Promise.resolve({ guildId: 'guild-1', userId: 'hopper' }) })).resolves.toMatchObject({
      openGraph: { images: [{ url: 'https://cdn.example/hopper.png', width: 128, height: 128 }] },
    });

    render(await ProfilePage({ params: Promise.resolve({ guildId: 'guild-1', userId: 'hopper' }) }));

    expect(screen.getByAltText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText(/Joined/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Badges' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Projects' })).not.toBeInTheDocument();
  });
});
