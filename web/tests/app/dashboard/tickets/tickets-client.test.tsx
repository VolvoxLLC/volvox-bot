import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPush, mockReplace, mockGuildSelection, mockTicketsState } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockGuildSelection: vi.fn(),
  mockTicketsState: {} as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('@/hooks/use-guild-selection', () => ({
  useGuildSelection: mockGuildSelection,
}));

vi.mock('@/components/dashboard/empty-state', async () => ({
  EmptyState: (await import('../helpers/client-test-mocks')).MockEmptyState,
}));

vi.mock('@/stores/tickets-store', () => ({
  useTicketsStore: () => mockTicketsState,
}));

import TicketsClient from '@/app/dashboard/tickets/tickets-client';

function resetState() {
  vi.clearAllMocks();
  mockGuildSelection.mockReturnValue('guild-1');

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

describe('TicketsClient', () => {
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
