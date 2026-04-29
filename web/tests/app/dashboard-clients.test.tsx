import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPush,
  mockReplace,
  mockGuildSelection,
  mockUseGuildChannels,
  mockConversationsState,
  mockConversationsReset,
  mockMembersState,
  mockModerationState,
  mockTicketsState,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockGuildSelection: vi.fn(),
  mockUseGuildChannels: vi.fn(),
  mockConversationsState: {} as Record<string, unknown>,
  mockConversationsReset: vi.fn(),
  mockMembersState: {} as Record<string, unknown>,
  mockModerationState: {} as Record<string, unknown>,
  mockTicketsState: {} as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    // biome-ignore lint/a11y/useAltText: the test forwards the component alt prop
    <img alt={alt} {...props} />
  ),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const createComponent = (tag: string) =>
    React.forwardRef(
      (
        {
          animate: _animate,
          exit: _exit,
          initial: _initial,
          transition: _transition,
          whileHover: _whileHover,
          whileTap: _whileTap,
          ...props
        }: Record<string, unknown> & { children?: React.ReactNode },
        ref,
      ) => React.createElement(tag, { ...props, ref }, props.children),
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: createComponent('div'),
      span: createComponent('span'),
    },
  };
});

vi.mock('@/hooks/use-guild-selection', () => ({
  useGuildSelection: (opts?: { onGuildChange?: () => void }) => mockGuildSelection(opts),
}));

vi.mock('@/components/layout/channel-directory-context', () => ({
  useGuildChannels: (guildId: string | null) => mockUseGuildChannels(guildId),
}));

