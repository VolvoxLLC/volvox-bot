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
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useAnalytics } from '@/contexts/analytics-context';
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
import { cn } from '@/lib/utils';
import type { AnalyticsRangePreset, DashboardAnalytics } from '@/types/analytics';
import { isDashboardAnalyticsPayload } from '@/types/analytics-validators';
import {
  ActivityHeatmapCard,
  AiUsageCard,
  ChannelFilterCard,
  CommandUsageCard,
  escapeCsvCell,
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

  const showKpiSkeleton = loading && !analytics;
  const hasComparison = compareMode && analytics?.comparison != null;

  return (
    <div className="space-y-6 overflow-x-hidden">
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
            <Button onClick={() => void refresh()} variant="destructive" size="sm">
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 stagger-fade-in">
        {showKpiSkeleton
          ? (['kpi-0', 'kpi-1', 'kpi-2', 'kpi-3', 'kpi-4'] as const).map((key) => (
              <div
                key={key}
                className="h-28 animate-pulse rounded-[20px] bg-muted/20 border border-border/10"

              />
            ))
          : kpiCards.map((card) => {
              const Icon = card.icon;
              const value = card.value ?? 0;
              const hasComparison = compareMode && analytics?.comparison != null;
              const delta =
                hasComparison && card.previous != null
                  ? toDeltaPercent(value, card.previous)
                  : null;

              return (
                <div
                  key={card.label}
                  className="glow-card group relative overflow-hidden rounded-[20px] border border-border/40 bg-gradient-to-br from-background/40 to-muted/20 p-5 backdrop-blur-3xl transition-all duration-500 hover:border-border/60 hover:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.3)] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]"
                >
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
                        {analytics ? card.format(value) : '\u2014'}
                      </span>
                    </div>

                    {hasComparison ? (
                      <div
                        className={cn(
                          'mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] border transition-colors',
                          delta === null
                            ? 'bg-muted/30 text-muted-foreground/70 border-border/30'
                            : delta > 0
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]'
                              : delta < 0
                                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.1)]'
                                : 'bg-muted/30 text-muted-foreground/70 border-border/30',
                        )}
                      >
                        {delta === null ? (
                          <Minus className="h-[10px] w-[10px]" />
                        ) : delta > 0 ? (
                          <ArrowUp className="h-[10px] w-[10px]" />
                        ) : delta < 0 ? (
                          <ArrowDown className="h-[10px] w-[10px]" />
                        ) : (
                          <Minus className="h-[10px] w-[10px]" />
                        )}
                        <span>{formatDeltaPercent(delta)}</span>
                      </div>
                    ) : (
                      <div className="mt-3 h-[22px]" />
                    )}
                  </div>
                </div>
              );
            })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20 p-6 backdrop-blur-xl transition-all duration-300 hover:bg-muted/30">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-foreground/90">
                <span className="status-dot-live shadow-[0_0_8px_hsl(var(--destructive))]" />
                Real-Time Network
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                Live stream • 30s interval
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="relative overflow-hidden rounded-xl border border-border/40 bg-muted/30 p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                  <Activity className="h-3 w-3 text-primary" />
                </span>
                Active Sessions
              </div>
              <output className="mt-3 block text-3xl font-bold tracking-tighter text-foreground/90">
                {analytics == null
                  ? '\u2014'
                  : analytics.realtime.onlineMembers === null
                    ? 'N/A'
                    : formatNumber(analytics.realtime.onlineMembers)}
              </output>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-border/40 bg-muted/30 p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary/10">
                  <Bot className="h-3 w-3 text-secondary" />
                </span>
                AI Workload
              </div>
              <output className="mt-3 block text-3xl font-bold tracking-tighter text-foreground/90">
                {loading || analytics == null
                  ? '\u2014'
                  : analytics.realtime.activeAiConversations === null
                    ? 'N/A'
                    : formatNumber(analytics.realtime.activeAiConversations)}
              </output>
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20 p-6 backdrop-blur-xl transition-all duration-300 hover:bg-muted/30">
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
              variant={channelFilter === null ? 'default' : 'outline'}
              onClick={() => setChannelFilter(null)}
              className="rounded-full shadow-none"
            >
              System Wide
            </Button>
            {topChannels.map((channel) => (
              <Button
                key={channel.channelId}
                size="sm"
                variant={channelFilter === channel.channelId ? 'default' : 'outline'}
                className="rounded-full shadow-none bg-muted/30 hover:bg-muted/50"
                onClick={() =>
                  setChannelFilter(channel.channelId === channelFilter ? null : channel.channelId)
                }
              >
                {channel.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20 p-6 backdrop-blur-xl xl:col-span-6">
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
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics?.messageVolume ?? []}>
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
                    <Tooltip
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
                </ResponsiveContainer>
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
        </div>

        <div className="group relative overflow-hidden rounded-3xl border border-border/40 bg-muted/10 p-6 backdrop-blur-3xl xl:col-span-6">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black tracking-tight text-foreground/90">
                AI Cost Analysis
              </h2>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                Model requests & computation
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
                  <ResponsiveContainer width="100%" height="100%">
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
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chart.tooltipBg,
                          borderColor: chart.tooltipBorder,
                          borderRadius: 12,
                          color: chart.tooltipText,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
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
                  <ResponsiveContainer width="100%" height="100%">
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
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chart.tooltipBg,
                          borderColor: chart.tooltipBorder,
                          borderRadius: 12,
                          color: chart.tooltipText,
                        }}
                        cursor={{ fill: 'transparent' }}
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
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-[140px] flex-col items-center justify-center text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/5 text-emerald-500/40 shadow-[0_0_15px_rgba(34,197,94,0.1)] transition-transform group-hover:scale-110">
                    <Coins className="h-5 w-5" />
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
        <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20 p-6 backdrop-blur-xl xl:col-span-6">
          <div className="mb-6">
            <h2 className="text-sm font-semibold tracking-wide text-foreground/90">Top Channels</h2>
            <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
              Most active workspaces by volume
            </p>
          </div>
          <div className="relative">
            {hasTopChannelsData ? (
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
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
                    <Tooltip
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
                </ResponsiveContainer>
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
        </div>

        <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20 p-6 backdrop-blur-xl xl:col-span-6">
          <div className="mb-6">
            <h2 className="text-sm font-semibold tracking-wide text-foreground/90">
              Command Telemetry
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
              Slash command execution frequency
            </p>
          </div>
          <div className="relative">
            {analytics?.commandUsage?.items?.length ? (
              <div className="overflow-x-auto rounded-xl border border-border/40 bg-muted/30">
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
                        className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]"
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
        </div>
      </div>

      {(analytics?.userEngagement ?? analytics?.xpEconomy) ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {analytics?.userEngagement ? (
            <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20 p-6 backdrop-blur-xl">
              <div className="mb-6">
                <h2 className="text-sm font-semibold tracking-wide text-foreground/90">
                  Community Engagement
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                  Aggregate social interactions
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border/40 bg-muted/30 p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    Tracked users
                  </div>
                  <output className="mt-2 block text-2xl font-bold tracking-tight text-foreground/90">
                    {formatNumber(analytics.userEngagement.trackedUsers)}
                  </output>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/30 p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    Avg msgs / user
                  </div>
                  <output className="mt-2 block text-2xl font-bold tracking-tight text-foreground/90">
                    {analytics.userEngagement.avgMessagesPerUser.toFixed(1)}
                  </output>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/30 p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <Heart className="h-3.5 w-3.5 text-primary" />
                    Reactions given
                  </div>
                  <output className="mt-2 block text-2xl font-bold tracking-tight text-foreground/90">
                    {formatNumber(analytics.userEngagement.totalReactionsGiven)}
                  </output>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/30 p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    Reactions received
                  </div>
                  <output className="mt-2 block text-2xl font-bold tracking-tight text-foreground/90">
                    {formatNumber(analytics.userEngagement.totalReactionsReceived)}
                  </output>
                </div>
              </div>
            </div>
          ) : null}

          {analytics?.xpEconomy ? (
            <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20 p-6 backdrop-blur-xl">
              <div className="mb-6">
                <h2 className="text-sm font-semibold tracking-wide text-foreground/90">
                  XP Economy
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                  Reputation and level distribution
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border/40 bg-muted/30 p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <Users className="h-3.5 w-3.5 text-secondary" />
                    Users with XP
                  </div>
                  <output className="mt-2 block text-2xl font-bold tracking-tight text-foreground/90">
                    {formatNumber(analytics.xpEconomy.totalUsers)}
                  </output>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/30 p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <Star className="h-3.5 w-3.5 text-secondary" />
                    Total XP Minted
                  </div>
                  <output className="mt-2 block text-2xl font-bold tracking-tight text-foreground/90">
                    {formatNumber(analytics.xpEconomy.totalXp)}
                  </output>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/30 p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <Activity className="h-3.5 w-3.5 text-secondary" />
                    Average Level
                  </div>
                  <output className="mt-2 block text-2xl font-bold tracking-tight text-foreground/90">
                    {analytics.xpEconomy.avgLevel.toFixed(1)}
                  </output>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/30 p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <Star className="h-3.5 w-3.5 text-secondary" />
                    Highest Level
                  </div>
                  <output className="mt-2 block text-2xl font-bold tracking-tight text-foreground/90">
                    {formatNumber(analytics.xpEconomy.maxLevel)}
                  </output>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20 p-6 backdrop-blur-xl mb-8">
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
          <div
            className="grid w-full gap-[4px]"
            style={{ gridTemplateColumns: `32px repeat(24, 1fr)` }}
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
                    value === 0 ? 0 : ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4;

                  return (
                    <div
                      key={`${day}-${hour}`}
                      title={`${day} ${String(hour).padStart(2, '0')}:00 — ${value} messages`}
                      className={cn(
                        'aspect-square w-full rounded-[4px] border transition-all duration-200 hover:ring-2 hover:ring-primary/50 hover:scale-[1.15] hover:z-20 cursor-default',
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
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
