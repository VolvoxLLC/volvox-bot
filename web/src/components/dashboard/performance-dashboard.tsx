'use client';

import { Activity, AlertTriangle, Clock, Cpu, HardDrive, RefreshCw, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ─── Types ─────────────────────────────────────────────────────────────────

interface MetricPoint {
  timestamp: number;
  value: number;
}

interface ResponseTimeSample {
  timestamp: number;
  name: string;
  durationMs: number;
  type: 'command' | 'api';
}

interface PerformanceSummary {
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

interface AlertThresholds {
  memoryHeapMb: number;
  memoryRssMb: number;
  cpuPercent: number;
  responseTimeMs: number;
}

interface PerformanceSnapshot {
  current: {
    memoryHeapMb: number;
    memoryRssMb: number;
    memoryHeapTotalMb: number;
    memoryExternalMb: number;
    cpuPercent: number;
    uptime: number;
  };
  thresholds: AlertThresholds;
  timeSeries: {
    memoryHeapMb: MetricPoint[];
    memoryRssMb: MetricPoint[];
    cpuPercent: MetricPoint[];
  };
  responseTimes: ResponseTimeSample[];
  summary: PerformanceSummary;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  alert?: boolean;
  loading?: boolean;
}

function StatCard({ title, value, subtitle, icon: Icon, alert, loading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${alert ? 'text-destructive' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-7 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <>
            <div className={`text-2xl font-bold ${alert ? 'text-destructive' : ''}`}>{value}</div>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

const AUTO_REFRESH_MS = 30_000;

export function PerformanceDashboard() {
  const [data, setData] = useState<PerformanceSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [thresholdEdit, setThresholdEdit] = useState<Partial<AlertThresholds>>({});
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdMsg, setThresholdMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (bg = false) => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    if (!bg) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch('/api/performance', { cache: 'no-store', signal: ctl.signal });
      if (!res.ok) {
        const json: unknown = await res.json().catch(() => ({}));
        const msg =
          typeof json === 'object' && json !== null && 'error' in json
            ? String((json as Record<string, unknown>).error)
            : 'Failed to fetch performance data';
        throw new Error(msg);
      }
      const json: PerformanceSnapshot = (await res.json()) as PerformanceSnapshot;
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (!bg) setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = window.setInterval(() => void fetchData(true), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [fetchData]);

  // Seed threshold editor on data load
  useEffect(() => {
    if (data && Object.keys(thresholdEdit).length === 0) {
      setThresholdEdit({ ...data.thresholds });
    }
  }, [data, thresholdEdit]);

  const saveThresholds = async () => {
    setThresholdSaving(true);
    setThresholdMsg(null);
    try {
      const res = await fetch('/api/performance/thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholdEdit),
      });
      if (!res.ok) {
        const json: unknown = await res.json().catch(() => ({}));
        const msg =
          typeof json === 'object' && json !== null && 'error' in json
            ? String((json as Record<string, unknown>).error)
            : 'Failed to save thresholds';
        setThresholdMsg(`Error: ${msg}`);
        return;
      }
      setThresholdMsg('Thresholds saved.');
      void fetchData(true);
    } catch {
      setThresholdMsg('Error: Network failure');
    } finally {
      setThresholdSaving(false);
    }
  };

  // ── Derived chart data ─────────────────────────────────────

  const memChartData =
    data?.timeSeries.memoryHeapMb.map((pt, i) => ({
      time: formatTs(pt.timestamp),
      heap: pt.value,
      rss: data.timeSeries.memoryRssMb[i]?.value ?? 0,
    })) ?? [];

  const cpuChartData =
    data?.timeSeries.cpuPercent.map((pt) => ({
      time: formatTs(pt.timestamp),
      cpu: pt.value,
    })) ?? [];

  // Group response times into a histogram (bucket by 500ms)
  const rtBuckets: Record<string, number> = {};
  for (const sample of data?.responseTimes ?? []) {
    const bucket = `${Math.floor(sample.durationMs / 500) * 500}ms`;
    rtBuckets[bucket] = (rtBuckets[bucket] ?? 0) + 1;
  }
  const rtHistogram = Object.entries(rtBuckets)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
    .map(([bucket, count]) => ({ bucket, count }));

  const cur = data?.current;
  const thresh = data?.thresholds;
  const sum = data?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
          <p className="text-sm text-muted-foreground">
            Memory, CPU, and response time metrics. Auto-refreshes every 30s.
          </p>
          {lastUpdated && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last updated{' '}
              {lastUpdated.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void fetchData()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <strong>Failed to load performance data:</strong> {error}
          <Button variant="outline" size="sm" className="ml-4" onClick={() => void fetchData()}>
            Try again
          </Button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Heap Memory"
          value={cur ? `${cur.memoryHeapMb} MB` : '—'}
          subtitle={cur && thresh ? `Threshold: ${thresh.memoryHeapMb} MB` : undefined}
          icon={HardDrive}
          alert={!!cur && !!thresh && cur.memoryHeapMb > thresh.memoryHeapMb * 0.9}
          loading={loading && !data}
        />
        <StatCard
          title="RSS Memory"
          value={cur ? `${cur.memoryRssMb} MB` : '—'}
          subtitle={cur && thresh ? `Threshold: ${thresh.memoryRssMb} MB` : undefined}
          icon={HardDrive}
          alert={!!cur && !!thresh && cur.memoryRssMb > thresh.memoryRssMb * 0.9}
          loading={loading && !data}
        />
        <StatCard
          title="CPU Utilization"
          value={cur ? `${cur.cpuPercent}%` : '—'}
          subtitle={cur && thresh ? `Threshold: ${thresh.cpuPercent}%` : undefined}
          icon={Cpu}
          alert={!!cur && !!thresh && cur.cpuPercent > thresh.cpuPercent * 0.9}
          loading={loading && !data}
        />
        <StatCard
          title="Uptime"
          value={cur ? formatUptime(cur.uptime) : '—'}
          icon={Clock}
          loading={loading && !data}
        />
      </div>

      {/* Response time summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Avg Response Time"
          value={sum ? `${sum.avgMs} ms` : '—'}
          icon={Zap}
          loading={loading && !data}
        />
        <StatCard
          title="p50 Response Time"
          value={sum ? `${sum.p50Ms} ms` : '—'}
          icon={Activity}
          loading={loading && !data}
        />
        <StatCard
          title="p95 Response Time"
          value={sum ? `${sum.p95Ms} ms` : '—'}
          icon={Activity}
          alert={!!sum && !!thresh && sum.p95Ms > thresh.responseTimeMs}
          loading={loading && !data}
        />
        <StatCard
          title="p99 Response Time"
          value={sum ? `${sum.p99Ms} ms` : '—'}
          icon={AlertTriangle}
          alert={!!sum && !!thresh && sum.p99Ms > thresh.responseTimeMs}
          loading={loading && !data}
        />
      </div>

      {/* Memory time-series chart */}
      <Card>
        <CardHeader>
          <CardTitle>Memory Usage Over Time</CardTitle>
          <CardDescription>Heap and RSS memory sampled every 30s (last 60 minutes)</CardDescription>
        </CardHeader>
        <CardContent>
          {memChartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No samples yet — data appears after the first 30-second interval.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={memChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis unit=" MB" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v} MB`]} />
                <Area
                  type="monotone"
                  dataKey="heap"
                  name="Heap"
                  stroke="#5865F2"
                  fill="#5865F233"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="rss"
                  name="RSS"
                  stroke="#22C55E"
                  fill="#22C55E33"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* CPU time-series chart */}
      <Card>
        <CardHeader>
          <CardTitle>CPU Utilization Over Time</CardTitle>
          <CardDescription>Process CPU usage sampled every 30s</CardDescription>
        </CardHeader>
        <CardContent>
          {cpuChartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No samples yet — data appears after the first 30-second interval.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={cpuChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v}%`]} />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  name="CPU"
                  stroke="#F59E0B"
                  fill="#F59E0B33"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Response time histogram */}
      <Card>
        <CardHeader>
          <CardTitle>Response Time Distribution</CardTitle>
          <CardDescription>
            Histogram of command and API response times (500ms buckets) · {sum?.count ?? 0} total
            samples
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rtHistogram.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No response times recorded yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={rtHistogram} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Requests" fill="#5865F2" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent response times table */}
      {(data?.responseTimes?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Response Times</CardTitle>
            <CardDescription>
              Last {Math.min(data?.responseTimes?.length ?? 0, 20)} samples
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Time</th>
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(data?.responseTimes ?? [])]
                    .reverse()
                    .slice(0, 20)
                    .map((s) => (
                      <tr key={`${s.timestamp}-${s.name}`} className="border-b last:border-0">
                        <td className="py-1.5 pr-4 text-muted-foreground">
                          {formatTs(s.timestamp)}
                        </td>
                        <td className="py-1.5 pr-4 font-mono text-xs">{s.name}</td>
                        <td className="py-1.5 pr-4">
                          <Badge variant="outline" className="text-xs">
                            {s.type}
                          </Badge>
                        </td>
                        <td
                          className={`py-1.5 text-right font-mono text-xs ${
                            thresh && s.durationMs > thresh.responseTimeMs ? 'text-destructive' : ''
                          }`}
                        >
                          {s.durationMs} ms
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert thresholds editor */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Thresholds</CardTitle>
          <CardDescription>
            Configure when the bot logs a warning and triggers alert callbacks. Changes take effect
            immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                { key: 'memoryHeapMb', label: 'Heap Memory (MB)' },
                { key: 'memoryRssMb', label: 'RSS Memory (MB)' },
                { key: 'cpuPercent', label: 'CPU Utilization (%)' },
                { key: 'responseTimeMs', label: 'Response Time (ms)' },
              ] as const
            ).map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type="number"
                  min={1}
                  value={thresholdEdit[key] ?? ''}
                  onChange={(e) =>
                    setThresholdEdit((prev) => ({
                      ...prev,
                      [key]: Number(e.target.value),
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => void saveThresholds()} disabled={thresholdSaving}>
              {thresholdSaving ? 'Saving…' : 'Save Thresholds'}
            </Button>
            {thresholdMsg && (
              <p
                className={`text-sm ${thresholdMsg.startsWith('Error') ? 'text-destructive' : 'text-green-600'}`}
              >
                {thresholdMsg}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
