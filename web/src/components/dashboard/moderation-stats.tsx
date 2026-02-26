"use client";

import { AlertTriangle, Ban, Clock, Shield, TrendingUp, UserX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ACTION_META } from "./moderation-types";
import type { ModStats } from "./moderation-types";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  description?: string;
  loading?: boolean;
}

function StatCard({ title, value, icon, description, loading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface ModerationStatsProps {
  stats: ModStats | null;
  loading: boolean;
  error: string | null;
}

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
          icon={<Shield className="h-4 w-4" />}
          description="All time"
          loading={loading}
        />
        <StatCard
          title="Last 24 Hours"
          value={stats?.last24h ?? 0}
          icon={<Clock className="h-4 w-4" />}
          description="Recent activity"
          loading={loading}
        />
        <StatCard
          title="Last 7 Days"
          value={stats?.last7d ?? 0}
          icon={<TrendingUp className="h-4 w-4" />}
          description="This week"
          loading={loading}
        />
        <StatCard
          title="Unique Actions"
          value={stats ? Object.keys(stats.byAction).length : 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          description="Action types used"
          loading={loading}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* By action breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By Action Type</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : topActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cases yet.</p>
            ) : (
              <ul className="space-y-2">
                {topActions.map(([action, count]) => {
                  const meta = ACTION_META[action as keyof typeof ACTION_META];
                  const label = meta?.label ?? action;
                  const badgeCls = meta?.badge ?? "bg-muted text-muted-foreground";
                  return (
                    <li key={action} className="flex items-center justify-between text-sm">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeCls}`}
                      >
                        {label}
                      </span>
                      <span className="font-semibold tabular-nums">{count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Top targets */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserX className="h-4 w-4" />
              Top Targets
              <span className="text-xs font-normal text-muted-foreground">(last 30 days)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : !stats?.topTargets?.length ? (
              <p className="text-sm text-muted-foreground">No repeat offenders. 🎉</p>
            ) : (
              <ul className="space-y-2">
                {stats.topTargets.map(({ userId, tag, count }) => (
                  <li key={userId} className="flex items-center justify-between text-sm">
                    <span className="truncate text-muted-foreground font-mono text-xs">
                      {tag}
                    </span>
                    <span className="ml-2 flex shrink-0 items-center gap-1 text-destructive font-semibold tabular-nums">
                      <Ban className="h-3 w-3" />
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
