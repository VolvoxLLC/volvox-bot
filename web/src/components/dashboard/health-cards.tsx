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

interface HealthCardsProps {
  health: BotHealth | null;
  loading: boolean;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);

  return parts.join(" ");
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function pingColor(ping: number): string {
  if (ping < 100) return "text-green-500";
  if (ping < 300) return "text-yellow-500";
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

  const cpuUser = health
    ? (health.system.cpuUsage.user / 1_000_000).toFixed(1)
    : "0";
  const cpuSystem = health
    ? (health.system.cpuUsage.system / 1_000_000).toFixed(1)
    : "0";

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
            {health ? health.discord.guilds.toLocaleString("en-US") : "—"}
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
            className={`text-2xl font-bold ${health ? errorColor(health.errors.lastHour) : ""}`}
          >
            {health ? health.errors.lastHour.toLocaleString("en-US") : "—"}
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
            className={`text-2xl font-bold ${health ? errorColor(health.errors.lastDay) : ""}`}
          >
            {health ? health.errors.lastDay.toLocaleString("en-US") : "—"}
          </span>
        </CardContent>
      </Card>

      {/* CPU */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            CPU
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold">
            {health ? `${cpuUser}s` : "—"}
          </span>
          {health ? (
            <p className="mt-1 text-xs text-muted-foreground">
              user {cpuUser}s / sys {cpuSystem}s
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
