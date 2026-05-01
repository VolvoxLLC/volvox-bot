import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPush,
  mockReplace,
  mockRouter,
  mockGuildSelection,
  mockUseGuildChannels,
  mockConversationsState,
  mockConversationsReset,
} = vi.hoisted(() => {
  const mockPush = vi.fn();
  const mockReplace = vi.fn();

  return {
    mockPush,
    mockReplace,
    mockRouter: { push: mockPush, replace: mockReplace },
    mockGuildSelection: vi.fn(),
    mockUseGuildChannels: vi.fn(),
    mockConversationsState: {} as Record<string, unknown>,
    mockConversationsReset: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    // biome-ignore lint/a11y/useAltText: the test forwards the component alt prop
    <img alt={alt} {...props} />
  ),
}));

vi.mock('@/hooks/use-guild-selection', () => ({
  useGuildSelection: (opts?: { onGuildChange?: () => void }) => mockGuildSelection(opts),
}));

vi.mock('@/components/layout/channel-directory-context', () => ({
  useGuildChannels: (guildId: string | null) => mockUseGuildChannels(guildId),
}));

vi.mock('@/components/dashboard/empty-state', async () => ({
  EmptyState: (await import('../helpers/client-test-mocks')).MockEmptyState,
}));

vi.mock('@/stores/conversations-store', () => {
  const useConversationsStore = Object.assign(() => mockConversationsState, {
    getState: () => mockConversationsState,
  });
  return { useConversationsStore };
});

import ConversationsClient from '@/app/dashboard/conversations/conversations-client';

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
    fetch: vi.fn().mockResolvedValue(undefined),
    reset: mockConversationsReset,
  });
}

beforeEach(() => {
  resetState();
});

describe('ConversationsClient', () => {
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

    const conversationRow = screen.getByText(/Hello bot/).closest('tr');
    if (!conversationRow) {
      throw new Error('Expected conversation preview to render inside a table row');
    }

    fireEvent.click(conversationRow);
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
    expect(screen.getByText('AD')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /previous/i }));
    await waitFor(() => {
      expect(mockConversationsState.fetch).toHaveBeenCalledWith(
        'guild-1',
        expect.objectContaining({ page: 1 }),
      );
    });

    const fetchConversations = mockConversationsState.fetch as ReturnType<typeof vi.fn>;
    fetchConversations.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(fetchConversations).toHaveBeenCalledTimes(1);
      expect(fetchConversations).toHaveBeenCalledWith(
        'guild-1',
        expect.objectContaining({ page: 2 }),
      );
    });
  });

  it('does not reset the initial page when the search value is already synced', async () => {
    mockConversationsState.currentOpts = { search: '', channel: '', page: 2 };
    const fetchConversations = mockConversationsState.fetch as ReturnType<typeof vi.fn>;

    render(<ConversationsClient />);

    await waitFor(() => {
      expect(fetchConversations).toHaveBeenCalledWith(
        'guild-1',
        expect.objectContaining({ page: 2 }),
      );
    });

    fetchConversations.mockClear();

    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(fetchConversations).not.toHaveBeenCalled();
  });

  it('clears a pending search debounce when search returns to the synced value', async () => {
    const fetchConversations = mockConversationsState.fetch as ReturnType<typeof vi.fn>;

    render(<ConversationsClient />);

    await waitFor(() => {
      expect(fetchConversations).toHaveBeenCalledWith(
        'guild-1',
        expect.objectContaining({ search: '' }),
      );
    });

    fetchConversations.mockClear();

    const searchInput = screen.getByLabelText('Search conversations');
    fireEvent.change(searchInput, { target: { value: 'ada' } });
    fireEvent.change(searchInput, { target: { value: '' } });

    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(fetchConversations).not.toHaveBeenCalled();
  });

  it('renders the conversations empty prompt when no guild is selected', () => {
    mockGuildSelection.mockReturnValue(null);

    render(<ConversationsClient />);

    expect(screen.getByText('Select a server')).toBeInTheDocument();
  });
});
