"use client";

import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  Globe,
  MemoryStick,
  Server,
  Wifi,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BotHealth } from "./types";
import { formatUptime } from "@/lib/format-time";

interface HealthCardsProps {
  health: BotHealth | null;
  loading: boolean;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function pingColor(ping: number): string {
  if (ping < 100) return "text-green-500";
  if (ping <= 300) return "text-yellow-500";
  return "text-red-500";
}

function errorColor(count: number): string {
  return count > 0 ? "text-red-500" : "text-foreground";
}

function SkeletonCard() {
  return (
    <Card>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonCard key={i} />
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
  const rawPct = health && health.uptime > 0
    ? (cpuTotalSec / health.uptime) * 100
    : 0;
  const cpuPct = Math.min(Math.max(rawPct, 0), 100).toFixed(1);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Uptime */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Uptime
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold">
            {health ? formatUptime(health.uptime) : "—"}
          </span>
        </CardContent>
      </Card>

      {/* Memory */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
            Memory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold">
            {health ? formatBytes(health.memory.heapUsed) : "—"}
          </span>
          {health ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                of {formatBytes(health.memory.heapTotal)} ({heapPct.toFixed(0)}%)
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(heapPct, 100).toFixed(1)}%` }}
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Discord Ping */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Wifi className="h-4 w-4 text-muted-foreground" />
            Discord Ping
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span
            className={`text-2xl font-bold ${health ? pingColor(health.discord.ping) : ""}`}
          >
            {health ? `${health.discord.ping}ms` : "—"}
          </span>
        </CardContent>
      </Card>

      {/* Guilds */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Globe className="h-4 w-4 text-muted-foreground" />
            Guilds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold">
            {health ? health.discord.guilds.toLocaleString() : "—"}
          </span>
        </CardContent>
      </Card>

      {/* Errors (1h) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            Errors (1h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span
            className={`text-2xl font-bold ${health && health.errors.lastHour != null ? errorColor(health.errors.lastHour) : ""}`}
          >
            {health ? (health.errors.lastHour?.toLocaleString() ?? "—") : "—"}
          </span>
        </CardContent>
      </Card>

      {/* Errors (24h) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Errors (24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span
            className={`text-2xl font-bold ${health && health.errors.lastDay != null ? errorColor(health.errors.lastDay) : ""}`}
          >
            {health ? (health.errors.lastDay?.toLocaleString() ?? "—") : "—"}
          </span>
        </CardContent>
      </Card>

      {/* CPU — estimated utilisation from cumulative cpuUsage / uptime */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            CPU
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold">
            {health ? `${cpuPct}%` : "—"}
          </span>
          {health ? (
            <p className="mt-1 text-xs text-muted-foreground">
              user {cpuUserSec.toFixed(1)}s / sys {cpuSystemSec.toFixed(1)}s
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Node Version */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Server className="h-4 w-4 text-muted-foreground" />
            Node
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold">
            {health ? health.system.nodeVersion : "—"}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
