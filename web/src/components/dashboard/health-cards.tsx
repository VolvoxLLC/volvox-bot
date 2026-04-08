'use client';

import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  Globe,
  type LucideIcon,
  MemoryStick,
  Server,
  Wifi,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUptime } from '@/lib/format-time';
import { cn } from '@/lib/utils';
import type { BotHealth } from './types';

interface HealthCardsProps {
  health: BotHealth | null;
  loading: boolean;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  progress,
  loading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor: string;
  progress?: { value: number; label: string };
  loading?: boolean;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[28px] border border-white/5 bg-card/40 p-6 shadow-xl transition-all hover:-translate-y-1 hover:bg-card/60 active:scale-[0.98] active:translate-y-0 backdrop-blur-2xl">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />

      <div className="relative z-10 flex items-start justify-between">
        <div className="space-y-3">
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/40">
            {title}
          </span>
          <div className="space-y-1">
            {loading ? (
              <Skeleton className="h-8 w-24 rounded-lg bg-white/5" />
            ) : (
              <h3 className="text-2xl font-black tracking-tight text-foreground">{value}</h3>
            )}
            {subtitle && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-background/40 shadow-xl backdrop-blur-xl transition-transform group-hover:scale-110',
            iconColor,
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
      </div>

      {progress && !loading && (
        <div className="relative z-10 mt-6 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">
            <span>Metric Intensity</span>
            <span>{progress.label}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40 p-[1px] shadow-inner">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-1000',
                iconColor.replace('text-', 'bg-'),
              )}
              style={{ width: `${Math.min(progress.value, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function HealthCards({ health, loading }: HealthCardsProps) {
  const heapUsedMb = health?.memory?.heapUsed ? health.memory.heapUsed / 1_048_576 : 0;
  const heapTotalMb = health?.memory?.heapTotal ? health.memory.heapTotal / 1_048_576 : 0;
  const heapPct = heapTotalMb > 0 ? (heapUsedMb / heapTotalMb) * 100 : 0;

  const cpuUserSec = health?.system?.cpuUsage?.user ? health.system.cpuUsage.user / 1_000_000 : 0;
  const cpuSystemSec = health?.system?.cpuUsage?.system
    ? health.system.cpuUsage.system / 1_000_000
    : 0;
  const cpuTotalSec = cpuUserSec + cpuSystemSec;
  const rawPct = health && health.uptime > 0 ? (cpuTotalSec / health.uptime) * 100 : 0;
  const cpuPct = Math.min(Math.max(rawPct, 0), 100);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-fade-in">
      <StatCard
        loading={loading && !health}
        title="Uptime"
        value={health ? formatUptime(health.uptime) : '—'}
        subtitle="Core operation time"
        icon={Clock}
        iconColor="text-primary"
      />
      <StatCard
        loading={loading && !health}
        title="Memory"
        value={health?.memory ? formatBytes(health.memory.heapUsed) : '—'}
        subtitle={
          health?.memory
            ? `Heap ${formatBytes(health.memory.heapUsed)} / ${formatBytes(health.memory.heapTotal)}`
            : 'Memory configuration'
        }
        icon={MemoryStick}
        iconColor="text-secondary"
        progress={{ value: heapPct, label: `${heapPct.toFixed(0)}%` }}
      />
      <StatCard
        loading={loading && !health}
        title="Ping"
        value={health?.discord ? `${health.discord.ping}ms` : '—'}
        subtitle="Gateway latency"
        icon={Wifi}
        iconColor={
          health && health.discord?.ping < 100
            ? 'text-emerald-500'
            : (health?.discord?.ping ?? 0) < 300
              ? 'text-amber-500'
              : 'text-red-500'
        }
      />
      <StatCard
        loading={loading && !health}
        title="Scale"
        value={health?.discord ? health.discord.guilds.toLocaleString() : '—'}
        subtitle="Active guilds"
        icon={Globe}
        iconColor="text-cyan-500"
      />
      <StatCard
        loading={loading && !health}
        title="Errors (1h)"
        value={health?.errors ? (health.errors.lastHour?.toLocaleString() ?? '0') : '—'}
        subtitle="Recent stability"
        icon={AlertTriangle}
        iconColor={
          health && (health.errors?.lastHour || 0) > 0 ? 'text-red-500' : 'text-emerald-500/40'
        }
      />
      <StatCard
        loading={loading && !health}
        title="Errors (24h)"
        value={health?.errors ? (health.errors.lastDay?.toLocaleString() ?? '0') : '—'}
        subtitle="Long-term health"
        icon={Activity}
        iconColor={
          health && (health.errors?.lastDay || 0) > 0 ? 'text-red-500' : 'text-emerald-500/40'
        }
      />
      <StatCard
        loading={loading && !health}
        title="Processor"
        value={health ? `${cpuPct.toFixed(1)}%` : '—'}
        subtitle={`User ${cpuUserSec.toFixed(1)}s`}
        icon={Cpu}
        iconColor="text-primary/60"
        progress={{ value: cpuPct, label: `${cpuPct.toFixed(1)}%` }}
      />
      <StatCard
        loading={loading && !health}
        title="Environment"
        value={health ? health.system.nodeVersion : '—'}
        subtitle="Engine version"
        icon={Server}
        iconColor="text-muted-foreground/40"
      />
    </div>
  );
}
