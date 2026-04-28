import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPush, mockReplace, mockGuildSelection, mockMembersState } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockGuildSelection: vi.fn(),
  mockMembersState: {} as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('@/hooks/use-guild-selection', () => ({
  useGuildSelection: (opts?: { onGuildChange?: () => void }) => mockGuildSelection(opts),
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
      <button type="button" onClick={() => onSort('xp')}>
        Sort XP
      </button>
      <button type="button" onClick={() => onSort('messages' as 'xp')}>
        Sort messages
      </button>
      <button type="button" onClick={onLoadMore}>
        Load more
      </button>
      {members.map((member) => (
        <button type="button" key={member.id} onClick={() => onRowClick(member.id)}>
          {member.username}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/stores/members-store', () => ({
  useMembersStore: () => mockMembersState,
}));

import MembersClient from '@/app/dashboard/members/members-client';

function resetState() {
  vi.clearAllMocks();
  mockGuildSelection.mockReturnValue('guild-1');

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
}

beforeEach(() => {
  resetState();
});

describe('MembersClient', () => {
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
});
