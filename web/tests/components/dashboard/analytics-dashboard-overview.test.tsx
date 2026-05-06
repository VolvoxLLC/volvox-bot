import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardAnalytics } from '@/types/analytics';

const { analyticsPayload } = vi.hoisted(() => ({
  analyticsPayload: {
    guildId: 'guild-1',
    range: {
      type: 'week',
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-07T23:59:59.999Z',
      interval: 'day',
      channelId: null,
    },
    kpis: {
      totalMessages: 1234,
      aiRequests: 456,
      aiCostUsd: 12.34,
      activeUsers: 88,
      newMembers: 7,
    },
    realtime: {
      onlineMembers: 12,
      activeAiConversations: 3,
    },
    messageVolume: [
      {
        bucket: '2026-04-01T00:00:00.000Z',
        label: 'Apr 1',
        messages: 100,
        aiRequests: 20,
      },
    ],
    aiUsage: {
      source: 'ai_usage',
      byModel: [
        {
          model: 'claude-sonnet',
          requests: 456,
          promptTokens: 90000,
          completionTokens: 45000,
          costUsd: 12.34,
        },
      ],
      tokens: {
        prompt: 90000,
        completion: 45000,
      },
    },
    channelActivity: [
      {
        channelId: 'channel-1',
        name: 'general',
        messages: 500,
      },
    ],
    topChannels: [
      {
        channelId: 'channel-1',
        name: 'general',
        messages: 500,
      },
    ],
    commandUsage: {
      source: 'logs',
      items: [{ command: 'help', uses: 42 }],
    },
    comparison: {
      previousRange: {
        from: '2026-03-25T00:00:00.000Z',
        to: '2026-03-31T23:59:59.999Z',
      },
      kpis: {
        totalMessages: 1000,
        aiRequests: 400,
        aiCostUsd: 10,
        activeUsers: 70,
        newMembers: 6,
      },
    },
    heatmap: [
      {
        dayOfWeek: 1,
        hour: 10,
        messages: 12,
      },
    ],
    userEngagement: null,
    xpEconomy: null,
  } satisfies DashboardAnalytics,
}));

vi.mock('recharts', () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  return {
    Bar: Wrapper,
    BarChart: Wrapper,
    CartesianGrid: () => null,
    Cell: () => null,
    Legend: () => null,
    Line: () => null,
    LineChart: Wrapper,
    Pie: Wrapper,
    PieChart: Wrapper,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

vi.mock('@/contexts/analytics-context', () => ({
  useAnalytics: () => ({
    analytics: analyticsPayload,
    loading: false,
    error: null,
    compareMode: true,
    channelFilter: null,
    setChannelFilter: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-chart-theme', () => ({
  useChartTheme: () => ({
    grid: '#d1d5db',
    palette: ['#5865F2', '#16A34A'],
    primary: '#5865F2',
    success: '#16A34A',
    tooltipBg: '#fff',
    tooltipBorder: '#e5e7eb',
    tooltipText: '#111827',
  }),
}));

vi.mock('@/hooks/use-glow-card', () => ({
  useGlowCard: () => undefined,
}));

describe('AnalyticsDashboard overview', () => {

  afterEach(() => {
    analyticsPayload.kpis.activeUsers = 88;
    if (analyticsPayload.comparison) {
      analyticsPayload.comparison.kpis.activeUsers = 70;
      analyticsPayload.comparison.kpis.newMembers = 6;
    }
  });

  it('does not expose AI cost metrics on the overview dashboard', async () => {
    const { AnalyticsDashboard } = await import('@/components/dashboard/analytics-dashboard');

    render(<AnalyticsDashboard />);

    expect(screen.getByText('Total messages')).toBeInTheDocument();
    expect(screen.getByText('AI requests')).toBeInTheDocument();
    expect(screen.getByText('Active users')).toBeInTheDocument();
    expect(screen.getByText('New members')).toBeInTheDocument();
    expect(screen.queryByText('AI cost (est.)')).not.toBeInTheDocument();
    expect(screen.queryByText('AI Cost Analysis')).not.toBeInTheDocument();
    expect(screen.getByText('AI Usage Analysis')).toBeInTheDocument();
  });

  it('does not show a comparison delta when a KPI value is unavailable', async () => {
    analyticsPayload.kpis.activeUsers = null as unknown as number;

    const { AnalyticsDashboard } = await import('@/components/dashboard/analytics-dashboard');

    render(<AnalyticsDashboard />);

    expect(screen.getByText('Active users')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('-100.0%')).not.toBeInTheDocument();
  });

  it('does not show a comparison delta when the previous KPI value is unavailable', async () => {
    if (analyticsPayload.comparison) {
      analyticsPayload.comparison.kpis.newMembers = null as unknown as number;
    }

    const { AnalyticsDashboard } = await import('@/components/dashboard/analytics-dashboard');

    render(<AnalyticsDashboard />);

    expect(screen.getByText('New members')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('renders new members value as a plain formatted number immediately without animation', async () => {
    // analyticsPayload.kpis.newMembers = 7 (from vi.hoisted fixture)
    // The newMembers KPI card has animate: false, so getKpiValueContent returns
    // card.format(numericValue) as a plain string rather than an AnimatedValue component.
    // Other KPI cards (totalMessages=1234, aiRequests=456, activeUsers=88) use AnimatedValue
    // which starts at display=0 in useState — their final values are not visible on first render.
    const { AnalyticsDashboard } = await import('@/components/dashboard/analytics-dashboard');

    render(<AnalyticsDashboard />);

    // "7" is only visible immediately because of animate: false on the newMembers card
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('does not render totalMessages formatted value before AnimatedValue animation completes', async () => {
    // Contrasts with the animate:false behaviour of newMembers. totalMessages uses AnimatedValue
    // (no animate flag), which initialises display to 0. The animation advances via
    // requestAnimationFrame which does not fire synchronously in jsdom, so the final
    // formatted value "1,234" should not be present on the initial render.
    const { AnalyticsDashboard } = await import('@/components/dashboard/analytics-dashboard');

    render(<AnalyticsDashboard />);

    expect(screen.queryByText('1,234')).not.toBeInTheDocument();
  });

  it('renders new members as zero immediately when the count is 0', async () => {
    analyticsPayload.kpis.newMembers = 0;

    const { AnalyticsDashboard } = await import('@/components/dashboard/analytics-dashboard');

    render(<AnalyticsDashboard />);

    // With animate: false, format(0) = "0" is returned directly.
    // The New members label is present to confirm we are looking at the right card.
    expect(screen.getByText('New members')).toBeInTheDocument();
    // Verify the card section containing "New members" also contains "0".
    // querySelectorAll is used because AnimatedValue-based cards also start with "0".
    const newMembersCard = screen.getByText('New members').closest('[class*="glow-card"]');
    expect(newMembersCard).not.toBeNull();
    expect(newMembersCard).toHaveTextContent('0');

    analyticsPayload.kpis.newMembers = 7;
  });
});
