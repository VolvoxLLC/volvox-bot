'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { useHealthStore } from '@/stores/health-store';
import { HealthCards } from './health-cards';
import { RestartHistory } from './restart-history';

const AUTO_REFRESH_MS = 60_000;

function formatLastUpdated(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function HealthSection({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const guildId = useGuildSelection();
  const { health, loading, error, lastUpdatedAt, refresh } = useHealthStore();
  const autoRefreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (guildId) {
      void refresh(guildId).then((res) => {
        if (res === 'unauthorized') router.replace('/login');
      });
    }
  }, [guildId, refresh, router]);

  // Auto-refresh logic
  useEffect(() => {
    if (!guildId) return;
    autoRefreshTimerRef.current = window.setInterval(() => {
      void refresh(guildId);
    }, AUTO_REFRESH_MS);
    return () => {
      if (autoRefreshTimerRef.current) window.clearInterval(autoRefreshTimerRef.current);
    };
  }, [guildId, refresh]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-foreground">
            Bot <span className="text-primary/60">Health</span>
          </h2>
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
              Live monitoring • System core
            </p>
            {lastUpdatedAt && <div className="h-1 w-1 rounded-full bg-border/40" />}
            {lastUpdatedAt && (
              <p className="text-[10px] font-medium text-muted-foreground/30">
                Synced at {formatLastUpdated(lastUpdatedAt)}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="group relative overflow-hidden rounded-[24px] border border-destructive/30 bg-destructive/10 p-6 backdrop-blur-xl transition-all hover:bg-destructive/15"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-black uppercase tracking-widest text-destructive">
                Core System Failure
              </h4>
              <p className="mt-1 text-sm text-destructive/80 leading-relaxed font-medium">
                {error}
              </p>
            </div>
            <button
              type="button"
              onClick={() => guildId && void refresh(guildId)}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-destructive px-4 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-destructive/80 active:scale-95 shadow-lg shadow-destructive/20"
            >
              <RefreshCw className={loading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
              Restart Fetch
            </button>
          </div>
        </div>
      )}

      <HealthCards health={health} loading={loading} />

      {children}

      <div className="stagger-fade-in" style={{ animationDelay: '200ms' }}>
        <RestartHistory health={health} loading={loading} />
      </div>
    </div>
  );
}
