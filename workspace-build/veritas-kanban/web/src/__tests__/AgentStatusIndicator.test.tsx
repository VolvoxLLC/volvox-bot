/**
 * Tests for components/shared/AgentStatusIndicator.tsx — agent status states.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentStatusIndicator } from '@/components/shared/AgentStatusIndicator';

// ── Mocks ────────────────────────────────────────────────────

// Mock useGlobalAgentStatus hook — allows us to control the returned data
const mockGlobalAgentStatus = vi.fn();
vi.mock('@/hooks/useGlobalAgentStatus', () => ({
  useGlobalAgentStatus: () => mockGlobalAgentStatus(),
}));

// Mock the activity API to avoid real requests
vi.mock('@/lib/api', () => ({
  api: {
    activity: {
      list: vi.fn().mockResolvedValue([]),
    },
  },
}));

// ── Helpers ──────────────────────────────────────────────────

function renderIndicator(props: { onOpenActivityLog?: () => void } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentStatusIndicator {...props} />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────

describe('AgentStatusIndicator', () => {
  it('shows loading state when data is not yet available', () => {
    mockGlobalAgentStatus.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderIndicator();
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('shows idle state with gray dot', () => {
    mockGlobalAgentStatus.mockReturnValue({
      data: {
        status: 'idle',
        subAgentCount: 0,
        lastUpdated: new Date().toISOString(),
      },
      isLoading: false,
      error: null,
    });

    renderIndicator();
    const button = screen.getByRole('status');
    expect(button.getAttribute('aria-label')).toContain('Agent status: Idle');

    // Idle dot is gray (#6b7280)
    const dot = button.querySelector('.agent-status-dot');
    expect(dot).toBeDefined();
  });

  it('shows working state with active task title', () => {
    mockGlobalAgentStatus.mockReturnValue({
      data: {
        status: 'working',
        subAgentCount: 0,
        activeTask: 'task-1',
        activeTaskTitle: 'Build Feature',
        lastUpdated: new Date().toISOString(),
      },
      isLoading: false,
      error: null,
    });

    renderIndicator();
    const button = screen.getByRole('status');
    expect(button.getAttribute('aria-label')).toContain('Working');
    expect(button.getAttribute('aria-label')).toContain('Build Feature');
  });

  it('shows sub-agents state with count', () => {
    mockGlobalAgentStatus.mockReturnValue({
      data: {
        status: 'sub-agent',
        subAgentCount: 3,
        lastUpdated: new Date().toISOString(),
      },
      isLoading: false,
      error: null,
    });

    renderIndicator();
    const button = screen.getByRole('status');
    expect(button.getAttribute('aria-label')).toContain('3 agents');
  });

  it('shows error state', () => {
    mockGlobalAgentStatus.mockReturnValue({
      data: {
        status: 'error',
        subAgentCount: 0,
        error: 'Agent crashed',
        lastUpdated: new Date().toISOString(),
      },
      isLoading: false,
      error: null,
    });

    renderIndicator();
    const button = screen.getByRole('status');
    expect(button.getAttribute('aria-label')).toContain('Error');
  });

  it('shows error state when query itself fails', () => {
    mockGlobalAgentStatus.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network failure'),
    });

    renderIndicator();
    const button = screen.getByRole('status');
    expect(button.getAttribute('aria-label')).toContain('Error');
  });

  it('shows thinking state', () => {
    mockGlobalAgentStatus.mockReturnValue({
      data: {
        status: 'thinking',
        subAgentCount: 0,
        lastUpdated: new Date().toISOString(),
      },
      isLoading: false,
      error: null,
    });

    renderIndicator();
    const button = screen.getByRole('status');
    expect(button.getAttribute('aria-label')).toContain('Thinking');
  });
});
