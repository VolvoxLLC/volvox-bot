"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Coins,
  MessageSquare,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
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
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  GUILD_SELECTED_EVENT,
  SELECTED_GUILD_KEY,
} from "@/lib/guild-selection";
import type {
  AnalyticsRangePreset,
  DashboardAnalytics,
} from "@/types/analytics";

const RANGE_PRESETS: Array<{ label: string; value: AnalyticsRangePreset }> = [
  { label: "Today", value: "today" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Custom", value: "custom" },
];

const PIE_COLORS = ["#5865F2", "#22C55E", "#F59E0B", "#A855F7", "#06B6D4"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateInput(dateInput: string): {
  year: number;
  monthIndex: number;
  day: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
    return null;
  }

  return { year, monthIndex, day };
}

function startOfDayIso(dateInput: string): string {
  const parsed = parseLocalDateInput(dateInput);
  if (!parsed) return `${dateInput}T00:00:00.000Z`;

  return new Date(
    parsed.year,
    parsed.monthIndex,
    parsed.day,
    0,
    0,
    0,
    0,
  ).toISOString();
}

function endOfDayIso(dateInput: string): string {
  const parsed = parseLocalDateInput(dateInput);
  if (!parsed) return `${dateInput}T23:59:59.999Z`;

  return new Date(
    parsed.year,
    parsed.monthIndex,
    parsed.day,
    23,
    59,
    59,
    999,
  ).toISOString();
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export function AnalyticsDashboard() {
  const [now] = useState(() => new Date());
  const [guildId, setGuildId] = useState<string | null>(null);
  const [rangePreset, setRangePreset] = useState<AnalyticsRangePreset>("week");
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedGuild = window.localStorage.getItem(SELECTED_GUILD_KEY);
      if (savedGuild) {
        setGuildId(savedGuild);
      }
    } catch {
      // localStorage may be unavailable in strict browser contexts
    }

    const handleGuildSelect = (event: Event) => {
      const selectedGuild = (event as CustomEvent<string>).detail;
      if (!selectedGuild) return;
      setGuildId(selectedGuild);
      setChannelFilter(null);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SELECTED_GUILD_KEY || !event.newValue) return;
      setGuildId(event.newValue);
      setChannelFilter(null);
    };

    window.addEventListener(
      GUILD_SELECTED_EVENT,
      handleGuildSelect as EventListener,
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        GUILD_SELECTED_EVENT,
        handleGuildSelect as EventListener,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("range", rangePreset);

    if (rangePreset === "custom") {
      params.set("from", startOfDayIso(customFromApplied));
      params.set("to", endOfDayIso(customToApplied));
    }

    // Only set interval for non-custom ranges; let server auto-detect for custom ranges
    if (rangePreset !== "custom") {
      params.set("interval", rangePreset === "today" ? "hour" : "day");
    }

    if (channelFilter) {
      params.set("channelId", channelFilter);
    }

    return params.toString();
  }, [channelFilter, customFromApplied, customToApplied, rangePreset]);

  const fetchAnalytics = useCallback(
    async (backgroundRefresh = false) => {
      if (!guildId) return;

      // Abort any previous in-flight request before starting a new one.
      // Always uses the ref-based controller so both the initial load
      // and background refresh share a single cancellation path.
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (!backgroundRefresh) {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await fetch(
          `/api/guilds/${guildId}/analytics?${queryString}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (response.status === 401) {
          window.location.href = "/login";
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
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "Failed to fetch analytics";
          throw new Error(message);
        }

        setAnalytics(payload as DashboardAnalytics);
        setLastUpdatedAt(new Date());
      } catch (fetchError) {
        // Don't treat aborted fetches as errors
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to fetch analytics",
        );
      } finally {
        // Only reset loading if this request is still the current one.
        // When fetchAnalytics is called again, the previous request
        // is aborted and a new controller replaces the ref. Without this
        // guard the aborted request's finally block would set loading=false,
        // cancelling out the new request's loading=true.
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
      setCustomRangeError("Select both a from and to date.");
      return;
    }

    if (customFromDraft > customToDraft) {
      setCustomRangeError("\"From\" date must be on or before \"To\" date.");
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
        label: "Tokens",
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
          <CardDescription>
            Choose a server from the sidebar to load analytics.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const kpis = analytics?.kpis;

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
              Last updated {lastUpdatedAt.toLocaleTimeString()}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {RANGE_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              variant={rangePreset === preset.value ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setRangePreset(preset.value);
                if (preset.value !== "custom") {
                  setCustomRangeError(null);
                }
              }}
            >
              {preset.label}
            </Button>
          ))}

          {rangePreset === "custom" ? (
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
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/50">
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                {kpis ? formatNumber(kpis.totalMessages) : "—"}
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
                {kpis ? formatNumber(kpis.aiRequests) : "—"}
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
                {kpis ? formatUsd(kpis.aiCostUsd) : "—"}
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
                {kpis ? formatNumber(kpis.activeUsers) : "—"}
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
                {kpis ? formatNumber(kpis.newMembers) : "—"}
              </span>
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Real-time indicators</CardTitle>
            <CardDescription>
              Live status updates every 30 seconds.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="h-4 w-4" />
                Online members
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {analytics == null
                  ? "—"
                  : analytics.realtime.onlineMembers === null
                    ? "N/A"
                    : formatNumber(analytics.realtime.onlineMembers)}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" />
                Active AI conversations
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(analytics?.realtime.activeAiConversations ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Channel filter</CardTitle>
            <CardDescription>
              Click a channel in the chart to filter all metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={channelFilter === null ? "default" : "outline"}
              onClick={() => setChannelFilter(null)}
            >
              All channels
            </Button>
            {(analytics?.channelActivity ?? []).map((channel) => (
              <Button
                key={channel.channelId}
                size="sm"
                variant={channelFilter === channel.channelId ? "default" : "outline"}
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
            <CardDescription>
              Messages and AI requests over the selected range.
            </CardDescription>
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
            <CardDescription>
              Request distribution by model and token usage.
            </CardDescription>
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
                  <Bar
                    dataKey="completion"
                    name="Completion tokens"
                    fill="#22C55E"
                  />
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
            <CardDescription>
              Most active channels in the selected period.
            </CardDescription>
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
                      setChannelFilter((current) =>
                        current === selected ? null : selected,
                      );
                    }}
                  >
                    {(analytics?.channelActivity ?? []).map((channel) => (
                      <Cell
                        key={channel.channelId}
                        fill={
                          channel.channelId === channelFilter
                            ? "#5865F2"
                            : "#22C55E"
                        }
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
            <CardDescription>
              Message density by day of week and hour of day.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th scope="col" className="w-14 text-left text-muted-foreground">Day</th>
                  {HOURS.map((hour) => (
                    <th
                      key={hour}
                      scope="col"
                      className="text-center text-[10px] text-muted-foreground"
                    >
                      {hour % 3 === 0 ? hour : ""}
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
                                  ? "transparent"
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
