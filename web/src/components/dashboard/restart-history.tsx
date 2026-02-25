"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BotHealth, RestartRecord } from "./types";

interface RestartHistoryProps {
  health: BotHealth | null;
  loading: boolean;
}

const MAX_RESTARTS = 20;

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);

  // seconds >= 60 guarantees at least m >= 1, so parts is never empty
  return parts.join(" ");
}

type ReasonStyle = {
  bg: string;
  text: string;
  label: string;
};

function reasonStyle(reason: string): ReasonStyle {
  const normalized = reason.toLowerCase();

  // Check crash/restart before startup to avoid "restart" matching "start"
  if (
    normalized.includes("crash") ||
    normalized.includes("error") ||
    normalized.includes("uncaught") ||
    normalized.includes("unhandled")
  ) {
    return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: reason };
  }
  if (normalized.includes("restart")) {
    return { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", label: reason };
  }
  if (normalized.includes("startup") || normalized.startsWith("start")) {
    return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: reason };
  }
  if (normalized.includes("deploy") || normalized.includes("update")) {
    return { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: reason };
  }
  if (normalized.includes("shutdown") || normalized.includes("sigterm") || normalized.includes("sigint")) {
    return { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", label: reason };
  }

  return { bg: "bg-muted", text: "text-muted-foreground", label: reason };
}

function ReasonBadge({ reason }: { reason: string }) {
  const style = reasonStyle(reason);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function RestartHistory({ health, loading }: RestartHistoryProps) {
  const restarts: RestartRecord[] = health
    ? [...health.restarts].reverse().slice(0, MAX_RESTARTS)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restart History</CardTitle>
        <CardDescription>Last {MAX_RESTARTS} restarts, most recent first.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !health ? (
          <TableSkeleton />
        ) : restarts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {health ? "No restarts recorded." : "No data available."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Timestamp</th>
                  <th className="pb-2 pr-4 font-medium">Reason</th>
                  <th className="pb-2 pr-4 font-medium">Version</th>
                  <th className="pb-2 font-medium">Uptime Before</th>
                </tr>
              </thead>
              <tbody>
                {restarts.map((restart, i) => (
                  <tr
                    key={`${restart.timestamp}-${i}`}
                    className="border-b last:border-0 hover:bg-muted/40 transition-colors"
                  >
                    <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(restart.timestamp)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <ReasonBadge reason={restart.reason} />
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">
                      {restart.version}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {formatUptime(restart.uptimeBefore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
