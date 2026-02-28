'use client';

import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  type ConversationMessage,
  ConversationReplay,
} from '@/components/dashboard/conversation-replay';
import { Button } from '@/components/ui/button';

interface ConversationDetailResponse {
  messages: ConversationMessage[];
  channelId: string;
  duration: number;
  tokenEstimate: number;
}

/**
 * Conversation detail page — shows full chat replay with flag support.
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
    if (!guildId || !conversationId) return;

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
      if (!res.ok) {
        throw new Error(`Failed to fetch conversation (${res.status})`);
      }

      const result = (await res.json()) as ConversationDetailResponse;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch conversation');
    } finally {
      setLoading(false);
    }
  }, [guildId, conversationId, router]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MessageSquare className="h-6 w-6" />
            Conversation Detail
          </h2>
          {data && (
            <p className="text-sm text-muted-foreground">
              Channel {data.channelId.slice(-4)} · {data.messages.length} messages
            </p>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading conversation...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* No guild */}
      {!guildId && !loading && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            No guild selected. Please navigate from the conversations list.
          </p>
        </div>
      )}

      {/* Replay */}
      {data && guildId && (
        <ConversationReplay
          messages={data.messages}
          channelId={data.channelId}
          duration={data.duration}
          tokenEstimate={data.tokenEstimate}
          guildId={guildId}
          onFlagSubmitted={fetchDetail}
        />
      )}
    </div>
  );
}
