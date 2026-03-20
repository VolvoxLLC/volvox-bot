'use client';

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

  const heapUsedMb = health ? health.memory.heapUsed / 1_048_576 : 0;
  const heapTotalMb = health ? health.memory.heapTotal / 1_048_576 : 0;
  const heapPct = heapTotalMb > 0 ? (heapUsedMb / heapTotalMb) * 100 : 0;

  // cpuUsage is cumulative microseconds from process.cpuUsage(), not a percentage.
  // Display as total CPU seconds consumed since process start.
  const cpuUserSec = health ? health.system.cpuUsage.user / 1_000_000 : 0;
  const cpuSystemSec = health ? health.system.cpuUsage.system / 1_000_000 : 0;
  const cpuTotalSec = cpuUserSec + cpuSystemSec;
  // Show utilization estimate: total CPU time / wall-clock uptime
  // Clamp to 0-100 to handle multi-core environments where raw value can exceed 100%
  const rawPct = health && health.uptime > 0 ? (cpuTotalSec / health.uptime) * 100 : 0;
  const cpuPct = Math.min(Math.max(rawPct, 0), 100).toFixed(1);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-fade-in">
      {/* Uptime */}
      <Card className="kpi-card rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Clock className="h-3.5 w-3.5" />
            </span>
            Uptime
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold tracking-tight">
            {health ? formatUptime(health.uptime) : '—'}
          </span>
        </CardContent>
      </Card>

      {/* Memory */}
      <Card className="kpi-card rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/12 text-secondary">
              <MemoryStick className="h-3.5 w-3.5" />
            </span>
            Memory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold tracking-tight">
            {health ? formatBytes(health.memory.heapUsed) : '—'}
          </span>
          {health ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                of {formatBytes(health.memory.heapTotal)} ({heapPct.toFixed(0)}%)
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-gradient-to-r from-primary to-secondary transition-all"
                  style={{ width: `${Math.min(heapPct, 100).toFixed(1)}%` }}
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Discord Ping */}
      <Card className="kpi-card rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-lg ${health ? pingBg(health.discord.ping) : 'bg-muted text-muted-foreground'}`}
            >
              <Wifi className="h-3.5 w-3.5" />
            </span>
            Discord Ping
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span
            className={`text-2xl font-bold tracking-tight ${health ? pingColor(health.discord.ping) : ''}`}
          >
            {health ? `${health.discord.ping}ms` : '—'}
          </span>
        </CardContent>
      </Card>

      {/* Guilds */}
      <Card className="kpi-card rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/12 text-cyan-600 dark:text-cyan-400">
              <Globe className="h-3.5 w-3.5" />
            </span>
            Guilds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold tracking-tight">
            {health ? health.discord.guilds.toLocaleString() : '—'}
          </span>
        </CardContent>
      </Card>

      {/* Errors (1h) */}
      <Card className="kpi-card rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/12 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
            Errors (1h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span
            className={`text-2xl font-bold tracking-tight ${health?.errors.lastHour != null ? errorColor(health.errors.lastHour) : ''}`}
          >
            {health ? (health.errors.lastHour?.toLocaleString() ?? '—') : '—'}
          </span>
        </CardContent>
      </Card>

      {/* Errors (24h) */}
      <Card className="kpi-card rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/12 text-orange-600 dark:text-orange-400">
              <Activity className="h-3.5 w-3.5" />
            </span>
            Errors (24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span
            className={`text-2xl font-bold tracking-tight ${health?.errors.lastDay != null ? errorColor(health.errors.lastDay) : ''}`}
          >
            {health ? (health.errors.lastDay?.toLocaleString() ?? '—') : '—'}
          </span>
        </CardContent>
      </Card>

      {/* CPU — estimated utilisation from cumulative cpuUsage / uptime */}
      <Card className="kpi-card rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Cpu className="h-3.5 w-3.5" />
            </span>
            CPU (avg since start)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold tracking-tight">{health ? `${cpuPct}%` : '—'}</span>
          {health ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                user {cpuUserSec.toFixed(1)}s / sys {cpuSystemSec.toFixed(1)}s
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-gradient-to-r from-primary to-secondary transition-all"
                  style={{ width: `${cpuPct}%` }}
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Node Version */}
      <Card className="kpi-card rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Server className="h-3.5 w-3.5" />
            </span>
            Node
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold tracking-tight">
            {health ? health.system.nodeVersion : '—'}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
