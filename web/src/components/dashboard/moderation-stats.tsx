'use client';

import { AlertTriangle, Ban, Clock, Shield, TrendingUp, UserX } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { ModStats } from './moderation-types';
import { ACTION_META } from './moderation-types';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  loading?: boolean;
}

function StatCard({ title, value, icon: Icon, description, loading }: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-[20px] border border-border/40 bg-card/30 p-5 backdrop-blur-xl shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-card/40 hover:shadow-xl dark:bg-card/20">
      <div className="absolute -right-4 -top-4 text-primary/10 transition-transform duration-500 group-hover:scale-110 group-hover:text-primary/20 pointer-events-none">
        <Icon className="h-24 w-24" />
      </div>
      <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/70">
            {title}
          </h3>
          <div className="rounded-full bg-primary/10 p-2 text-primary ring-1 ring-primary/20 shadow-[inset_0_1px_1px_hsl(var(--primary)/0.5)]">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-8 w-20 bg-primary/10" />
          ) : (
            <div className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-3xl font-black tracking-tight text-transparent">
              {value}
            </div>
          )}
          {description && (
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface ModerationStatsProps {
  stats: ModStats | null;
  loading: boolean;
  error: string | null;
}

/**
 * Render moderation statistics UI with summary cards, a top actions breakdown, and top targets.
 *
 * If `error` is provided, displays an alert with the error message. Otherwise renders:
 * - Four summary `StatCard`s (total cases, last 24 hours, last 7 days, unique actions).
 * - A "By Action Type" section showing up to four top actions or a loading/empty state.
 * - A "Top Targets" section showing recent repeat offenders or a loading/empty state.
 *
 * @param stats - Moderation statistics object or `null`; used to populate cards, action counts, and top targets.
 * @param loading - When `true`, shows skeleton placeholders instead of concrete data.
 * @param error - Optional error message; when present, a prominent alert is shown instead of the stats UI.
 * @returns The rendered moderation statistics JSX element.
 */
export function ModerationStats({ stats, loading, error }: ModerationStatsProps) {
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
      >
        <strong>Failed to load stats:</strong> {error}
      </div>
    );
  }

  const topActions = stats
    ? Object.entries(stats.byAction)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
    : [];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Cases"
          value={stats?.totalCases ?? 0}
          icon={Shield}
          description="All time"
          loading={loading}
        />
        <StatCard
          title="Last 24 Hours"
          value={stats?.last24h ?? 0}
          icon={Clock}
          description="Recent activity"
          loading={loading}
        />
        <StatCard
          title="Last 7 Days"
          value={stats?.last7d ?? 0}
          icon={TrendingUp}
          description="This week"
          loading={loading}
        />
        <StatCard
          title="Unique Actions"
          value={stats ? Object.keys(stats.byAction).length : 0}
          icon={AlertTriangle}
          description="Action types used"
          loading={loading}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* By action breakdown */}
        <section className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg transition-all hover:bg-card/50">
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-foreground/90">
            By Action Type
          </h3>
          <div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-5 w-full bg-white/5" />
                ))}
              </div>
            ) : topActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cases yet.</p>
            ) : (
              <ul className="space-y-2">
                {topActions.map(([action, count]) => {
                  const meta = ACTION_META[action as keyof typeof ACTION_META];
                  const label = meta?.label ?? action;
                  const badgeCls = meta?.badge ?? 'bg-muted text-muted-foreground';
                  return (
                    <li key={action} className="flex items-center justify-between text-sm">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeCls}`}
                      >
                        {label}
                      </span>
                      <span className="font-semibold tabular-nums text-foreground/90">{count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Top targets */}
        <section className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg transition-all hover:bg-card/50">
          <h3 className="mb-4 text-sm font-semibold tracking-wide flex items-center gap-2 text-foreground/90">
            <UserX className="h-4 w-4 text-muted-foreground/60" />
            Top Targets
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 mt-0.5">
              (30 Days)
            </span>
          </h3>
          <div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-5 w-full bg-white/5" />
                ))}
              </div>
            ) : !stats?.topTargets?.length ? (
              <p className="text-sm text-muted-foreground">No repeat offenders. 🎉</p>
            ) : (
              <ul className="space-y-2">
                {stats.topTargets.map(({ userId, tag, count }, index) => (
                  <li key={`${userId}-${index}`} className="flex items-center justify-between text-sm">
                    <span className="truncate text-muted-foreground font-mono text-xs">{tag}</span>
                    <span className="ml-2 flex shrink-0 items-center gap-1 text-destructive font-semibold tabular-nums bg-destructive/10 px-2 py-0.5 rounded-full ring-1 ring-destructive/20">
                      <Ban className="h-3 w-3" />
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
