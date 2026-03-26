'use client';

import {
  Bot,
  Coins,
  Download,
  FileText,
  MessageSquare,
  RefreshCw,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useChartTheme } from '@/hooks/use-chart-theme';
import { useGlowCard } from '@/hooks/use-glow-card';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { exportAnalyticsPdf } from '@/lib/analytics-pdf';
import {
  endOfDayIso,
  formatDateInput,
  formatLastUpdatedTime,
  formatNumber,
  formatUsd,
  startOfDayIso,
} from '@/lib/analytics-utils';
import { extractApiError, isAbortError, safeParseJson, toErrorMessage } from '@/lib/api-utils';
import type { AnalyticsRangePreset, DashboardAnalytics } from '@/types/analytics';
import { isDashboardAnalyticsPayload } from '@/types/analytics-validators';
import {
  ActivityHeatmapCard,
  AiUsageCard,
  ChannelFilterCard,
  CommandUsageCard,
  escapeCsvCell,
  formatDeltaPercent,
  type KpiCard,
  KpiCardItem,
  KpiSkeleton,
  MessageVolumeCard,
  RealtimeIndicatorsCard,
  TopChannelsCard,
  toDeltaPercent,
  UserEngagementCard,
  XpEconomyCard,
} from './analytics-dashboard-sections';

const RANGE_PRESETS: Array<{ label: string; value: AnalyticsRangePreset }> = [
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Custom', value: 'custom' },
];


