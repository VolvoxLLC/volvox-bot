'use client';

import { ArrowLeft, Clock, Ticket, User } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    if (!guildId || !ticketId) return;

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
      if (!res.ok) {
        throw new Error(`Failed to fetch ticket (${res.status})`);
      }

      const result = (await res.json()) as TicketDetail;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ticket');
    } finally {
      setLoading(false);
    }
  }, [guildId, ticketId, router]);

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
            <Ticket className="h-6 w-6" />
            Ticket Detail
          </h2>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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

      {/* Ticket Info */}
      {data && !loading && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Ticket #{data.id}</span>
                <Badge variant={data.status === 'open' ? 'default' : 'secondary'}>
                  {data.status === 'open' ? '🟢 Open' : '🔒 Closed'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Topic</span>
                  <p>{data.topic || 'No topic provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Opened by</span>
                  <p className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span className="font-mono text-sm">{data.user_id}</span>
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Created</span>
                  <p className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(data.created_at)}
                  </p>
                </div>
                {data.closed_at && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Closed</span>
                    <p className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimestamp(data.closed_at)}
                    </p>
                  </div>
                )}
                {data.closed_by && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Closed by</span>
                    <p className="font-mono text-sm">{data.closed_by}</p>
                  </div>
                )}
                {data.close_reason && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Close reason</span>
                    <p>{data.close_reason}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Transcript */}
          {data.transcript && data.transcript.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Transcript ({data.transcript.length} messages)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {data.transcript.map((msg, i) => (
                    <div
                      key={`${msg.timestamp}-${i}`}
                      className="flex gap-3 rounded-lg border p-3"
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
                        {msg.author.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{msg.author}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(msg.timestamp)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                          {msg.content || <span className="italic text-muted-foreground">[no content]</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.transcript && data.transcript.length === 0 && (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">No transcript available.</p>
            </div>
          )}

          {!data.transcript && data.status === 'open' && (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">
                Transcript will be saved when the ticket is closed.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
