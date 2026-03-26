'use client';

import { ArrowLeft, Clock, Hash, Ticket, User } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';

interface TranscriptMessage {
  author: string;
  authorId: string | null;
  content: string;
  timestamp: string;
}

interface TicketDetail {
  id: number;
  guild_id: string;
  user_id: string;
  topic: string | null;
  status: string;
  thread_id: string;
  channel_id: string | null;
  closed_by: string | null;
  close_reason: string | null;
  created_at: string;
  closed_at: string | null;
  transcript: TranscriptMessage[] | null;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Returns a consistent pastel hue from a string, for avatar coloring. */
function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function MetaItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
        {label}
      </p>
      <p className={`text-sm font-medium text-foreground/80 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const ticketId = params.ticketId as string;
  const guildId = searchParams.get('guildId');

  const [data, setData] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!guildId || !ticketId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/tickets/${encodeURIComponent(ticketId)}`,
      );
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (res.status === 404) {
        setError('Ticket not found');
        return;
      }
      if (!res.ok) throw new Error(`Failed to fetch ticket (${res.status})`);
      const result = (await res.json()) as TicketDetail;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ticket');
    } finally {
      setLoading(false);
    }
  }, [guildId, ticketId, router]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return (
    <ErrorBoundary title="Ticket detail failed to load">
      <div className="space-y-6">
        {/* Back button */}
        <button
          type="button"
          onClick={() => router.back()}
          className="group inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-card/40 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 backdrop-blur-sm shadow-sm transition-all hover:bg-card/60 hover:text-foreground active:scale-95"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          Back
        </button>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-[28px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg">
              <div className="flex items-start justify-between gap-4 mb-5">
                <Skeleton className="h-7 w-36 rounded-xl" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-28" />
                  </div>
                ))}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg space-y-3">
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: 3 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No guild */}
        {!guildId && !loading && (
          <div className="flex h-48 items-center justify-center rounded-[24px] border border-border/40 bg-card/30 backdrop-blur-xl">
            <p className="text-sm text-muted-foreground/60">
              No guild selected. Please navigate from the tickets list.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="rounded-[20px] border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive backdrop-blur-xl"
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Ticket Info */}
        {data && !loading && !error && guildId && (
          <>
            {/* Hero info panel */}
            <div className="group relative overflow-hidden rounded-[28px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-xl transition-all hover:bg-card/50 md:p-8">
              {/* Ambient glow */}
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />

              <div className="relative">
                {/* Ticket ID + Status */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-border/40 bg-background/30">
                      <Ticket className="h-5 w-5 text-muted-foreground/60" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        Ticket
                      </p>
                      <h2 className="text-xl font-bold tracking-tight">#{data.id}</h2>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
                      data.status === 'open'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                        : 'border-border/40 bg-white/5 text-muted-foreground/60'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${data.status === 'open' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                    />
                    {data.status === 'open' ? 'Open' : 'Closed'}
                  </span>
                </div>

                {/* Topic (full width) */}
                {data.topic && (
                  <div className="mb-5 rounded-[16px] border border-border/30 bg-background/20 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">
                      Topic
                    </p>
                    <p className="text-sm font-medium text-foreground/80">{data.topic}</p>
                  </div>
                )}

                {/* Meta grid */}
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <MetaItem
                    label="Opened by"
                    mono
                    value={
                      <span className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-muted-foreground/40" />
                        {data.user_id}
                      </span>
                    }
                  />
                  <MetaItem
                    label="Created"
                    value={
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground/40" />
                        {formatTimestamp(data.created_at)}
                      </span>
                    }
                  />
                  {data.closed_at && (
                    <MetaItem
                      label="Closed"
                      value={
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground/40" />
                          {formatTimestamp(data.closed_at)}
                        </span>
                      }
                    />
                  )}
                  {data.closed_by && <MetaItem label="Closed by" value={data.closed_by} mono />}
                  {data.close_reason && <MetaItem label="Close reason" value={data.close_reason} />}
                  {data.thread_id && (
                    <MetaItem
                      label="Thread"
                      mono
                      value={
                        <span className="flex items-center gap-1.5">
                          <Hash className="h-3 w-3 text-muted-foreground/40" />
                          {data.thread_id}
                        </span>
                      }
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Transcript */}
            <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 backdrop-blur-2xl shadow-lg transition-all">
              <div className="border-b border-border/30 px-6 py-4 flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground/60">
                  Transcript
                </h3>
                {data.transcript && data.transcript.length > 0 && (
                  <span className="rounded-full border border-border/30 bg-background/30 px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground/50">
                    {data.transcript.length} messages
                  </span>
                )}
              </div>

              {data.transcript && data.transcript.length > 0 ? (
                <div className="max-h-[600px] overflow-y-auto p-4 space-y-1">
                  {data.transcript.map((msg) => {
                    const hue = stringToHue(msg.author);
                    return (
                      <div
                        key={`${msg.author}-${msg.timestamp}`}
                        className="group/msg flex gap-3 rounded-[16px] px-4 py-3 transition-colors hover:bg-white/[0.03]"
                      >
                        {/* Avatar */}
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white/90 shadow-sm"
                          style={{ background: `hsl(${hue}, 50%, 35%)` }}
                        >
                          {msg.author.slice(0, 2).toUpperCase()}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-foreground/90">
                              {msg.author}
                            </span>
                            <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                              {formatTimestamp(msg.timestamp)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm leading-relaxed text-foreground/70 whitespace-pre-wrap break-words">
                            {msg.content || (
                              <span className="italic text-muted-foreground/30">[no content]</span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : data.transcript && data.transcript.length === 0 ? (
                <div className="flex h-36 items-center justify-center">
                  <p className="text-sm text-muted-foreground/40 italic">
                    No transcript available.
                  </p>
                </div>
              ) : data.status === 'open' ? (
                <div className="flex h-36 items-center justify-center">
                  <p className="text-sm text-muted-foreground/40 italic">
                    Transcript will be saved when the ticket is closed.
                  </p>
                </div>
              ) : (
                <div className="flex h-36 items-center justify-center">
                  <p className="text-sm text-muted-foreground/40 italic">
                    No transcript available for this closed ticket.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
