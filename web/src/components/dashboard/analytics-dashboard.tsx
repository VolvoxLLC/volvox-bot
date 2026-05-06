'use client';

import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  Heart,
  type LucideIcon,
  MessageSquare,
  Minus,
  Star,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { StableResponsiveContainer } from '@/components/ui/stable-responsive-container';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAnalytics } from '@/contexts/analytics-context';
import { useChartTheme } from '@/hooks/use-chart-theme';
import { useGlowCard } from '@/hooks/use-glow-card';
import { formatNumber } from '@/lib/analytics-utils';
import { cn } from '@/lib/utils';
import type { AnalyticsRangePreset } from '@/types/analytics';
import { DashboardCard } from './dashboard-card';
import { EmptyState } from './empty-state';

const _RANGE_PRESETS: Array<{ label: string; value: AnalyticsRangePreset }> = [
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Custom', value: 'custom' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type KpiCard = {
  label: string;
  value: number | null | undefined;
  previous: number | null | undefined;
  icon: typeof MessageSquare;
  format: (value: number) => string;
  animate?: boolean;
};

type MetricSummaryCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  accentClassName: string;
};

function MetricSummaryCard({ label, value, icon: Icon, accentClassName }: MetricSummaryCardProps) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/30 p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        <Icon className={cn('h-3.5 w-3.5', accentClassName)} />
        {label}
      </div>
      <output className="mt-2 block text-2xl font-bold tracking-tight text-foreground/90">
        {value}
      </output>
    </div>
  );
}

type RealtimeMetricCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  accentClassName: string;
  badgeClassName: string;
};

function RealtimeMetricCard({
  label,
  value,
  icon: Icon,
  accentClassName,
  badgeClassName,
}: RealtimeMetricCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/40 bg-muted/30 p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', badgeClassName)}>
          <Icon className={cn('h-3 w-3', accentClassName)} />
        </span>
        {label}
      </div>
      <output className="mt-3 block text-3xl font-bold tracking-tighter text-foreground/90">
        {value}
      </output>
    </div>
  );
}

function _KpiSkeleton() {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20 p-5 backdrop-blur-3xl">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-8 w-8 animate-pulse rounded-xl bg-muted/20" />
        <div className="h-3 w-20 animate-pulse rounded bg-muted/20" />
      </div>
      <div className="flex items-baseline justify-between">
        <div className="h-8 w-24 animate-pulse rounded bg-muted/20" />
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <div className="h-3 w-32 animate-pulse rounded bg-muted/20" />
      </div>
    </div>
  );
}

function toDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

function formatDeltaPercent(deltaPercent: number | null): string {
  if (deltaPercent === null) return '—';
  if (deltaPercent === 0) return '0%';
  return `${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(1)}%`;
}

type KpiCardState = {
  hasValue: boolean;
  numericValue: number;
  showComparison: boolean;
  delta: number | null;
};

function getKpiCardState(
  card: KpiCard,
  compareMode: boolean,
  hasComparison: boolean,
): KpiCardState {
  const value = card.value;
  const hasValue = value !== null && value !== undefined;
  const numericValue = hasValue ? value : 0;
  const previousValue = card.previous;
  const hasPreviousValue = previousValue !== null && previousValue !== undefined;
  const showComparison = compareMode && hasComparison && hasValue && hasPreviousValue;

  let delta: number | null = null;
  if (showComparison) {
    delta = toDeltaPercent(numericValue, previousValue);
  }

  return { hasValue, numericValue, showComparison, delta };
}

function getKpiValueContent(
  analyticsLoaded: boolean,
  card: KpiCard,
  state: KpiCardState,
): React.ReactNode {
  if (!analyticsLoaded) return '\u2014';
  if (!state.hasValue) return 'Unavailable';
  if (card.animate === false) return card.format(state.numericValue);
  return <AnimatedValue value={state.numericValue} format={card.format} />;
}

function getDeltaBadgeClassName(delta: number | null): string {
  if (delta === null || delta === 0) {
    return 'bg-muted/30 text-muted-foreground/70 border-border/30';
  }
  if (delta > 0) {
    return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]';
  }
  return 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.1)]';
}

