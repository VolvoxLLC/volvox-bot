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
});
