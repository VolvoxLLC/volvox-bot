import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReplace, mockGuildSelection, mockModerationState } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockGuildSelection: vi.fn(),
  mockModerationState: {} as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
}));

vi.mock('@/hooks/use-guild-selection', () => ({
  useGuildSelection: mockGuildSelection,
}));

vi.mock('@/components/dashboard/empty-state', async () => ({
  EmptyState: (await import('../helpers/client-test-mocks')).MockEmptyState,
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
      <button type="button" onClick={() => onPageChange(2)}>
        Page 2
      </button>
      <button type="button" onClick={onSortToggle}>
        Toggle sort
      </button>
      <button type="button" onClick={() => onActionFilterChange('ban')}>
        Ban filter
      </button>
      <button type="button" onClick={() => onUserSearchChange('user-1')}>
        User filter
      </button>
      <button type="button" onClick={onClearFilters}>
        Clear filters
      </button>
    </div>
  ),
}));

vi.mock('@/components/dashboard/moderation-stats', () => ({
  ModerationStats: ({ stats }: { stats: { totalCases?: number } | null }) => (
    <div data-testid="moderation-stats">stats:{stats?.totalCases ?? 0}</div>
  ),
}));

vi.mock('@/stores/moderation-store', () => ({
  useModerationStore: () => mockModerationState,
}));

import ModerationClient from '@/app/dashboard/moderation/moderation-client';

function resetState() {
  vi.clearAllMocks();
  mockGuildSelection.mockReturnValue('guild-1');

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
}

beforeEach(() => {
  resetState();
});

describe('ModerationClient', () => {
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
    expect(
      screen.getByText('Choose a server from the sidebar to view moderation data.'),
    ).toBeInTheDocument();

    mockGuildSelection.mockReturnValue('guild-1');
    mockModerationState.lookupUserId = '';
    mockModerationState.userHistoryInput = '';
    rerender(<ModerationClient />);
    expect(screen.getByText('Search a user')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /look up/i })).toBeDisabled();
  });
});