function getDeltaIcon(delta: number | null): typeof Minus {
  if (delta === null || delta === 0) return Minus;
  return delta > 0 ? ArrowUp : ArrowDown;
}

function sanitizeVolumeLabel(label: string | null | undefined): string {
  const isMissingLabel = !label;
  const isInvalidDateLabel = label === 'Invalid Date';
  const includesInvalidNumber = label?.includes('NaN') === true;

  if (isMissingLabel || isInvalidDateLabel || includesInvalidNumber) {
    return `Unknown (${label || 'no label'})`;
  }

  return label;
}

type KpiMetricCardProps = Readonly<{
  card: KpiCard;
  analyticsLoaded: boolean;
  compareMode: boolean;
  hasComparison: boolean;
}>;

function KpiMetricCard({ card, analyticsLoaded, compareMode, hasComparison }: KpiMetricCardProps) {
  const Icon = card.icon;
  const state = getKpiCardState(card, compareMode, hasComparison);
  const DeltaIcon = getDeltaIcon(state.delta);

  return (
    <div className="glow-card group relative min-h-[11rem] overflow-hidden rounded-[20px] border border-border/40 bg-gradient-to-br from-background/40 to-muted/20 p-5 backdrop-blur-3xl transition-all duration-500 hover:border-border/60 hover:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.3)] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]">
      {/* Background ambient light & large icon */}
      <div className="absolute inset-0 bg-primary/[0.02] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <Icon className="absolute -bottom-4 -right-4 h-24 w-24 text-primary/[0.03] -rotate-12 transition-all duration-500 group-hover:scale-110 group-hover:text-primary/5 group-hover:-rotate-6" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary/10 text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] ring-1 ring-primary/20 group-hover:bg-primary/15 transition-all duration-300">
            <Icon className="h-4 w-4 drop-shadow-[0_0_8px_hsl(var(--primary))]" />
          </span>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 group-hover:text-foreground/80 transition-colors">
            {card.label}
          </h3>
        </div>

        <div className="flex items-baseline justify-between mt-1">
          <span className="text-3xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/60 drop-shadow-sm">
            {getKpiValueContent(analyticsLoaded, card, state)}
          </span>
        </div>

        {state.showComparison ? (
          <div
            className={cn(
              'mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] border transition-colors',
              getDeltaBadgeClassName(state.delta),
            )}
          >
            <DeltaIcon className="h-[10px] w-[10px]" />
            <span>{formatDeltaPercent(state.delta)}</span>
          </div>
        ) : (
          <div className="mt-3 h-[22px]" />
        )}
      </div>
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return `rgba(88, 101, 242, ${alpha})`;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Animated value (count-up) ──────────────────────────────────────────────

function AnimatedValue({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const start = prevRef.current;
    const diff = value - start;
    if (Math.abs(diff) < 0.01) {
      setDisplay(value);
      prevRef.current = value;
      return;
    }

    const duration = 1400;
    const startTime = performance.now();
    let cancelled = false;

    function step() {
      if (cancelled) return;
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(start + diff * eased);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setDisplay(value);
        prevRef.current = value;
      }
    }

    requestAnimationFrame(step);
    return () => {
      cancelled = true;
    };
  }, [value]);

  return <>{format(display)}</>;
}

// ─── Live activity feed (animated preview) ──────────────────────────────────

function FadeInLine({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let innerRaf = 0;
    const raf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(innerRaf);
    };
  }, []);

  return (
    <div
      className="text-[11px] text-muted-foreground/50 transition-all duration-500 ease-out"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(4px)' }}
    >
      <span className="text-primary/30 mr-1.5">›</span>
      {text}
    </div>
  );
}

const SAMPLE_ACTIVITY = [
  'User joined #general',
  'AI handled support ticket',
  'New ticket #1042 opened',
  'Config updated by admin',
  'XP awarded: @alex → Lv.15',
  'Warning issued to @spam_user',
  'Welcome message sent',
  'Level up: @jordan → Lv.22',
  'Bot responded in #help',
  'Member milestone reached',
];

