'use client';

import { ScrollText } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HealthSection } from '@/components/dashboard/health-section';
import { LogFilters } from '@/components/dashboard/log-filters';
import { LogViewer } from '@/components/dashboard/log-viewer';
import { PageHeader } from '@/components/dashboard/page-header';
import type { DiscordChannel } from '@/components/ui/channel-selector';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { useLogStream } from '@/lib/log-ws';
import { cn } from '@/lib/utils';

/**
 * /dashboard/logs — Real-time log viewer and health monitoring page.
 */
export default function LogsPage() {
  const guildId = useGuildSelection();
  const { logs, status, sendFilter, clearLogs } = useLogStream({
    enabled: Boolean(guildId),
    guildId,
  });
  const [channels, setChannels] = useState<DiscordChannel[]>([]);

  useEffect(() => {
    if (!guildId) {
      setChannels([]);
      return;
    }

    const controller = new AbortController();
    const activeGuildId = guildId;

    async function fetchChannels() {
      try {
        const response = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/channels`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 401) {
            window.location.href = '/login';
          }
          return;
        }

        const data: unknown = await response.json();
        if (!Array.isArray(data)) return;

        setChannels(
          data.filter(
            (channel): channel is DiscordChannel =>
              typeof channel === 'object' &&
              channel !== null &&
              typeof (channel as Record<string, unknown>).id === 'string' &&
              typeof (channel as Record<string, unknown>).name === 'string' &&
              typeof (channel as Record<string, unknown>).type === 'number',
          ),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    void fetchChannels();

    return () => {
      controller.abort();
    };
  }, [guildId]);

  const channelNameById = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel.name])),
    [channels],
  );

  const resolveChannelName = useCallback(
    (channelId: string | null | undefined) => {
      if (!channelId) return null;
      return channelNameById.get(channelId) ?? null;
    },
    [channelNameById],
  );

  return (
    <ErrorBoundary title="Logs failed to load">
      <div className="space-y-12 pb-12">
        <HealthSection>
          <div className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-card/40 backdrop-blur-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.05)] transition-all">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />

            <div className="relative z-10 border-b border-white/5 px-8 py-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-background/40 shadow-xl backdrop-blur-xl">
                  <ScrollText className="h-6 w-6 text-primary/60" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-foreground">
                    Log <span className="text-primary/60">Stream</span>
                  </h1>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                    Real-time synchronization • Bot API
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-2xl border border-white/5 bg-background/40 px-4 py-2 backdrop-blur-xl transition-all shadow-inner',
                    status === 'connected'
                      ? 'ring-1 ring-emerald-500/20'
                      : status === 'reconnecting'
                        ? 'ring-1 ring-amber-500/20'
                        : '',
                  )}
                >
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]',
                      status === 'connected'
                        ? 'bg-emerald-500 shadow-emerald-500/40'
                        : status === 'reconnecting'
                          ? 'bg-amber-500 animate-pulse shadow-amber-500/40'
                          : 'bg-muted-foreground/30',
                    )}
                  />
                  <span
                    className={cn(
                      'text-[10px] font-black uppercase tracking-widest',
                      status === 'connected'
                        ? 'text-emerald-500/80'
                        : status === 'reconnecting'
                          ? 'text-amber-500/80'
                          : 'text-muted-foreground/40',
                    )}
                  >
                    {status}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative z-10 border-b border-white/5 bg-white/[0.02] px-8 py-4 backdrop-blur-sm">
              <LogFilters guildId={guildId} onFilterChange={sendFilter} disabled={status !== 'connected'} />
            </div>

            <div className="relative z-10 min-h-[30rem] p-4 bg-black/20">
              <LogViewer logs={logs} status={status} onClear={clearLogs} resolveChannelName={resolveChannelName} />
            </div>
          </div>
        </HealthSection>
      </div>
    </ErrorBoundary>
  );
}
