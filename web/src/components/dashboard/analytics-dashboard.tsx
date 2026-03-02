'use client';

import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  Coins,
  Download,
  FileText,
  Heart,
  Star,
  MessageSquare,
  Minus,
  RefreshCw,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { exportAnalyticsPdf } from '@/lib/analytics-pdf';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import {
  endOfDayIso,
  formatDateInput,
  formatLastUpdatedTime,
  formatNumber,
  formatUsd,
  startOfDayIso,
} from '@/lib/analytics-utils';
import type { AnalyticsRangePreset, DashboardAnalytics } from '@/types/analytics';
import { isDashboardAnalyticsPayload } from '@/types/analytics-validators';

const RANGE_PRESETS: Array<{ label: string; value: AnalyticsRangePreset }> = [
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Custom', value: 'custom' },
];

const PIE_COLORS = ['#5865F2', '#22C55E', '#F59E0B', '#A855F7', '#06B6D4'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type KpiCard = {
  label: string;
  value: number | undefined;
  previous: number | undefined;
  icon: typeof MessageSquare;
  format: (value: number) => string;
};

function KpiSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

function escapeCsvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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

export function AnalyticsDashboard() {
  const [now] = useState(() => new Date());
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

        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const message =
            typeof payload === 'object' &&
            payload !== null &&
            'error' in payload &&
            typeof payload.error === 'string'
              ? payload.error
              : 'Failed to fetch analytics';
          throw new Error(message);
        }

        if (!isDashboardAnalyticsPayload(payload)) {
          throw new Error('Invalid analytics payload from server');
        }

        setAnalytics(payload);
        setLastUpdatedAt(new Date());
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch analytics');
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
        fill: PIE_COLORS[index % PIE_COLORS.length],
      })),
    [analytics?.aiUsage.byModel],
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

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Usage trends, AI performance, and community activity for your server.
          </p>
          {lastUpdatedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {showKpiSkeleton
          ? (['kpi-0', 'kpi-1', 'kpi-2', 'kpi-3', 'kpi-4'] as const).map((key) => (
              <KpiSkeleton key={key} />
            ))
          : kpiCards.map((card) => {
              const Icon = card.icon;
              const value = card.value ?? 0;
              const hasComparison = compareMode && analytics?.comparison != null;
              const delta =
                hasComparison && card.previous != null
                  ? toDeltaPercent(value, card.previous)
                  : null;

              const deltaColor =
                delta === null
                  ? 'text-muted-foreground'
                  : delta > 0
                    ? 'text-emerald-600'
                    : delta < 0
                      ? 'text-rose-600'
                      : 'text-muted-foreground';

              return (
                <Card key={card.label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold">
                        {analytics ? card.format(value) : '\u2014'}
                      </span>
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    {hasComparison ? (
                      <div className={`mt-2 flex items-center gap-1 text-xs ${deltaColor}`}>
                        {delta === null ? (
                          <Minus className="h-3 w-3" />
                        ) : delta > 0 ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : delta < 0 ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                        <span>{formatDeltaPercent(delta)} vs previous period</span>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Real-time indicators</CardTitle>
            <CardDescription>Live status updates every 30 seconds.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="h-4 w-4" />
                Online members
              </div>
              <output
                className="mt-2 block text-2xl font-semibold"
                aria-label="Online members value"
              >
                {analytics == null
                  ? '\u2014'
                  : analytics.realtime.onlineMembers === null
                    ? 'N/A'
                    : formatNumber(analytics.realtime.onlineMembers)}
              </output>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" />
                Active AI conversations
              </div>
              <output
                className="mt-2 block text-2xl font-semibold"
                aria-label="Active AI conversations value"
              >
                {loading || analytics == null
                  ? '\u2014'
                  : analytics.realtime.activeAiConversations === null
                    ? 'N/A'
                    : formatNumber(analytics.realtime.activeAiConversations)}
              </output>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Channel filter</CardTitle>
            <CardDescription>Click a channel in the chart to filter all metrics.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={channelFilter === null ? 'default' : 'outline'}
              onClick={() => setChannelFilter(null)}
            >
              All channels
            </Button>
            {topChannels.map((channel) => (
              <Button
                key={channel.channelId}
                size="sm"
                variant={channelFilter === channel.channelId ? 'default' : 'outline'}
                onClick={() =>
                  setChannelFilter((current) =>
                    current === channel.channelId ? null : channel.channelId,
                  )
                }
              >
                {channel.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Message volume</CardTitle>
            <CardDescription>Messages and AI requests over the selected range.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics?.messageVolume ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" minTickGap={20} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="messages"
                    name="Messages"
                    stroke="#5865F2"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="aiRequests"
                    name="AI Requests"
                    stroke="#22C55E"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI usage breakdown</CardTitle>
            <CardDescription>Request distribution by model and token usage.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={modelUsageData}
                    dataKey="requests"
                    nameKey="model"
                    outerRadius={80}
                    label
                  >
                    {modelUsageData.map((entry) => (
                      <Cell key={entry.model} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tokenBreakdownData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="prompt" name="Prompt tokens" fill="#5865F2" />
                  <Bar dataKey="completion" name="Completion tokens" fill="#22C55E" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top channels breakdown</CardTitle>
            <CardDescription>
              Channels ranked by message volume in the selected period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topChannels}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 24, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120} />
                  <Tooltip />
                  <Bar
                    dataKey="messages"
                    fill="#22C55E"
                    radius={[0, 6, 6, 0]}
                    onClick={(_value, index) => {
                      const selected = topChannels[index]?.channelId;
                      if (!selected) return;
                      setChannelFilter((current) => (current === selected ? null : selected));
                    }}
                  >
                    {topChannels.map((channel) => (
                      <Cell
                        key={channel.channelId}
                        fill={channel.channelId === channelFilter ? '#5865F2' : '#22C55E'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Command usage stats</CardTitle>
            <CardDescription>Most used slash commands for the selected range.</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics?.commandUsage?.items?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th scope="col" className="py-2 pr-2">
                        Command
                      </th>
                      <th scope="col" className="py-2 text-right">
                        Uses
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.commandUsage.items.map((entry) => (
                      <tr key={entry.command} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-mono text-xs">/{entry.command}</td>
                        <td className="py-2 text-right font-semibold">
                          {formatNumber(entry.uses)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                {analytics?.commandUsage?.source === 'unavailable'
                  ? 'Command usage source is currently unavailable. Showing empty state until telemetry is ready.'
                  : 'No command usage found for this range.'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(analytics?.userEngagement ?? analytics?.xpEconomy) ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {analytics?.userEngagement ? (
            <Card>
              <CardHeader>
                <CardTitle>User engagement metrics</CardTitle>
                <CardDescription>
                  Aggregate engagement from message and reaction activity.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Tracked users
                  </div>
                  <output className="mt-2 block text-2xl font-semibold" aria-label="Tracked users value">
                    {formatNumber(analytics.userEngagement.trackedUsers)}
                  </output>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MessageSquare className="h-4 w-4" />
                    Avg messages / user
                  </div>
                  <output className="mt-2 block text-2xl font-semibold" aria-label="Average messages per user value">
                    {analytics.userEngagement.avgMessagesPerUser.toFixed(1)}
                  </output>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Heart className="h-4 w-4" />
                    Reactions given
                  </div>
                  <output className="mt-2 block text-2xl font-semibold" aria-label="Total reactions given value">
                    {formatNumber(analytics.userEngagement.totalReactionsGiven)}
                  </output>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    Reactions received
                  </div>
                  <output className="mt-2 block text-2xl font-semibold" aria-label="Total reactions received value">
                    {formatNumber(analytics.userEngagement.totalReactionsReceived)}
                  </output>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {analytics?.xpEconomy ? (
            <Card>
              <CardHeader>
                <CardTitle>XP economy</CardTitle>
                <CardDescription>Reputation and level distribution across members.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Users with XP
                  </div>
                  <output className="mt-2 block text-2xl font-semibold" aria-label="Users with XP value">
                    {formatNumber(analytics.xpEconomy.totalUsers)}
                  </output>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star className="h-4 w-4" />
                    Total XP distributed
                  </div>
                  <output className="mt-2 block text-2xl font-semibold" aria-label="Total XP distributed value">
                    {formatNumber(analytics.xpEconomy.totalXp)}
                  </output>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    Average level
                  </div>
                  <output className="mt-2 block text-2xl font-semibold" aria-label="Average level value">
                    {analytics.xpEconomy.avgLevel.toFixed(1)}
                  </output>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star className="h-4 w-4" />
                    Highest level
                  </div>
                  <output className="mt-2 block text-2xl font-semibold" aria-label="Highest level value">
                    {formatNumber(analytics.xpEconomy.maxLevel)}
                  </output>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Activity heatmap</CardTitle>
          <CardDescription>Message density by day of week and hour of day.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th scope="col" className="w-14 text-left text-muted-foreground">
                  Day
                </th>
                {HOURS.map((hour) => (
                  <th
                    key={hour}
                    scope="col"
                    className="text-center text-[10px] text-muted-foreground"
                  >
                    {hour % 3 === 0 ? hour : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, dayIndex) => (
                <tr key={day}>
                  <th scope="row" className="pr-2 text-muted-foreground">
                    {day}
                  </th>
                  {HOURS.map((hour) => {
                    const value = heatmapLookup.map.get(`${dayIndex}-${hour}`) ?? 0;
                    const alpha =
                      value === 0 || heatmapLookup.max === 0
                        ? 0
                        : 0.2 + (value / heatmapLookup.max) * 0.8;

                    return (
                      <td key={`${day}-${hour}`}>
                        <div
                          title={`${day} ${hour}:00 — ${value} messages`}
                          className="h-4 rounded-sm border"
                          style={{
                            backgroundColor:
                              value === 0
                                ? 'transparent'
                                : `rgba(88, 101, 242, ${alpha.toFixed(3)})`,
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