function LiveActivityFeed() {
  const [lines, setLines] = useState<Array<{ id: number; text: string }>>([]);
  const idRef = useRef(0);

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      const newLine = {
        id: idRef.current++,
        text: SAMPLE_ACTIVITY[index % SAMPLE_ACTIVITY.length],
      };
      index++;
      setLines((prev) => [...prev.slice(-3), newLine]);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-4 space-y-1.5 min-h-[80px]">
      {lines.length === 0 && (
        <div className="text-[11px] text-muted-foreground/25 italic">Monitoring activity…</div>
      )}
      {lines.map((line) => (
        <FadeInLine key={line.id} text={line.text} />
      ))}
    </div>
  );
}

/**
 * Render the analytics dashboard UI showing workspace metrics, charts, and interactive filters.
 *
 * Renders KPI cards with optional comparison deltas, realtime metrics and activity feed, message
 * volume and AI usage charts, top channels and command telemetry tables, community engagement and
 * XP economy summaries, and an activity heatmap. Handles loading,
 * empty, and error states based on analytics data and exposes channel filtering and refresh actions
 * via hooks.
 *
 * @returns A React element representing the complete analytics dashboard interface
 */
export function AnalyticsDashboard() {
  const chart = useChartTheme();
  const { analytics, loading, error, compareMode, channelFilter, setChannelFilter, refresh } =
    useAnalytics();

  useGlowCard();

  const heatmapLookup = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;

    for (const bucket of analytics?.heatmap ?? []) {
      const key = `${bucket.dayOfWeek}-${bucket.hour}`;
      map.set(key, bucket.messages);
      max = Math.max(max, bucket.messages);
    }

    return { map, max };
  }, [analytics?.heatmap]);

  const modelUsageData = useMemo(
    () =>
      (analytics?.aiUsage.byModel ?? []).map((entry, index) => ({
        ...entry,
        fill: chart.palette[index % chart.palette.length],
      })),
    [analytics?.aiUsage.byModel, chart.palette],
  );

  const tokenBreakdownData = useMemo(
    () => [
      {
        label: 'Tokens',
        prompt: analytics?.aiUsage.tokens.prompt ?? 0,
        completion: analytics?.aiUsage.tokens.completion ?? 0,
      },
    ],
    [analytics?.aiUsage.tokens.completion, analytics?.aiUsage.tokens.prompt],
  );

  const sanitizedMessageVolume = useMemo(() => {
    if (!analytics?.messageVolume) return [];
    return analytics.messageVolume.map((pt) => ({
      ...pt,
      label: sanitizeVolumeLabel(pt.label),
    }));
  }, [analytics?.messageVolume]);

  const topChannels = analytics?.topChannels ?? analytics?.channelActivity ?? [];
  const hasMessageVolumeData = (analytics?.messageVolume?.length ?? 0) > 0;
  const hasModelUsageData = analytics != null && modelUsageData.length > 0;
  const hasTokenUsageData =
    analytics != null &&
    ((analytics.aiUsage.tokens.prompt ?? 0) > 0 || (analytics.aiUsage.tokens.completion ?? 0) > 0);
  const hasTopChannelsData = topChannels.length > 0;
  const canShowNoDataStates = !loading && analytics !== null;
  const realtimeMetrics = [
    {
      label: 'Active Sessions',
      value:
        analytics == null
          ? '\u2014'
          : analytics.realtime.onlineMembers === null
            ? 'N/A'
            : formatNumber(analytics.realtime.onlineMembers),
      icon: Activity,
      accentClassName: 'text-primary',
      badgeClassName: 'bg-primary/10',
    },
    {
      label: 'AI Workload',
      value:
        loading || analytics == null
          ? '\u2014'
          : analytics.realtime.activeAiConversations === null
            ? 'N/A'
            : formatNumber(analytics.realtime.activeAiConversations),
      icon: Bot,
      accentClassName: 'text-secondary',
      badgeClassName: 'bg-secondary/10',
    },
  ] as const;
  const engagementMetrics = analytics?.userEngagement
    ? [
        {
          label: 'Tracked users',
          value: formatNumber(analytics.userEngagement.trackedUsers),
          icon: Users,
          accentClassName: 'text-primary',
        },
        {
          label: 'Avg msgs / user',
          value: analytics.userEngagement.avgMessagesPerUser.toFixed(1),
          icon: MessageSquare,
          accentClassName: 'text-primary',
        },
        {
          label: 'Reactions given',
          value: formatNumber(analytics.userEngagement.totalReactionsGiven),
          icon: Heart,
          accentClassName: 'text-primary',
        },
        {
          label: 'Reactions received',
          value: formatNumber(analytics.userEngagement.totalReactionsReceived),
          icon: Activity,
          accentClassName: 'text-primary',
        },
      ]
    : null;
  const xpEconomyMetrics = analytics?.xpEconomy
    ? [
        {
          label: 'Users with XP',
          value: formatNumber(analytics.xpEconomy.totalUsers),
          icon: Users,
          accentClassName: 'text-secondary',
        },
        {
          label: 'Total XP Minted',
          value: formatNumber(analytics.xpEconomy.totalXp),
          icon: Star,
          accentClassName: 'text-secondary',
        },
        {
          label: 'Average Level',
          value: analytics.xpEconomy.avgLevel.toFixed(1),
          icon: Activity,
          accentClassName: 'text-secondary',
        },
        {
          label: 'Highest Level',
          value: formatNumber(analytics.xpEconomy.maxLevel),
          icon: Star,
          accentClassName: 'text-secondary',
        },
      ]
    : null;

  const kpiCards = useMemo<KpiCard[]>(
    () => [
      {
        label: 'Total messages',
        value: analytics?.kpis.totalMessages,
        previous: analytics?.comparison?.kpis.totalMessages,
        icon: MessageSquare,
        format: formatNumber,
      },
      {
        label: 'AI requests',
        value: analytics?.kpis.aiRequests,
        previous: analytics?.comparison?.kpis.aiRequests,
        icon: Bot,
        format: formatNumber,
      },
      {
        label: 'Active users',
        value: analytics?.kpis.activeUsers,
        previous: analytics?.comparison?.kpis.activeUsers,
        icon: Users,
        format: formatNumber,
      },
      {
        label: 'New members',
        value: analytics?.kpis.newMembers,
        previous: analytics?.comparison?.kpis.newMembers,
        icon: UserPlus,
        format: formatNumber,
        animate: false,
      },
    ],
    [analytics],
  );

  const showKpiSkeleton = loading && !analytics;
  const hasKpiComparison = compareMode && analytics?.comparison != null;

  return (
    <div className="space-y-6">
      {error ? (
        <div
          className="group relative overflow-hidden rounded-2xl border border-destructive/20 bg-destructive/5 p-6 backdrop-blur-xl"
          role="alert"
        >
          <div className="mb-4">
            <h2 className="text-sm font-semibold tracking-wide text-destructive">
              Failed to load analytics
            </h2>
            <p className="mt-1 text-[11px] text-destructive/80 uppercase tracking-wider">{error}</p>
          </div>
          <div>
            <Button onClick={() => refresh().catch(() => {})} variant="destructive" size="sm">
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger-fade-in">
        {showKpiSkeleton
          ? (['kpi-0', 'kpi-1', 'kpi-2', 'kpi-3'] as const).map((key) => (
              <div
                key={key}
                className="h-28 animate-pulse rounded-[20px] bg-muted/20 border border-border/10"
              />
            ))
          : kpiCards.map((card) => (
              <KpiMetricCard
                key={card.label}
                card={card}
                analyticsLoaded={analytics != null}
                compareMode={compareMode}
                hasComparison={hasKpiComparison}
              />
            ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-foreground/90">
                <span className="status-dot-live shadow-[0_0_8px_hsl(var(--destructive))]" />
                Real-Time Network
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                Recent Activity • 30s interval
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {realtimeMetrics.map((metric) => (
              <RealtimeMetricCard key={metric.label} {...metric} />
            ))}
          </div>
          <LiveActivityFeed />
        </DashboardCard>

        <DashboardCard>
          <div className="mb-5">
            <h2 className="text-sm font-semibold tracking-wide text-foreground/90">
              Workspace Filter
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
              Isolate metrics by channel
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={channelFilter === null ? 'default' : 'ghost'}
              onClick={() => setChannelFilter(null)}
              aria-pressed={channelFilter === null}
              className={cn(
                'rounded-full px-5 transition-all duration-300 font-bold text-[11px] uppercase',
                'tracking-wider',
                channelFilter === null
                  ? 'shadow-[0_0_20px_hsl(var(--primary)/0.25)]'
                  : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30',
              )}
            >
              System Wide
            </Button>
            {topChannels.map((channel) => {
              const isActive = channelFilter === channel.channelId;
              return (
                <Button
                  key={channel.channelId}
                  size="sm"
                  variant={isActive ? 'default' : 'ghost'}
                  aria-pressed={isActive}
                  className={cn(
                    'rounded-full px-5 transition-all duration-300 font-bold',
                    'text-[11px] uppercase tracking-wider',
                    isActive
                      ? 'shadow-[0_0_20px_hsl(var(--primary)/0.25)]'
                      : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30',
                  )}
                  onClick={() => setChannelFilter(isActive ? null : channel.channelId)}
                >
                  {channel.name}
                </Button>
              );
            })}
          </div>
        </DashboardCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <DashboardCard className="xl:col-span-6">
          <div className="mb-6">
            <h2 className="text-sm font-semibold tracking-wide text-foreground/90">
              Message Volume
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
              Messages and AI requests over time
            </p>
          </div>
          <div className="relative">
            {hasMessageVolumeData ? (
              <div className="h-[340px]">
                <StableResponsiveContainer>
                  <LineChart data={sanitizedMessageVolume}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      minTickGap={20}
                      tick={{ fill: chart.tooltipText, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      dy={10}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: chart.tooltipText, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      dx={-10}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: chart.tooltipBg,
                        borderColor: chart.tooltipBorder,
                        borderRadius: 12,
                        color: chart.tooltipText,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                    <Line
                      type="monotone"
                      dataKey="messages"
                      name="Messages"
                      stroke={chart.primary}
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="aiRequests"
                      name="AI Requests"
                      stroke={chart.success}
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </StableResponsiveContainer>
              </div>
            ) : canShowNoDataStates ? (
              <EmptyState
                icon={MessageSquare}
                title="No message volume yet"
                description="Run activity in this range to populate the trend chart."
                className="min-h-[340px] border-0 bg-transparent"
              />
            ) : (
              <div className="min-h-[340px]" aria-hidden="true" />
            )}
          </div>
        </DashboardCard>

        <div className="group relative overflow-hidden rounded-3xl border border-border/40 bg-muted/10 p-6 backdrop-blur-3xl xl:col-span-6">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black tracking-tight text-foreground/90">
                AI Usage Analysis
              </h2>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                Model requests and token volume
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Zap className="h-5 w-5" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20 p-5 transition-all hover:bg-muted/30">
              {hasModelUsageData ? (
                <div className="h-[140px]">
                  <StableResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={modelUsageData}
                        dataKey="requests"
                        nameKey="model"
                        outerRadius={60}
                        innerRadius={45}
                        strokeWidth={0}
                        labelLine={false}
                      >
                        {modelUsageData.map((entry) => (
                          <Cell key={entry.model} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: chart.tooltipBg,
                          borderColor: chart.tooltipBorder,
                          borderRadius: 12,
                          color: chart.tooltipText,
                        }}
                      />
                    </PieChart>
                  </StableResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-[140px] flex-col items-center justify-center text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary/40 shadow-[0_0_15px_rgba(var(--primary),0.1)] transition-transform group-hover:scale-110">
                    <Bot className="h-5 w-5" />
                  </div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">
                    No model usage
                  </h3>
                  <p className="mt-1 px-4 text-[10px] leading-relaxed text-muted-foreground/50">
                    Distribution appears after AI requests are processed.
                  </p>
                </div>
              )}
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20 p-5 transition-all hover:bg-muted/30">
              {hasTokenUsageData ? (
                <div className="h-[140px]">
                  <StableResponsiveContainer>
                    <BarChart data={tokenBreakdownData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={chart.grid}
                        vertical={false}
                        opacity={0.1}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: chart.tooltipText, fontSize: 9 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{
                          backgroundColor: chart.tooltipBg,
                          borderColor: chart.tooltipBorder,
                          borderRadius: 12,
                          color: chart.tooltipText,
                        }}
                      />
                      <Bar
                        dataKey="prompt"
                        fill={chart.primary}
                        radius={[2, 2, 0, 0]}
                        maxBarSize={20}
                      />
                      <Bar
                        dataKey="completion"
                        fill={chart.success}
                        radius={[2, 2, 0, 0]}
                        maxBarSize={20}
                      />
                    </BarChart>
                  </StableResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-[140px] flex-col items-center justify-center text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/5 text-emerald-500/40 shadow-[0_0_15px_rgba(34,197,94,0.1)] transition-transform group-hover:scale-110">
                    <Zap className="h-5 w-5" />
                  </div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">
                    No token metrics
                  </h3>
                  <p className="mt-1 px-4 text-[10px] leading-relaxed text-muted-foreground/50">
                    Metrics appear once usage is recorded.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <DashboardCard className="xl:col-span-6">
          <div className="mb-6">
            <h2 className="text-sm font-semibold tracking-wide text-foreground/90">Top Channels</h2>
            <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
              Most active workspaces by volume
            </p>
          </div>
          <div className="relative">
            {hasTopChannelsData ? (
              <div className="h-[340px]">
                <StableResponsiveContainer>
                  <BarChart
                    data={topChannels}
                    layout="vertical"
                    margin={{ top: 0, right: 0, left: 10, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: chart.tooltipText, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{
                        backgroundColor: chart.tooltipBg,
                        borderColor: chart.tooltipBorder,
                        borderRadius: 12,
                        color: chart.tooltipText,
                      }}
                    />
                    <Bar
                      dataKey="messages"
                      fill={chart.success}
                      radius={[0, 4, 4, 0]}
                      barSize={20}
                      className="cursor-pointer"
                      onClick={(_value, index) => {
                        const selected = topChannels[index]?.channelId;
                        if (!selected) return;
                        setChannelFilter((current) => (current === selected ? null : selected));
                      }}
                    >
                      {topChannels.map((channel) => (
                        <Cell
                          key={channel.channelId}
                          fill={channel.channelId === channelFilter ? chart.primary : chart.success}
                          className="transition-colors duration-300 hover:opacity-80"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </StableResponsiveContainer>
              </div>
            ) : canShowNoDataStates ? (
              <EmptyState
                icon={MessageSquare}
                title="No channel activity"
                description="Top channel breakdown appears when messages are recorded in the selected range."
                className="min-h-[340px] border-0 bg-transparent"
              />
            ) : (
              <div className="min-h-[340px]" aria-hidden="true" />
            )}
          </div>
        </DashboardCard>

        <DashboardCard className="xl:col-span-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-foreground/90">
                Command Telemetry
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                Slash command execution frequency
              </p>
            </div>
            {analytics?.commandUsage?.items?.length ? (
              <div className="flex items-center gap-2">
                <span className="status-dot-live shadow-[0_0_8px_hsl(var(--destructive))]" />
                <span className="text-2xl font-black tracking-tighter text-foreground/90">
                  {formatNumber(analytics.commandUsage.items.reduce((sum, e) => sum + e.uses, 0))}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  served
                </span>
              </div>
            ) : null}
          </div>
          <div className="relative">
            {analytics?.commandUsage?.items?.length ? (
              <div className="max-h-[340px] overflow-y-auto overflow-x-auto rounded-xl border border-border/40 bg-muted/30">
                <table className="w-full min-w-[320px] text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground/70">
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Command
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Invocations
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.commandUsage.items.map((entry) => (
                      <tr
                        key={entry.command}
                        className="border-b border-border/40 last:border-0 transition-colors hover:bg-muted/50"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-foreground/90">
                          /{entry.command}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground/90">
                          {formatNumber(entry.uses)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : canShowNoDataStates ? (
              <div className="rounded-xl border border-border/40 bg-muted/30 p-6 text-center text-sm text-muted-foreground/60">
                {analytics?.commandUsage?.source === 'unavailable'
                  ? 'Command usage source is currently unavailable. Showing empty state until telemetry is ready.'
                  : 'No command usage found for this range.'}
              </div>
            ) : (
              <div className="min-h-[120px]" aria-hidden="true" />
            )}
          </div>
        </DashboardCard>
      </div>

      {(analytics?.userEngagement ?? analytics?.xpEconomy) ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {analytics?.userEngagement ? (
            <DashboardCard>
              <div className="mb-6">
                <h2 className="text-sm font-semibold tracking-wide text-foreground/90">
                  Community Engagement
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                  Aggregate social interactions
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {engagementMetrics?.map((metric) => (
                  <MetricSummaryCard key={metric.label} {...metric} />
                ))}
              </div>
            </DashboardCard>
          ) : null}

          {analytics?.xpEconomy ? (
            <DashboardCard>
              <div className="mb-6">
                <h2 className="text-sm font-semibold tracking-wide text-foreground/90">
                  XP Economy
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                  Reputation and level distribution
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {xpEconomyMetrics?.map((metric) => (
                  <MetricSummaryCard key={metric.label} {...metric} />
                ))}
              </div>
            </DashboardCard>
          ) : null}
        </div>
      ) : null}

      <DashboardCard className="mb-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-foreground/90">
              Activity Heatmap
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
              Message density by day of week and hour
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className={cn(
                  'h-[13px] w-[13px] rounded-[3px] border',
                  level === 0
                    ? 'bg-black/5 border-black/5 dark:bg-white/5 dark:border-white/5'
                    : 'border-transparent',
                )}
                style={
                  level > 0
                    ? { backgroundColor: hexToRgba(chart.primary, 0.15 + level * 0.2125) }
                    : undefined
                }
              />
            ))}
            <span>More</span>
          </div>
        </div>
        <div className="overflow-x-auto pb-2">
          <TooltipProvider delayDuration={0}>
            <div
              className="grid w-full gap-[4px]"
              style={{ gridTemplateColumns: 'minmax(32px, auto) repeat(24, 1fr)' }}
            >
              {/* Hour labels row */}
              <div />
              {HOURS.map((hour) => (
                <div
                  key={`h-${hour}`}
                  className="flex items-end justify-center pb-1.5 text-[10px] font-bold text-muted-foreground/30"
                >
                  {hour % 3 === 0 ? `${hour}` : ''}
                </div>
              ))}

              {/* Day rows */}
              {DAYS.map((day, dayIndex) => (
                <React.Fragment key={day}>
                  <div className="flex items-center text-[11px] font-bold text-muted-foreground/40 pr-2">
                    {day}
                  </div>
                  {HOURS.map((hour) => {
                    const value = heatmapLookup.map.get(`${dayIndex}-${hour}`) ?? 0;
                    const ratio = heatmapLookup.max === 0 ? 0 : value / heatmapLookup.max;
                    const level =
                      value === 0
                        ? 0
                        : ratio <= 0.25
                          ? 1
                          : ratio <= 0.5
                            ? 2
                            : ratio <= 0.75
                              ? 3
                              : 4;

                    return (
                      <Tooltip key={`${day}-${hour}`}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              'aspect-square w-full rounded-[4px] border transition-all duration-200 hover:ring-2 hover:ring-primary/50 hover:scale-[1.15] hover:z-20 cursor-default',
                              level === 0
                                ? 'bg-black/5 border-black/5 dark:bg-white/5 dark:border-white/5'
                                : 'border-transparent',
                            )}
                            style={
                              level > 0
                                ? {
                                    backgroundColor: hexToRgba(
                                      chart.primary,
                                      0.15 + level * 0.2125,
                                    ),
                                  }
                                : undefined
                            }
                          />
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="flex flex-col gap-0.5 px-3 py-1.5 backdrop-blur-xl"
                        >
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                            {
                              [
                                'Sunday',
                                'Monday',
                                'Tuesday',
                                'Wednesday',
                                'Thursday',
                                'Friday',
                                'Saturday',
                              ][dayIndex]
                            }
                          </span>
                          <span className="text-xs font-bold tabular-nums">
                            {String(hour).padStart(2, '0')}:00 — {formatNumber(value)} message
                            {value !== 1 ? 's' : ''}
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </TooltipProvider>
        </div>
      </DashboardCard>
    </div>
  );
}