export function AnalyticsDashboard() {
  const [now] = useState(() => new Date());
  const chart = useChartTheme();
  const guildId = useGuildSelection({
    onGuildChange: () => setChannelFilter(null),
  });
  const [rangePreset, setRangePreset] = useState<AnalyticsRangePreset>('week');
  const [customFromDraft, setCustomFromDraft] = useState<string>(
    formatDateInput(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
  );
  const [customToDraft, setCustomToDraft] = useState<string>(formatDateInput(now));
  const [customFromApplied, setCustomFromApplied] = useState<string>(
    formatDateInput(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
  );
  const [customToApplied, setCustomToApplied] = useState<string>(formatDateInput(now));
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useGlowCard();

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('range', rangePreset);

    if (rangePreset === 'custom') {
      params.set('from', startOfDayIso(customFromApplied));
      params.set('to', endOfDayIso(customToApplied));
    }

    if (rangePreset !== 'custom') {
      params.set('interval', rangePreset === 'today' ? 'hour' : 'day');
    }

    if (channelFilter) {
      params.set('channelId', channelFilter);
    }

    if (compareMode) {
      params.set('compare', '1');
    }

    return params.toString();
  }, [channelFilter, compareMode, customFromApplied, customToApplied, rangePreset]);

  const fetchAnalytics = useCallback(
    async (backgroundRefresh = false) => {
      if (!guildId) return;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (!backgroundRefresh) {
        setLoading(true);
      }
      setError(null);

      try {
        const encodedGuildId = encodeURIComponent(guildId);
        const response = await fetch(`/api/guilds/${encodedGuildId}/analytics?${queryString}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }

        const payload = await safeParseJson(response);

        if (!response.ok) {
          throw new Error(extractApiError(payload, 'Failed to fetch analytics'));
        }

        if (!isDashboardAnalyticsPayload(payload)) {
          throw new Error('Invalid analytics payload from server');
        }

        setAnalytics(payload);
        setLastUpdatedAt(new Date());
      } catch (fetchError) {
        if (isAbortError(fetchError)) return;
        setError(toErrorMessage(fetchError, 'Failed to fetch analytics'));
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [guildId, queryString],
  );

  useEffect(() => {
    void fetchAnalytics();
    return () => abortControllerRef.current?.abort();
  }, [fetchAnalytics]);

  useEffect(() => {
    if (!guildId) return;

    const intervalId = window.setInterval(() => {
      void fetchAnalytics(true);
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [fetchAnalytics, guildId]);

  const applyCustomRange = () => {
    if (!customFromDraft || !customToDraft) {
      setCustomRangeError('Select both a from and to date.');
      return;
    }

    if (customFromDraft > customToDraft) {
      setCustomRangeError('"From" date must be on or before "To" date.');
      return;
    }

    setCustomRangeError(null);
    setCustomFromApplied(customFromDraft);
    setCustomToApplied(customToDraft);
  };

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

  const topChannels = analytics?.topChannels ?? analytics?.channelActivity ?? [];
  const canShowNoDataStates = !loading && analytics !== null;

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
        label: 'AI cost (est.)',
        value: analytics?.kpis.aiCostUsd,
        previous: analytics?.comparison?.kpis.aiCostUsd,
        icon: Coins,
        format: formatUsd,
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
      },
    ],
    [analytics],
  );

  const exportCsv = useCallback(() => {
    if (!analytics) return;

    const rows: string[] = [];
    rows.push('# Analytics export');
    rows.push(`# Generated at,${escapeCsvCell(new Date().toISOString())}`);
    rows.push(`# Guild ID,${escapeCsvCell(analytics.guildId)}`);
    rows.push(`# Range,${escapeCsvCell(analytics.range.type)}`);
    rows.push(`# From,${escapeCsvCell(analytics.range.from)}`);
    rows.push(`# To,${escapeCsvCell(analytics.range.to)}`);
    rows.push(`# Interval,${escapeCsvCell(analytics.range.interval)}`);
    rows.push(`# Channel filter,${escapeCsvCell(analytics.range.channelId ?? 'all')}`);
    rows.push(`# Compare mode,${escapeCsvCell(compareMode ? 'enabled' : 'disabled')}`);
    rows.push('');

    rows.push('KPI,Current,Previous,DeltaPercent');
    for (const card of kpiCards) {
      const current = card.value ?? 0;
      const hasComparison = compareMode && analytics.comparison != null;
      const previous = hasComparison ? (card.previous ?? null) : null;
      const delta = hasComparison && previous !== null ? toDeltaPercent(current, previous) : null;

      rows.push(
        [
          escapeCsvCell(card.label),
          escapeCsvCell(current),
          escapeCsvCell(previous),
          escapeCsvCell(delta === null ? null : Number(delta.toFixed(2))),
        ].join(','),
      );
    }

    rows.push('');
    rows.push('Top Channels');
    rows.push('Channel ID,Channel Name,Messages');
    for (const channel of topChannels) {
      rows.push(
        [
          escapeCsvCell(channel.channelId),
          escapeCsvCell(channel.name),
          escapeCsvCell(channel.messages),
        ].join(','),
      );
    }

    rows.push('');
    rows.push('Command Usage');
    rows.push(`# Source,${escapeCsvCell(analytics.commandUsage?.source ?? 'unavailable')}`);
    rows.push('Command,Uses');
    for (const entry of analytics.commandUsage?.items ?? []) {
      rows.push([escapeCsvCell(entry.command), escapeCsvCell(entry.uses)].join(','));
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-${analytics.guildId}-${analytics.range.type}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }, [analytics, compareMode, kpiCards, topChannels]);

  if (!guildId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Select a server</CardTitle>
          <CardDescription>Choose a server from the sidebar to load analytics.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const showKpiSkeleton = loading && !analytics;
  const hasComparison = compareMode && analytics?.comparison != null;

  return (
    <div className="space-y-6 overflow-x-hidden">
      <DashboardHeader
        lastUpdatedAt={lastUpdatedAt}
        rangePreset={rangePreset}
        setRangePreset={setRangePreset}
        compareMode={compareMode}
        setCompareMode={setCompareMode}
        customFromDraft={customFromDraft}
        setCustomFromDraft={setCustomFromDraft}
        customToDraft={customToDraft}
        setCustomToDraft={setCustomToDraft}
        customRangeError={customRangeError}
        setCustomRangeError={setCustomRangeError}
        applyCustomRange={applyCustomRange}
        loading={loading}
        analytics={analytics}
        fetchAnalytics={fetchAnalytics}
        exportCsv={exportCsv}
      />

      {error ? (
        <Card className="border-destructive/50" role="alert">
          <CardHeader>
            <CardTitle className="text-destructive">Failed to load analytics</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void fetchAnalytics()}>Try again</Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 stagger-fade-in">
        {showKpiSkeleton
          ? (['kpi-0', 'kpi-1', 'kpi-2', 'kpi-3', 'kpi-4'] as const).map((key) => (
              <KpiSkeleton key={key} />
            ))
          : kpiCards.map((card) => (
              <KpiCardItem
                key={card.label}
                card={card}
                compareMode={compareMode}
                hasAnalytics={analytics !== null}
                hasComparison={hasComparison}
              />
            ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RealtimeIndicatorsCard analytics={analytics} loading={loading} />
        <ChannelFilterCard
          channelFilter={channelFilter}
          setChannelFilter={setChannelFilter}
          topChannels={topChannels}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <MessageVolumeCard
          data={analytics?.messageVolume ?? []}
          chart={chart}
          canShowNoDataStates={canShowNoDataStates}
        />
        <AiUsageCard
          modelUsageData={modelUsageData}
          tokenBreakdownData={tokenBreakdownData}
          chart={chart}
          canShowNoDataStates={canShowNoDataStates}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <TopChannelsCard
          topChannels={topChannels}
          channelFilter={channelFilter}
          setChannelFilter={setChannelFilter}
          chart={chart}
          canShowNoDataStates={canShowNoDataStates}
        />
        <CommandUsageCard analytics={analytics} canShowNoDataStates={canShowNoDataStates} />
      </div>

      {(analytics?.userEngagement ?? analytics?.xpEconomy) ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {analytics ? <UserEngagementCard analytics={analytics} /> : null}
          {analytics ? <XpEconomyCard analytics={analytics} /> : null}
        </div>
      ) : null}

      <ActivityHeatmapCard heatmapLookup={heatmapLookup} chart={chart} />
    </div>
  );
}

// ---- Dashboard header (extracted to reduce main function complexity) ----

function DashboardHeader({
  lastUpdatedAt,
  rangePreset,
  setRangePreset,
  compareMode,
  setCompareMode,
  customFromDraft,
  setCustomFromDraft,
  customToDraft,
  setCustomToDraft,
  customRangeError,
  setCustomRangeError,
  applyCustomRange,
  loading,
  analytics,
  fetchAnalytics,
  exportCsv,
}: {
  lastUpdatedAt: Date | null;
  rangePreset: AnalyticsRangePreset;
  setRangePreset: (preset: AnalyticsRangePreset) => void;
  compareMode: boolean;
  setCompareMode: (updater: (current: boolean) => boolean) => void;
  customFromDraft: string;
  setCustomFromDraft: (value: string) => void;
  customToDraft: string;
  setCustomToDraft: (value: string) => void;
  customRangeError: string | null;
  setCustomRangeError: (value: string | null) => void;
  applyCustomRange: () => void;
  loading: boolean;
  analytics: DashboardAnalytics | null;
  fetchAnalytics: () => Promise<void>;
  exportCsv: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-gradient-primary">Analytics</span> Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground">
          Usage trends, AI performance, and community activity for your server.
        </p>
        {lastUpdatedAt ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="status-dot-live" style={{ width: 6, height: 6 }} />
            Last updated {formatLastUpdatedTime(lastUpdatedAt)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RANGE_PRESETS.map((preset) => (
          <Button
            key={preset.value}
            variant={rangePreset === preset.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setRangePreset(preset.value);
              if (preset.value !== 'custom') {
                setCustomRangeError(null);
              }
            }}
          >
            {preset.label}
          </Button>
        ))}

        <Button
          variant={compareMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCompareMode((current) => !current)}
        >
          Compare vs previous
        </Button>

        {rangePreset === 'custom' ? (
          <>
            <input
              aria-label="From date"
              type="date"
              value={customFromDraft}
              onChange={(event) => {
                setCustomFromDraft(event.target.value);
                setCustomRangeError(null);
              }}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            />
            <input
              aria-label="To date"
              type="date"
              value={customToDraft}
              onChange={(event) => {
                setCustomToDraft(event.target.value);
                setCustomRangeError(null);
              }}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            />
            <Button size="sm" onClick={applyCustomRange}>
              Apply
            </Button>
            {customRangeError ? (
              <p role="alert" className="text-xs text-destructive">
                {customRangeError}
              </p>
            ) : null}
          </>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void fetchAnalytics()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={exportCsv}
          disabled={!analytics}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => analytics && exportAnalyticsPdf(analytics)}
          disabled={!analytics}
        >
          <FileText className="h-4 w-4" />
          Export PDF
        </Button>
      </div>
    </div>
  );
}
