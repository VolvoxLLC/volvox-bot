'use client';

import { Activity, Bot, Coins, MessageSquare, RefreshCw, UserPlus, Users } from 'lucide-react';
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

    return params.toString();
  }, [channelFilter, customFromApplied, customToApplied, rangePreset]);

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

  const kpis = analytics?.kpis;
  const showKpiSkeleton = loading && !analytics;

  return (
    <div className="space-y-6">
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

      {/* KPI cards with loading skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {showKpiSkeleton ? (
          Array.from({ length: 5 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total messages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {kpis ? formatNumber(kpis.totalMessages) : '\u2014'}
                  </span>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">AI requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {kpis ? formatNumber(kpis.aiRequests) : '\u2014'}
                  </span>
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">AI cost (est.)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {kpis ? formatUsd(kpis.aiCostUsd) : '\u2014'}
                  </span>
                  <Coins className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {kpis ? formatNumber(kpis.activeUsers) : '\u2014'}
                  </span>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">New members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {kpis ? formatNumber(kpis.newMembers) : '\u2014'}
                  </span>
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </>
        )}
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
              <p aria-label="Online members value" className="mt-2 text-2xl font-semibold">
                {analytics == null
                  ? '\u2014'
                  : analytics.realtime.onlineMembers === null
                    ? 'N/A'
                    : formatNumber(analytics.realtime.onlineMembers)}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" />
                Active AI conversations
              </div>
              <p aria-label="Active AI conversations value" className="mt-2 text-2xl font-semibold">
                {loading || analytics == null
                  ? '\u2014'
                  : analytics.realtime.activeAiConversations === null
                    ? 'N/A'
                    : formatNumber(analytics.realtime.activeAiConversations)}
              </p>
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
            {(analytics?.channelActivity ?? []).map((channel) => (
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
            <CardTitle>Channel activity</CardTitle>
            <CardDescription>Most active channels in the selected period.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics?.channelActivity ?? []}
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
                      const selected = analytics?.channelActivity[index]?.channelId;
                      if (!selected) return;
                      setChannelFilter((current) => (current === selected ? null : selected));
                    }}
                  >
                    {(analytics?.channelActivity ?? []).map((channel) => (
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
                            title={`${day} ${hour}:00 \u2014 ${value} messages`}
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
    </div>
  );
}
