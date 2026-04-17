'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { formatUptime } from '@/lib/format-time';
import { cn } from '@/lib/utils';
import type { BotHealth, RestartRecord } from './types';

interface RestartHistoryProps {
  health: BotHealth | null;
  loading: boolean;
}

const MAX_RESTARTS = 20;
const RESTART_SKELETON_ROWS = [
  'restart-skeleton-1',
  'restart-skeleton-2',
  'restart-skeleton-3',
  'restart-skeleton-4',
  'restart-skeleton-5',
] as const;

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function reasonStyle(reason: string) {
  const normalized = reason.toLowerCase();
  if (normalized.includes('crash') || normalized.includes('error'))
    return { bg: 'bg-red-500/10 text-red-500 ring-red-500/20', label: 'CRITICAL' };
  if (normalized.includes('restart'))
    return { bg: 'bg-amber-500/10 text-amber-500 ring-amber-500/20', label: 'RESTART' };
  if (normalized.includes('startup') || normalized.startsWith('start'))
    return { bg: 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/20', label: 'STARTUP' };
  if (normalized.includes('deploy') || normalized.includes('update'))
    return { bg: 'bg-blue-500/10 text-blue-500 ring-blue-500/20', label: 'DEPLOY' };
  return { bg: 'bg-white/5 text-muted-foreground/60 ring-white/10', label: 'EVENT' };
}

export function RestartHistory({ health, loading }: RestartHistoryProps) {
  const restarts: RestartRecord[] = health
    ? [...health.restarts]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, MAX_RESTARTS)
    : [];

  return (
    <div className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-card/40 backdrop-blur-3xl shadow-2xl transition-all">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />

      <div className="border-b border-white/5 px-8 py-6">
        <h3 className="text-xl font-black tracking-tight text-foreground">
          Restart <span className="text-primary/60">Log</span>
        </h3>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
          Last {MAX_RESTARTS} lifecycle events
        </p>
      </div>

      <div className="px-8 pb-8">
        <div className="overflow-x-auto overflow-y-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-muted-foreground/30">
                <th className="py-4 font-black">Timestamp</th>
                <th className="py-4 font-black">Category</th>
                <th className="py-4 font-black">Engine</th>
                <th className="py-4 font-black text-right">Last Uptime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && !health ? (
                RESTART_SKELETON_ROWS.map((rowId) => (
                  <tr key={rowId}>
                    <td className="py-4">
                      <Skeleton className="h-4 w-32 rounded bg-white/5" />
                    </td>
                    <td className="py-4">
                      <Skeleton className="h-4 w-16 rounded bg-white/5" />
                    </td>
                    <td className="py-4">
                      <Skeleton className="h-4 w-12 rounded bg-white/5" />
                    </td>
                    <td className="py-4 text-right">
                      <Skeleton className="h-4 w-20 ml-auto rounded bg-white/5" />
                    </td>
                  </tr>
                ))
              ) : restarts.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-12 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/20"
                  >
                    No lifecycle records found
                  </td>
                </tr>
              ) : (
                restarts.map((restart) => {
                  const style = reasonStyle(restart.reason);
                  return (
                    <tr
                      key={restart.timestamp}
                      className="group/row transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="py-4">
                        <span className="text-xs font-bold text-muted-foreground/80">
                          {formatTimestamp(restart.timestamp)}
                        </span>
                      </td>
                      <td className="py-4">
                        <div
                          className={cn(
                            'inline-flex items-center rounded-lg px-2 py-0.5 text-[9px] font-black tracking-tighter ring-1 ring-inset',
                            style.bg,
                          )}
                        >
                          {style.label}
                        </div>
                        <span className="ml-2 text-[10px] font-medium text-muted-foreground/40 italic">
                          {restart.reason}
                        </span>
                      </td>
                      <td className="py-4">
                        <code className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-primary/60">
                          {restart.version || 'n/a'}
                        </code>
                      </td>
                      <td className="py-4 text-right">
                        <span className="text-xs font-bold text-muted-foreground/60">
                          {restart.uptimeBefore != null ? formatUptime(restart.uptimeBefore) : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