vi.mock('@/components/dashboard/empty-state', () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock('@/components/dashboard/member-table', () => ({
  MemberTable: ({
    members,
    onSort,
    onLoadMore,
    onRowClick,
  }: {
    members: Array<{ id: string; username: string }>;
    onSort: (column: 'xp') => void;
    onLoadMore: () => void;
    onRowClick: (id: string) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onSort('xp')}>Sort XP</button>
      <button type="button" onClick={() => onSort('messages' as 'xp')}>Sort messages</button>
      <button type="button" onClick={onLoadMore}>Load more</button>
      {members.map((member) => (
        <button type="button" key={member.id} onClick={() => onRowClick(member.id)}>
          {member.username}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/dashboard/case-table', () => ({
  CaseTable: ({
    data,
    onPageChange,
    onSortToggle,
    onActionFilterChange,
    onUserSearchChange,
    onClearFilters,
  }: {
    data: { cases?: Array<{ id: string }> } | null;
    onPageChange: (page: number) => void;
    onSortToggle: () => void;
    onActionFilterChange: (action: string) => void;
    onUserSearchChange: (value: string) => void;
    onClearFilters: () => void;
  }) => (
    <div data-testid="case-table">
      <span>cases:{data?.cases?.length ?? 0}</span>
      <button type="button" onClick={() => onPageChange(2)}>Page 2</button>
      <button type="button" onClick={onSortToggle}>Toggle sort</button>
      <button type="button" onClick={() => onActionFilterChange('ban')}>Ban filter</button>
      <button type="button" onClick={() => onUserSearchChange('user-1')}>User filter</button>
      <button type="button" onClick={onClearFilters}>Clear filters</button>
    </div>
  ),
}));

vi.mock('@/components/dashboard/moderation-stats', () => ({
  ModerationStats: ({ stats }: { stats: { totalCases?: number } | null }) => (
    <div data-testid="moderation-stats">stats:{stats?.totalCases ?? 0}</div>
  ),
}));

vi.mock('@/stores/conversations-store', () => {
  const useConversationsStore = Object.assign(() => mockConversationsState, {
    getState: () => ({ reset: mockConversationsReset }),
  });
  return { useConversationsStore };
});

vi.mock('@/stores/members-store', () => ({
  useMembersStore: () => mockMembersState,
}));

vi.mock('@/stores/moderation-store', () => ({
  useModerationStore: () => mockModerationState,
}));

vi.mock('@/stores/tickets-store', () => ({
  useTicketsStore: () => mockTicketsState,
}));

import DashboardAiRedirectClient from '@/app/dashboard/ai/dashboard-ai-redirect-client';
import ConversationsClient from '@/app/dashboard/conversations/conversations-client';
import MembersClient from '@/app/dashboard/members/members-client';
import ModerationClient from '@/app/dashboard/moderation/moderation-client';
import TicketsClient from '@/app/dashboard/tickets/tickets-client';

function resetState() {
  vi.clearAllMocks();
  mockGuildSelection.mockReturnValue('guild-1');
  mockUseGuildChannels.mockReturnValue({
    channels: [
      { id: 'channel-1', name: 'general', type: 0 },
      { id: 'voice-1', name: 'Voice', type: 2 },
    ],
  });

  Object.assign(mockConversationsState, {
    conversations: [
      {
        id: 'conversation-1',
        channelName: 'general',
        participants: [
          { userId: 'user-1', username: 'Ada', avatar: null, role: 'user' },
          { userId: 'bot-1', username: 'Bot', avatar: null, role: 'assistant' },
        ],
        messageCount: 3,
        firstMessageAt: '2026-04-28T08:00:00Z',
        lastMessageAt: '2026-04-28T08:02:00Z',
        preview: 'Hello bot',
      },
    ],
    total: 30,
    loading: false,
    error: null,
    currentOpts: { search: '', channel: '', page: 1 },
    fetch: vi.fn().mockResolvedValue('ok'),
  });

  Object.assign(mockMembersState, {
    members: [{ id: 'user-1', username: 'Ada' }],
    nextAfter: 'cursor-2',
    total: 51,
    filteredTotal: 1,
    loading: false,
    error: null,
    search: 'ada',
    debouncedSearch: 'ada',
    sortColumn: 'xp',
    sortOrder: 'desc',
    setSearch: vi.fn(),
    setDebouncedSearch: vi.fn(),
    setSortColumn: vi.fn(),
    setSortOrder: vi.fn(),
    resetPagination: vi.fn(),
    resetAll: vi.fn(),
    fetchMembers: vi.fn().mockResolvedValue('ok'),
  });

  Object.assign(mockModerationState, {
    page: 1,
    sortDesc: true,
    actionFilter: 'all',
    userSearch: '',
    userHistoryInput: 'user-1',
    lookupUserId: 'user-1',
    userHistoryPage: 1,
    casesData: { cases: [{ id: 'case-1' }], total: 1 },
    casesLoading: false,
    casesError: null,
    stats: { totalCases: 7 },
    statsLoading: false,
    statsError: null,
    userHistoryData: { cases: [{ id: 'case-2' }], total: 1 },
    userHistoryLoading: false,
    userHistoryError: null,
    setPage: vi.fn(),
    toggleSortDesc: vi.fn(),
    setActionFilter: vi.fn(),
    setUserSearch: vi.fn(),
    setUserHistoryInput: vi.fn(),
    setLookupUserId: vi.fn(),
    setUserHistoryPage: vi.fn(),
    clearFilters: vi.fn(),
    clearUserHistory: vi.fn(),
    resetOnGuildChange: vi.fn(),
    fetchStats: vi.fn().mockResolvedValue('ok'),
    fetchCases: vi.fn().mockResolvedValue('ok'),
    fetchUserHistory: vi.fn().mockResolvedValue('ok'),
  });

  Object.assign(mockTicketsState, {
    tickets: [
      {
        id: 42,
        topic: '',
        user_id: 'user-1',
        status: 'open',
        created_at: '2026-04-28T08:00:00Z',
        closed_at: null,
      },
      {
        id: 43,
        topic: 'Billing',
        user_id: 'user-2',
        status: 'closed',
        created_at: '2026-04-27T08:00:00Z',
        closed_at: '2026-04-27T09:30:00Z',
      },
    ],
    total: 50,
    stats: { openCount: 3, avgResolutionSeconds: 90 * 60, ticketsThisWeek: 5 },
    loading: false,
    error: null,
    page: 1,
    statusFilter: '',
    search: 'user',
    debouncedSearch: 'user',
    setPage: vi.fn(),
    setStatusFilter: vi.fn(),
    setSearch: vi.fn(),
    setDebouncedSearch: vi.fn(),
    resetAll: vi.fn(),
    fetchStats: vi.fn().mockResolvedValue('ok'),
    fetchTickets: vi.fn().mockResolvedValue('ok'),
  });
}

beforeEach(() => {
  resetState();
});

describe('dashboard client components', () => {
  it('renders the AI redirect countdown and supports manual navigation', async () => {
    render(<DashboardAiRedirectClient />);

    expect(screen.getByRole('heading', { name: /coming soon/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /skip countdown/i }));

    expect(mockPush).toHaveBeenCalledWith('/dashboard/conversations');
  });



  it('auto-redirects the AI page after the countdown reaches zero', async () => {
    vi.useFakeTimers();
    try {
      render(<DashboardAiRedirectClient />);
      for (let i = 0; i < 6; i += 1) {
        await act(async () => {
          vi.advanceTimersByTime(1_000);
        });
      }
      expect(mockPush).toHaveBeenCalledWith('/dashboard/conversations');
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders conversations for a selected guild and fetches with filters', async () => {
    render(<ConversationsClient />);

    expect(screen.getByText('Total Conversations')).toBeInTheDocument();
    expect(screen.getByTitle('Ada (user)')).toBeInTheDocument();
    expect(screen.getByText(/Hello bot/)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockConversationsState.fetch).toHaveBeenCalledWith('guild-1', {
        search: '',
        channel: '',
        page: 1,
      });
    });

    fireEvent.click(screen.getByText(/Hello bot/).closest('tr') as HTMLElement);
    expect(mockPush).toHaveBeenCalledWith('/dashboard/conversations/conversation-1?guildId=guild-1');
  });



  it('covers alternate conversation render states', async () => {
    mockConversationsState.conversations = [];
    mockConversationsState.loading = true;
    const { rerender, unmount } = render(<ConversationsClient />);
    expect(screen.getAllByText('Channel')[0]).toBeInTheDocument();

    mockConversationsState.loading = false;
    mockConversationsState.error = 'Fetch failed';
    rerender(<ConversationsClient />);
    expect(screen.getByRole('alert')).toHaveTextContent('Fetch failed');

    unmount();
    mockConversationsState.error = null;
    mockConversationsState.currentOpts = { search: 'missing', channel: '', page: 1 };
    render(<ConversationsClient />);
    expect(screen.getByText('No matching conversations')).toBeInTheDocument();
  });

  it('renders conversation avatars, overflow participants, and pagination controls', async () => {
    mockConversationsState.conversations = [
      {
        id: 'conversation-2',
        channelName: 'support',
        participants: [
          { userId: 'u1', username: 'Ada', avatar: 'https://cdn.example/avatar.png', role: 'user' },
          { userId: 'u2', username: 'Grace', avatar: null, role: 'user' },
          { userId: 'u3', username: 'Bot', avatar: null, role: 'assistant' },
          { userId: 'u4', username: 'Linus', avatar: null, role: 'user' },
        ],
        messageCount: 1,
        firstMessageAt: '2026-04-28T08:00:00Z',
        lastMessageAt: '2026-04-28T10:15:00Z',
        preview: 'Long thread',
      },
    ];
    mockConversationsState.total = 60;
    mockConversationsState.currentOpts = { search: '', channel: '', page: 2 };

    render(<ConversationsClient />);

    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('2h 15m')).toBeInTheDocument();
    fireEvent.error(screen.getByAltText('Ada'));
    await userEvent.click(screen.getByRole('button', { name: /previous/i }));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
  });

  it('renders the conversations empty prompt when no guild is selected', () => {
    mockGuildSelection.mockReturnValue(null);

    render(<ConversationsClient />);

    expect(screen.getByText('Select a server')).toBeInTheDocument();
  });

  it('renders members, clears search, sorts, loads more, and opens rows', async () => {
    render(<MembersClient />);

    expect(screen.getByText('Total Members')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(mockMembersState.setSearch).toHaveBeenCalledWith('');
    expect(mockMembersState.setDebouncedSearch).toHaveBeenCalledWith('');

    await userEvent.click(screen.getByRole('button', { name: /sort xp/i }));
    expect(mockMembersState.setSortOrder).toHaveBeenCalledWith('asc');
    expect(mockMembersState.resetPagination).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(mockMembersState.fetchMembers).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-1', after: 'cursor-2', append: true }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Ada' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/members/user-1?guildId=guild-1');
  });



  it('renders alternate members states and sort paths', async () => {
    mockMembersState.error = 'Member fetch failed';
    mockMembersState.total = 0;
    mockMembersState.filteredTotal = null;
    mockMembersState.nextAfter = null;
    const { rerender } = render(<MembersClient />);

    expect(screen.getByRole('alert')).toHaveTextContent('Member fetch failed');
    await userEvent.click(screen.getByRole('button', { name: /sort messages/i }));
    expect(mockMembersState.setSortColumn).toHaveBeenCalledWith('messages');
    expect(mockMembersState.setSortOrder).toHaveBeenCalledWith('desc');

    mockGuildSelection.mockReturnValue(null);
    rerender(<MembersClient />);
    expect(screen.getByText('Choose a server from the sidebar to view members.')).toBeInTheDocument();
  });

  it('redirects members to login on unauthorized fetch', async () => {
    mockMembersState.fetchMembers = vi.fn().mockResolvedValue('unauthorized');

    render(<MembersClient />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('renders moderation stats, case controls, and user history lookup', async () => {
    render(<ModerationClient />);

    expect(screen.getByTestId('moderation-stats')).toHaveTextContent('stats:7');
    expect(screen.getByText(/History for/)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockModerationState.fetchStats).toHaveBeenCalledWith('guild-1', expect.any(Object));
      expect(mockModerationState.fetchCases).toHaveBeenCalledWith('guild-1', expect.any(Object));
      expect(mockModerationState.fetchUserHistory).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        1,
        expect.any(Object),
      );
    });

    await userEvent.click(screen.getAllByRole('button', { name: /page 2/i })[0]);
    expect(mockModerationState.setPage).toHaveBeenCalledWith(2);

    await userEvent.click(screen.getByRole('button', { name: /look up/i }));
    expect(mockModerationState.setLookupUserId).toHaveBeenCalledWith('user-1');
    expect(mockModerationState.setUserHistoryPage).toHaveBeenCalledWith(1);

    await userEvent.click(screen.getByRole('button', { name: /clear user history/i }));
    expect(mockModerationState.clearUserHistory).toHaveBeenCalled();
  });



  it('renders moderation empty guild and empty history states', () => {
    mockGuildSelection.mockReturnValue(null);
    const { rerender } = render(<ModerationClient />);
    expect(screen.getByText('Choose a server from the sidebar to view moderation data.')).toBeInTheDocument();

    mockGuildSelection.mockReturnValue('guild-1');
    mockModerationState.lookupUserId = '';
    mockModerationState.userHistoryInput = '';
    rerender(<ModerationClient />);
    expect(screen.getByText('Search a user')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /look up/i })).toBeDisabled();
  });

  it('renders tickets, clears filters, pages, and opens rows', async () => {
    render(<TicketsClient />);

    expect(screen.getByText('Open Tickets')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('No topic')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockTicketsState.fetchStats).toHaveBeenCalledWith('guild-1', expect.any(AbortSignal));
      expect(mockTicketsState.fetchTickets).toHaveBeenCalledWith(
        expect.objectContaining({ guildId: 'guild-1', user: 'user', page: 1 }),
      );
    });

    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(mockTicketsState.setSearch).toHaveBeenCalledWith('');
    expect(mockTicketsState.setPage).toHaveBeenCalledWith(1);

    fireEvent.keyDown(screen.getByText('#42').closest('tr') as HTMLElement, { key: ' ' });
    expect(mockPush).toHaveBeenCalledWith('/dashboard/tickets/42?guildId=guild-1');

    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(mockTicketsState.setPage).toHaveBeenCalledWith(2);
  });



  it('renders alternate ticket loading, empty, and paging states', async () => {
    mockTicketsState.tickets = [];
    mockTicketsState.loading = true;
    mockTicketsState.stats = { openCount: 0, avgResolutionSeconds: 0, ticketsThisWeek: 0 };
    const { rerender } = render(<TicketsClient />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(screen.getAllByText('ID')[0]).toBeInTheDocument();

    mockTicketsState.loading = false;
    mockTicketsState.total = 0;
    mockTicketsState.statusFilter = 'open';
    mockTicketsState.search = '';
    mockTicketsState.debouncedSearch = '';
    rerender(<TicketsClient />);
    expect(screen.getByText('No matching tickets')).toBeInTheDocument();

    mockTicketsState.tickets = [
      {
        id: 99,
        topic: 'Old ticket',
        user_id: 'user-9',
        status: 'closed',
        created_at: '2026-04-20T08:00:00Z',
        closed_at: '2026-04-23T10:00:00Z',
      },
    ];
    mockTicketsState.total = 75;
    mockTicketsState.page = 2;
    mockTicketsState.stats = { openCount: 1, avgResolutionSeconds: 90_000, ticketsThisWeek: 2 };
    rerender(<TicketsClient />);
    expect(screen.getByText('1d 1h')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(mockTicketsState.setPage).toHaveBeenCalledWith(1);
  });

  it('redirects tickets to login when the ticket fetch is unauthorized', async () => {
    mockTicketsState.fetchTickets = vi.fn().mockResolvedValue('unauthorized');

    render(<TicketsClient />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });
});
