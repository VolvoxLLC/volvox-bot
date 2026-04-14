'use client';

import { Activity, AlertTriangle, Clock, Cpu, HardDrive, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StableResponsiveContainer } from '@/components/ui/stable-responsive-container';

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
    <div
      className={`group relative flex flex-col overflow-hidden rounded-[28px] border border-white/5 bg-card/40 p-6 shadow-xl transition-all hover:-translate-y-1 hover:bg-card/60 active:scale-[0.98] active:translate-y-0 backdrop-blur-3xl ${
        alert ? 'ring-1 ring-inset ring-destructive/30' : ''
      }`}
    >
      {/* Ambient glass background layer */}
      <div
        className={`absolute inset-0 pointer-events-none ${
          alert
            ? 'bg-gradient-to-br from-destructive/10 to-transparent'
            : 'bg-gradient-to-br from-white/[0.04] to-transparent'
        }`}
      />

      <div className="relative z-10 flex items-start justify-between">
        <div className="space-y-3">
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/50">
            {title}
          </span>
          <div className="space-y-1">
            {loading ? (
              <div className="h-8 w-24 animate-pulse rounded-lg bg-white/5" />
            ) : (
              <h3
                className={`text-2xl font-black tracking-tight ${
                  alert
                    ? 'text-destructive drop-shadow-[0_0_12px_rgba(255,0,0,0.4)]'
                    : 'text-foreground'
                }`}
              >
                {value}
              </h3>
            )}
            {subtitle && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl border shadow-xl backdrop-blur-xl transition-transform group-hover:scale-110 ${
            alert
              ? 'border-destructive/30 bg-destructive/10 text-destructive shadow-destructive/20'
              : 'border-white/10 bg-background/50 text-muted-foreground/60'
          }`}
        >
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

const AUTO_REFRESH_MS = 30_000;

export function PerformanceDashboard() {
  const [data, setData] = useState<PerformanceSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      window.dispatchEvent(new CustomEvent('performance-loading-start'));
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
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (!bg) {
        setLoading(false);
        window.dispatchEvent(new CustomEvent('performance-loading-end'));
      }
    }
  }, []);

  useEffect(() => {
    fetchData().catch(() => {});
    const handleRefresh = () => fetchData().catch(() => {});
    window.addEventListener('refresh-performance', handleRefresh);
    return () => {
      abortRef.current?.abort();
      window.removeEventListener('refresh-performance', handleRefresh);
    };
  }, [fetchData]);

  useEffect(() => {
    const id = window.setInterval(() => fetchData(true).catch(() => {}), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [fetchData]);

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
        toast.error('Failed to save thresholds', { description: msg });
        return;
      }
      setThresholdMsg('Thresholds saved.');
      toast.success('Thresholds saved', { description: 'Alert thresholds updated successfully.' });
      fetchData(true).catch(() => {});
    } catch {
      setThresholdMsg('Error: Network failure');
      toast.error('Failed to save thresholds', { description: 'A network error occurred.' });
    } finally {
      setThresholdSaving(false);
    }
  };

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
      {error && (
        <div
          role="alert"
          className="rounded-[20px] border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive backdrop-blur-xl"
        >
          <strong>Failed to load performance data:</strong> {error}
          <Button
            variant="outline"
            size="sm"
            className="ml-4 rounded-xl"
            onClick={() => fetchData().catch(() => {})}
          >
            Try again
          </Button>
        </div>
      )}

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Avg Latency"
          value={sum ? `${sum.avgMs} ms` : '—'}
          icon={Zap}
          loading={loading && !data}
        />
        <StatCard
          title="p50 Latency"
          value={sum ? `${sum.p50Ms} ms` : '—'}
          icon={Activity}
          loading={loading && !data}
        />
        <StatCard
          title="p95 Latency"
          value={sum ? `${sum.p95Ms} ms` : '—'}
          icon={Activity}
          alert={!!sum && !!thresh && sum.p95Ms > thresh.responseTimeMs}
          loading={loading && !data}
        />
        <StatCard
          title="p99 Latency"
          value={sum ? `${sum.p99Ms} ms` : '—'}
          icon={AlertTriangle}
          alert={!!sum && !!thresh && sum.p99Ms > thresh.responseTimeMs}
          loading={loading && !data}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg">
          <div className="mb-6 flex flex-col gap-1">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">
              Memory Usage
            </h3>
            <p className="text-xs text-muted-foreground/40">Heap and RSS trends (last 60m)</p>
          </div>
          <div className="h-[250px] w-full">
            {memChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground/40 italic">
                Waiting for samples...
              </div>
            ) : (
              <StableResponsiveContainer>
                <AreaChart data={memChartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border)/0.2)"
                  />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground)/0.4)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    unit=" MB"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground)/0.4)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderRadius: '12px',
                      border: '1px solid hsl(var(--border)/0.4)',
                      fontSize: '11px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="heap"
                    stroke="hsl(var(--primary))"
                    fill="url(#colorHeap)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="rss"
                    stroke="#22C55E"
                    fill="url(#colorRss)"
                    strokeWidth={2}
                  />
                  <defs>
                    <linearGradient id="colorHeap" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorRss" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                </AreaChart>
              </StableResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg">
          <div className="mb-6 flex flex-col gap-1">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">
              CPU Utilization
            </h3>
            <p className="text-xs text-muted-foreground/40">Process load sampled every 30s</p>
          </div>
          <div className="h-[250px] w-full">
            {cpuChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground/40 italic">
                Waiting for samples...
              </div>
            ) : (
              <StableResponsiveContainer>
                <AreaChart data={cpuChartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border)/0.2)"
                  />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground)/0.4)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    unit="%"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground)/0.4)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderRadius: '12px',
                      border: '1px solid hsl(var(--border)/0.4)',
                      fontSize: '11px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    stroke="#F59E0B"
                    fill="url(#colorCpu)"
                    strokeWidth={2}
                  />
                  <defs>
                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                </AreaChart>
              </StableResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg">
          <div className="mb-6 flex flex-col gap-1">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">
              latency Distribution
            </h3>
            <p className="text-xs text-muted-foreground/40">
              Command & API response times (500ms buckets)
            </p>
          </div>
          <div className="h-[250px] w-full">
            {rtHistogram.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground/40 italic">
                No samples yet...
              </div>
            ) : (
              <StableResponsiveContainer>
                <BarChart data={rtHistogram}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border)/0.2)"
                  />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground)/0.4)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground)/0.4)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderRadius: '12px',
                      border: '1px solid hsl(var(--border)/0.4)',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </StableResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg overflow-hidden">
          <div className="mb-6 flex flex-col gap-1">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">
              Recent Samples
            </h3>
            <p className="text-xs text-muted-foreground/40">Latest performance captures</p>
          </div>
          <div className="max-h-[250px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/10 text-left text-muted-foreground/40 uppercase tracking-widest font-black text-[9px]">
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Endpoint</th>
                  <th className="pb-2 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/5">
                {[...(data?.responseTimes ?? [])]
                  .reverse()
                  .slice(0, 20)
                  .map((s) => (
                    <tr
                      key={`${s.timestamp}-${s.type}-${s.name}-${s.durationMs}`}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="py-2 text-muted-foreground/60 tabular-nums">
                        {formatTs(s.timestamp)}
                      </td>
                      <td className="py-2 font-mono text-[10px] text-foreground/70">{s.name}</td>
                      <td
                        className={`py-2 text-right font-mono tabular-nums ${thresh && s.durationMs > thresh.responseTimeMs ? 'text-destructive font-bold' : 'text-muted-foreground/80'}`}
                      >
                        {s.durationMs}ms
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-border/40 bg-card/40 p-8 backdrop-blur-2xl shadow-lg">
        <div className="mb-8 flex flex-col gap-1">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">
            Alert Thresholds
          </h3>
          <p className="text-xs text-muted-foreground/40">
            Configure performance warning boundaries
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              { key: 'memoryHeapMb', label: 'Heap (MB)' },
              { key: 'memoryRssMb', label: 'RSS (MB)' },
              { key: 'cpuPercent', label: 'CPU Load (%)' },
              { key: 'responseTimeMs', label: 'Latency (ms)' },
            ] as const
          ).map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <Label
                htmlFor={key}
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50"
              >
                {label}
              </Label>
              <Input
                id={key}
                type="number"
                className="h-10 rounded-xl border-border/40 bg-background/30 text-sm backdrop-blur-sm"
                value={thresholdEdit[key] ?? ''}
                onChange={(e) =>
                  setThresholdEdit((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-border/10 pt-6">
          <p
            className={`text-xs font-medium ${thresholdMsg?.startsWith('Error') ? 'text-destructive' : 'text-emerald-500'}`}
          >
            {thresholdMsg}
          </p>
          <Button
            onClick={() => saveThresholds().catch(() => {})}
            disabled={thresholdSaving}
            className="rounded-xl px-8 font-bold uppercase tracking-widest text-[10px] h-11"
          >
            {thresholdSaving ? 'Synchronizing…' : 'Update Thresholds'}
          </Button>
        </div>
      </div>
    </div>
  );
}
