'use client';

import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  Coins,
  Heart,
  MessageSquare,
  Minus,
  Star,
  Users,
} from 'lucide-react';
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
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StableResponsiveContainer } from '@/components/ui/stable-responsive-container';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChartTheme } from '@/hooks/use-chart-theme';
import { formatNumber } from '@/lib/analytics-utils';
import type {
  ChannelBreakdownEntry,
  DashboardAnalytics,
  MessageVolumePoint,
} from '@/types/analytics';
import { EmptyState } from './empty-state';

// ---- helpers shared with the parent ----

export function toDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

export function formatDeltaPercent(deltaPercent: number | null): string {
  if (deltaPercent === null) return '—';
  if (deltaPercent === 0) return '0%';
  return `${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(1)}%`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return `rgba(88, 101, 242, ${alpha})`;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function escapeCsvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// ---- KPI types & components ----

export type KpiCard = {
  label: string;
  value: number | undefined;
  previous: number | undefined;
  icon: typeof MessageSquare;
  format: (value: number) => string;
};

export function KpiSkeleton() {
  return (
    <Card className="kpi-card">
      <CardHeader className="pb-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

function getDeltaColor(delta: number | null): string {
  if (delta === null) return 'text-muted-foreground';
  if (delta > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (delta < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-muted-foreground';
}

function DeltaIcon({ delta }: { delta: number | null }) {
  if (delta === null) return <Minus className="h-3 w-3" />;
  if (delta > 0) return <ArrowUp className="h-3 w-3" />;
  if (delta < 0) return <ArrowDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

export function KpiCardItem({
  card,
  hasAnalytics,
  hasComparison,
}: {
  card: KpiCard;
  hasAnalytics: boolean;
  hasComparison: boolean;
}) {
  const Icon = card.icon;
  const value = card.value ?? 0;
  const delta =
    hasComparison && card.previous != null ? toDeltaPercent(value, card.previous) : null;

  return (
    <Card key={card.label} className="kpi-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold tracking-tight">
            {hasAnalytics ? card.format(value) : '\u2014'}
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </span>
        </div>
        {hasComparison ? (
          <div
            className={`mt-2.5 flex items-center gap-1 text-xs font-medium ${getDeltaColor(delta)}`}
          >
            <DeltaIcon delta={delta} />
            <span>{formatDeltaPercent(delta)} vs previous period</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---- Realtime indicators ----

export function RealtimeIndicatorsCard({
  analytics,
  loading,
}: {
  analytics: DashboardAnalytics | null;
  loading: boolean;
}) {
  return (
    <Card className="glow-card rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="status-dot-live" />
          Real-time indicators
        </CardTitle>
        <CardDescription>Live status updates every 30 seconds.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <RealtimeMetric
          icon={<Activity className="h-3.5 w-3.5 text-primary" />}
          label="Online members"
          ariaLabel="Online members value"
          value={formatRealtimeValue(analytics?.realtime.onlineMembers ?? null, analytics !== null)}
          colorScheme="primary"
        />
        <RealtimeMetric
          icon={<Bot className="h-3.5 w-3.5 text-secondary" />}
          label="Active AI conversations"
          ariaLabel="Active AI conversations value"
          value={formatRealtimeValue(
            analytics?.realtime.activeAiConversations ?? null,
            !loading && analytics !== null,
          )}
          colorScheme="secondary"
        />
      </CardContent>
    </Card>
  );
}

function formatRealtimeValue(value: number | null, ready: boolean): string {
  if (!ready) return '\u2014';
  if (value === null) return 'N/A';
  return formatNumber(value);
}

function RealtimeMetric({
  icon,
  label,
  ariaLabel,
  value,
  colorScheme,
}: {
  icon: React.ReactNode;
  label: string;
  ariaLabel: string;
  value: string;
  colorScheme: 'primary' | 'secondary';
}) {
  return (
    <div className={`rounded-xl border border-${colorScheme}/10 bg-${colorScheme}/5 p-4`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg bg-${colorScheme}/15`}
        >
          {icon}
        </span>
        {label}
      </div>
      <output className="mt-2 block text-2xl font-bold tracking-tight" aria-label={ariaLabel}>
        {value}
      </output>
    </div>
  );
}

// ---- Channel filter ----

export function ChannelFilterCard({
  channelFilter,
  setChannelFilter,
  topChannels,
}: {
  channelFilter: string | null;
  setChannelFilter: (filter: string | null) => void;
  topChannels: ChannelBreakdownEntry[];
}) {
  return (
    <Card className="glow-card rounded-2xl">
      <CardHeader>
        <CardTitle>Channel filter</CardTitle>
        <CardDescription>Click a channel in the chart to filter all metrics.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={channelFilter === null ? 'default' : 'outline'}
          onClick={() => setChannelFilter(null)}
          className="rounded-full"
        >
          All channels
        </Button>
        {topChannels.map((channel) => (
          <Button
            key={channel.channelId}
            size="sm"
            variant={channelFilter === channel.channelId ? 'default' : 'outline'}
            className="rounded-full"
            onClick={() =>
              setChannelFilter(channelFilter === channel.channelId ? null : channel.channelId)
            }
          >
            {channel.name}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

// ---- Message volume chart ----

export function MessageVolumeCard({
  data,
  chart,
  canShowNoDataStates,
}: {
  data: MessageVolumePoint[];
  chart: ChartTheme;
  canShowNoDataStates: boolean;
}) {
  const hasData = data.length > 0;

  return (
    <Card className="dashboard-panel rounded-2xl xl:col-span-6">
      <CardHeader>
        <CardTitle>Message volume</CardTitle>
        <CardDescription>Messages and AI requests over the selected range.</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-[340px]">
            <StableResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="label" minTickGap={20} tick={{ fill: chart.tooltipText }} />
                <YAxis allowDecimals={false} tick={{ fill: chart.tooltipText }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chart.tooltipBg,
                    borderColor: chart.tooltipBorder,
                    borderRadius: 10,
                    color: chart.tooltipText,
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="messages"
                  name="Messages"
                  stroke={chart.primary}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="aiRequests"
                  name="AI Requests"
                  stroke={chart.success}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </StableResponsiveContainer>
          </div>
        ) : canShowNoDataStates ? (
          <EmptyState
            icon={MessageSquare}
            title="No message volume yet"
            description="Run activity in this range to populate the trend chart."
            className="min-h-[340px]"
          />
        ) : (
          <div className="min-h-[340px]" aria-hidden="true" />
        )}
      </CardContent>
    </Card>
  );
}

// ---- AI usage breakdown ----

type ModelUsageEntry = {
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  fill: string;
};

export function AiUsageCard({
  modelUsageData,
  tokenBreakdownData,
  chart,
  canShowNoDataStates,
}: {
  modelUsageData: ModelUsageEntry[];
  tokenBreakdownData: Array<{ label: string; prompt: number; completion: number }>;
  chart: ChartTheme;
  canShowNoDataStates: boolean;
}) {
  const hasModelUsageData = modelUsageData.length > 0;
  const hasTokenUsageData =
    tokenBreakdownData[0]?.prompt > 0 || tokenBreakdownData[0]?.completion > 0;

  return (
    <Card className="dashboard-panel rounded-2xl xl:col-span-6">
      <CardHeader>
        <CardTitle>AI usage breakdown</CardTitle>
        <CardDescription>Request distribution by model and token usage.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ModelPieChart
          data={modelUsageData}
          hasData={hasModelUsageData}
          chart={chart}
          canShowNoDataStates={canShowNoDataStates}
        />
        <TokenBarChart
          data={tokenBreakdownData}
          hasData={hasTokenUsageData}
          chart={chart}
          canShowNoDataStates={canShowNoDataStates}
        />
      </CardContent>
    </Card>
  );
}

function ModelPieChart({
  data,
  hasData,
  chart,
  canShowNoDataStates,
}: {
  data: ModelUsageEntry[];
  hasData: boolean;
  chart: ChartTheme;
  canShowNoDataStates: boolean;
}) {
  if (hasData) {
    return (
      <div className="h-[160px] rounded-xl border border-border/60 bg-background/50 p-2">
        <StableResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="requests" nameKey="model" outerRadius={72} labelLine={false}>
              {data.map((entry) => (
                <Cell key={entry.model} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: chart.tooltipBg,
                borderColor: chart.tooltipBorder,
                borderRadius: 10,
                color: chart.tooltipText,
              }}
            />
          </PieChart>
        </StableResponsiveContainer>
      </div>
    );
  }
  if (canShowNoDataStates) {
    return (
      <EmptyState
        icon={Bot}
        title="No model usage"
        description="AI model distribution appears after AI requests are processed."
        className="min-h-[160px]"
      />
    );
  }
  return <div className="min-h-[160px]" aria-hidden="true" />;
}

function TokenBarChart({
  data,
  hasData,
  chart,
  canShowNoDataStates,
}: {
  data: Array<{ label: string; prompt: number; completion: number }>;
  hasData: boolean;
  chart: ChartTheme;
  canShowNoDataStates: boolean;
}) {
  if (hasData) {
    return (
      <div className="h-[160px] rounded-xl border border-border/60 bg-background/50 p-2">
        <StableResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" tick={{ fill: chart.tooltipText }} />
            <YAxis allowDecimals={false} tick={{ fill: chart.tooltipText }} />
            <Tooltip
              contentStyle={{
                backgroundColor: chart.tooltipBg,
                borderColor: chart.tooltipBorder,
                borderRadius: 10,
                color: chart.tooltipText,
              }}
            />
            <Legend />
            <Bar dataKey="prompt" name="Prompt tokens" fill={chart.primary} />
            <Bar dataKey="completion" name="Completion tokens" fill={chart.success} />
          </BarChart>
        </StableResponsiveContainer>
      </div>
    );
  }
  if (canShowNoDataStates) {
    return (
      <EmptyState
        icon={Coins}
        title="No token metrics"
        description="Token usage will appear once prompt/completion usage is recorded."
        className="min-h-[160px]"
      />
    );
  }
  return <div className="min-h-[160px]" aria-hidden="true" />;
}

// ---- Top channels chart ----

export function TopChannelsCard({
  topChannels,
  channelFilter,
  setChannelFilter,
  chart,
  canShowNoDataStates,
}: {
  topChannels: ChannelBreakdownEntry[];
  channelFilter: string | null;
  setChannelFilter: (filter: string | null) => void;
  chart: ChartTheme;
  canShowNoDataStates: boolean;
}) {
  const hasData = topChannels.length > 0;

  return (
    <Card className="dashboard-panel rounded-2xl xl:col-span-6">
      <CardHeader>
        <CardTitle>Top channels breakdown</CardTitle>
        <CardDescription>Channels ranked by message volume in the selected period.</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-[340px]">
            <StableResponsiveContainer>
              <BarChart
                data={topChannels}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 24, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: chart.tooltipText }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fill: chart.tooltipText }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chart.tooltipBg,
                    borderColor: chart.tooltipBorder,
                    borderRadius: 10,
                    color: chart.tooltipText,
                  }}
                />
                <Bar
                  dataKey="messages"
                  fill={chart.success}
                  radius={[0, 6, 6, 0]}
                  onClick={(_value, index) => {
                    const selected = topChannels[index]?.channelId;
                    if (!selected) return;
                    setChannelFilter(channelFilter === selected ? null : selected);
                  }}
                >
                  {topChannels.map((channel) => (
                    <Cell
                      key={channel.channelId}
                      fill={channel.channelId === channelFilter ? chart.primary : chart.success}
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
            className="min-h-[220px]"
          />
        ) : (
          <div className="min-h-[220px]" aria-hidden="true" />
        )}
      </CardContent>
    </Card>
  );
}

// ---- Command usage ----

export function CommandUsageCard({
  analytics,
  canShowNoDataStates,
}: {
  analytics: DashboardAnalytics | null;
  canShowNoDataStates: boolean;
}) {
  const items = analytics?.commandUsage?.items;
  const hasItems = (items?.length ?? 0) > 0;

  return (
    <Card className="dashboard-panel rounded-2xl xl:col-span-6">
      <CardHeader>
        <CardTitle>Command usage stats</CardTitle>
        <CardDescription>Most used slash commands for the selected range.</CardDescription>
      </CardHeader>
      <CardContent>
        {hasItems && items ? (
          <CommandUsageTable items={items} />
        ) : canShowNoDataStates ? (
          <CommandUsageEmpty source={analytics?.commandUsage?.source} />
        ) : (
          <div className="min-h-[120px]" aria-hidden="true" />
        )}
      </CardContent>
    </Card>
  );
}

function CommandUsageTable({ items }: { items: Array<{ command: string; uses: number }> }) {
  return (
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
          {items.map((entry) => (
            <tr key={entry.command} className="border-b last:border-0">
              <td className="py-2 pr-2 font-mono text-xs">/{entry.command}</td>
              <td className="py-2 text-right font-semibold">{formatNumber(entry.uses)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommandUsageEmpty({ source }: { source?: string }) {
  return (
    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
      {source === 'unavailable'
        ? 'Command usage source is currently unavailable. Showing empty state until telemetry is ready.'
        : 'No command usage found for this range.'}
    </div>
  );
}

// ---- User engagement ----

export function UserEngagementCard({ analytics }: { analytics: DashboardAnalytics }) {
  if (!analytics.userEngagement) return null;
  const ue = analytics.userEngagement;

  return (
    <Card>
      <CardHeader>
        <CardTitle>User engagement metrics</CardTitle>
        <CardDescription>Aggregate engagement from message and reaction activity.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <StatTile
          icon={<Users className="h-4 w-4" />}
          label="Tracked users"
          ariaLabel="Tracked users value"
        >
          {formatNumber(ue.trackedUsers)}
        </StatTile>
        <StatTile
          icon={<MessageSquare className="h-4 w-4" />}
          label="Avg messages / user"
          ariaLabel="Average messages per user value"
        >
          {ue.avgMessagesPerUser.toFixed(1)}
        </StatTile>
        <StatTile
          icon={<Heart className="h-4 w-4" />}
          label="Reactions given"
          ariaLabel="Total reactions given value"
        >
          {formatNumber(ue.totalReactionsGiven)}
        </StatTile>
        <StatTile
          icon={<Activity className="h-4 w-4" />}
          label="Reactions received"
          ariaLabel="Total reactions received value"
        >
          {formatNumber(ue.totalReactionsReceived)}
        </StatTile>
      </CardContent>
    </Card>
  );
}

// ---- XP economy ----

export function XpEconomyCard({ analytics }: { analytics: DashboardAnalytics }) {
  if (!analytics.xpEconomy) return null;
  const xp = analytics.xpEconomy;

  return (
    <Card>
      <CardHeader>
        <CardTitle>XP economy</CardTitle>
        <CardDescription>Reputation and level distribution across members.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <StatTile
          icon={<Users className="h-4 w-4" />}
          label="Users with XP"
          ariaLabel="Users with XP value"
        >
          {formatNumber(xp.totalUsers)}
        </StatTile>
        <StatTile
          icon={<Star className="h-4 w-4" />}
          label="Total XP distributed"
          ariaLabel="Total XP distributed value"
        >
          {formatNumber(xp.totalXp)}
        </StatTile>
        <StatTile
          icon={<Activity className="h-4 w-4" />}
          label="Average level"
          ariaLabel="Average level value"
        >
          {xp.avgLevel.toFixed(1)}
        </StatTile>
        <StatTile
          icon={<Star className="h-4 w-4" />}
          label="Highest level"
          ariaLabel="Highest level value"
        >
          {formatNumber(xp.maxLevel)}
        </StatTile>
      </CardContent>
    </Card>
  );
}

// ---- Heatmap ----

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function ActivityHeatmapCard({
  heatmapLookup,
  chart,
}: {
  heatmapLookup: { map: Map<string, number>; max: number };
  chart: ChartTheme;
}) {
  return (
    <Card className="dashboard-panel rounded-2xl">
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
              <HeatmapRow
                key={day}
                day={day}
                dayIndex={dayIndex}
                heatmapLookup={heatmapLookup}
                chartPrimary={chart.primary}
              />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function HeatmapRow({
  day,
  dayIndex,
  heatmapLookup,
  chartPrimary,
}: {
  day: string;
  dayIndex: number;
  heatmapLookup: { map: Map<string, number>; max: number };
  chartPrimary: string;
}) {
  return (
    <tr>
      <th scope="row" className="pr-2 text-muted-foreground">
        {day}
      </th>
      {HOURS.map((hour) => {
        const value = heatmapLookup.map.get(`${dayIndex}-${hour}`) ?? 0;
        const alpha =
          value === 0 || heatmapLookup.max === 0 ? 0 : 0.2 + (value / heatmapLookup.max) * 0.8;

        return (
          <td key={`${day}-${hour}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="h-4 rounded-sm border cursor-default"
                  style={{
                    backgroundColor:
                      value === 0
                        ? 'transparent'
                        : hexToRgba(chartPrimary, Number(alpha.toFixed(3))),
                  }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px] font-medium tabular-nums">
                {day} {hour}:00 — {value} message{value !== 1 ? 's' : ''}
              </TooltipContent>
            </Tooltip>
          </td>
        );
      })}
    </tr>
  );
}

// ---- Shared stat tile ----

function StatTile({
  icon,
  label,
  ariaLabel,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <output className="mt-2 block text-2xl font-semibold" aria-label={ariaLabel}>
        {children}
      </output>
    </div>
  );
}
