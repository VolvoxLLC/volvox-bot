'use client';

import type React from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  Globe,
  MemoryStick,
  Server,
  Wifi,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUptime } from '@/lib/format-time';
import type { BotHealth } from './types';

interface HealthCardsProps {
  health: BotHealth | null;
  loading: boolean;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function pingColor(ping: number): string {
  if (ping < 100) return 'text-emerald-500';
  if (ping <= 300) return 'text-yellow-500';
  return 'text-red-500';
}

function pingBg(ping: number): string {
  if (ping < 100) return 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400';
  if (ping <= 300) return 'bg-yellow-500/12 text-yellow-600 dark:text-yellow-400';
  return 'bg-red-500/12 text-red-600 dark:text-red-400';
}

function errorColor(count: number): string {
  return count > 0 ? 'text-red-500' : 'text-foreground';
}

function SkeletonCard() {
  return (
    <Card className="kpi-card rounded-2xl">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20" />
      </CardContent>
    </Card>
  );
}

interface MetricCardProps {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  children: React.ReactNode;
}

function MetricCard({ title, icon, iconBg, children }: MetricCardProps) {
  return (
    <Card className="kpi-card rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}
          >
            {icon}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-1.5 rounded-full bg-gradient-to-r from-primary to-secondary transition-all"
        style={{ width: `${Math.min(percent, 100).toFixed(1)}%` }}
      />
    </div>
  );
}

function computeHeapMetrics(health: BotHealth) {
  const heapUsedMb = health.memory.heapUsed / 1_048_576;
  const heapTotalMb = health.memory.heapTotal / 1_048_576;
  const heapPct = heapTotalMb > 0 ? (heapUsedMb / heapTotalMb) * 100 : 0;
  return { heapUsedMb, heapTotalMb, heapPct };
}

function computeCpuMetrics(health: BotHealth) {
  const cpuUserSec = health.system.cpuUsage.user / 1_000_000;
  const cpuSystemSec = health.system.cpuUsage.system / 1_000_000;
  const cpuTotalSec = cpuUserSec + cpuSystemSec;
  const rawPct = health.uptime > 0 ? (cpuTotalSec / health.uptime) * 100 : 0;
  const cpuPct = Math.min(Math.max(rawPct, 0), 100).toFixed(1);
  return { cpuUserSec, cpuSystemSec, cpuPct };
}

function formatErrorValue(value: number | null | undefined): string {
  return value?.toLocaleString() ?? '—';
}

function errorValueColor(value: number | null | undefined): string {
  return value != null ? errorColor(value) : '';
}

export function HealthCards({ health, loading }: HealthCardsProps) {
  if (loading && !health) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-fade-in">
        {(['hc-0', 'hc-1', 'hc-2', 'hc-3', 'hc-4', 'hc-5', 'hc-6', 'hc-7'] as const).map((key) => (
          <SkeletonCard key={key} />
        ))}
      </div>
    );
  }

  const heap = health ? computeHeapMetrics(health) : null;
  const cpu = health ? computeCpuMetrics(health) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-fade-in">
      <MetricCard title="Uptime" icon={<Clock className="h-3.5 w-3.5" />} iconBg="bg-primary/12 text-primary">
        <span className="text-2xl font-bold tracking-tight">
          {health ? formatUptime(health.uptime) : '—'}
        </span>
      </MetricCard>

      <MetricCard title="Memory" icon={<MemoryStick className="h-3.5 w-3.5" />} iconBg="bg-secondary/12 text-secondary">
        <span className="text-2xl font-bold tracking-tight">
          {health ? formatBytes(health.memory.heapUsed) : '—'}
        </span>
        {health && heap ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              of {formatBytes(health.memory.heapTotal)} ({heap.heapPct.toFixed(0)}%)
            </p>
            <ProgressBar percent={heap.heapPct} />
          </>
        ) : null}
      </MetricCard>

      <MetricCard
        title="Discord Ping"
        icon={<Wifi className="h-3.5 w-3.5" />}
        iconBg={health ? pingBg(health.discord.ping) : 'bg-muted text-muted-foreground'}
      >
        <span className={`text-2xl font-bold tracking-tight ${health ? pingColor(health.discord.ping) : ''}`}>
          {health ? `${health.discord.ping}ms` : '—'}
        </span>
      </MetricCard>

      <MetricCard title="Guilds" icon={<Globe className="h-3.5 w-3.5" />} iconBg="bg-cyan-500/12 text-cyan-600 dark:text-cyan-400">
        <span className="text-2xl font-bold tracking-tight">
          {health ? health.discord.guilds.toLocaleString() : '—'}
        </span>
      </MetricCard>

      <MetricCard title="Errors (1h)" icon={<AlertTriangle className="h-3.5 w-3.5" />} iconBg="bg-orange-500/12 text-orange-600 dark:text-orange-400">
        <span className={`text-2xl font-bold tracking-tight ${errorValueColor(health?.errors.lastHour)}`}>
          {health ? formatErrorValue(health.errors.lastHour) : '—'}
        </span>
      </MetricCard>

      <MetricCard title="Errors (24h)" icon={<Activity className="h-3.5 w-3.5" />} iconBg="bg-orange-500/12 text-orange-600 dark:text-orange-400">
        <span className={`text-2xl font-bold tracking-tight ${errorValueColor(health?.errors.lastDay)}`}>
          {health ? formatErrorValue(health.errors.lastDay) : '—'}
        </span>
      </MetricCard>

      <MetricCard title="CPU (avg since start)" icon={<Cpu className="h-3.5 w-3.5" />} iconBg="bg-primary/12 text-primary">
        <span className="text-2xl font-bold tracking-tight">{cpu ? `${cpu.cpuPct}%` : '—'}</span>
        {cpu ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              user {cpu.cpuUserSec.toFixed(1)}s / sys {cpu.cpuSystemSec.toFixed(1)}s
            </p>
            <ProgressBar percent={Number(cpu.cpuPct)} />
          </>
        ) : null}
      </MetricCard>

      <MetricCard title="Node" icon={<Server className="h-3.5 w-3.5" />} iconBg="bg-muted text-muted-foreground">
        <span className="text-2xl font-bold tracking-tight">
          {health ? health.system.nodeVersion : '—'}
        </span>
      </MetricCard>
    </div>
  );
}
