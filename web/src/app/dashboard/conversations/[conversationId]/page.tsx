'use client';

import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  type ConversationMessage,
  ConversationReplay,
} from '@/components/dashboard/conversation-replay';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';

interface ConversationDetailResponse {
  messages: ConversationMessage[];
  channelId: string;
  channelName?: string | null;
  duration: number;
  tokenEstimate: number;
  mentionMap?: Record<string, string>;
}

/**
 * Displays a conversation replay page and manages fetching its detail based on URL parameters and the `guildId` query parameter.
 *
 * The component handles loading and error states, redirects to the login page on 401, shows a "not found" message on 404, and renders the replay UI when conversation data is available.
 *
 * @returns A React element that renders the conversation detail page, including loading skeletons, error UI, and the conversation replay when data is loaded.
 */
export default function ConversationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const conversationId = params.conversationId as string;
  const guildId = searchParams.get('guildId');

  const [data, setData] = useState<ConversationDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!guildId || !conversationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/conversations/${encodeURIComponent(conversationId)}`,
      );
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (res.status === 404) {
        setError('Conversation not found');
        return;
      }
      if (!res.ok) throw new Error(`Failed to fetch conversation (${res.status})`);
      const result = (await res.json()) as ConversationDetailResponse;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch conversation');
    } finally {
      setLoading(false);
    }
  }, [guildId, conversationId, router]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return (
    <ErrorBoundary title="Conversation detail failed to load">
      <div className="space-y-8">
        {/* Navigation / Hero section */}
        <div className="flex flex-col gap-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="group flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-card/40 px-4 py-2 transition-all hover:bg-card/60 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-1" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80 group-hover:text-foreground">
              Return to logs
            </span>
          </button>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-card/40 text-primary shadow-xl backdrop-blur-xl">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-foreground">
                    Record <span className="text-primary/60">#{conversationId.slice(-6)}</span>
                  </h1>
                  {data && (
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                      Channel Discovery • {data.channelName ?? data.channelId}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-6">
            <div className="flex gap-4">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="rounded-[28px] border border-white/5 bg-card/10 p-8 h-96">
              <div className="space-y-8">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
                    key={`sk-${i}`}
                    className={`flex gap-4 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}
                  >
                    <Skeleton className="h-10 w-10 rounded-2xl shrink-0" />
                    <Skeleton className="h-20 w-3/4 rounded-2xl" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="rounded-[24px] border border-destructive/30 bg-destructive/10 p-8 backdrop-blur-xl"
          >
            <h2 className="text-lg font-bold text-destructive mb-2">Protocol Error</h2>
            <p className="text-sm text-destructive/80 leading-relaxed">{error}</p>
            <Button
              variant="outline"
              className="mt-6 rounded-xl border-destructive/20 text-destructive hover:bg-destructive/10"
              onClick={() => void fetchDetail()}
            >
              Retry Fetch
            </Button>
          </div>
        )}

        {/* Replay */}
        {data && guildId && !loading && !error && (
          <ConversationReplay
            messages={data.messages}
            channelId={data.channelId}
            channelName={data.channelName}
            duration={data.duration}
            tokenEstimate={data.tokenEstimate}
            mentionMap={data.mentionMap}
            guildId={guildId}
            onFlagSubmitted={fetchDetail}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
