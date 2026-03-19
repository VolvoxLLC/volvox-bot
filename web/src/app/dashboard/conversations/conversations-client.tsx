'use client';

import { Hash, MessageSquare, RefreshCw, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/dashboard/empty-state';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGuildSelection } from '@/hooks/use-guild-selection';

function ConversationsSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Channel</TableHead>
            <TableHead>Participants</TableHead>
            <TableHead className="text-center">Messages</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead className="hidden md:table-cell">Preview</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={`skeleton-${i}`}>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell className="text-center">
                <Skeleton className="h-4 w-8 mx-auto" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Skeleton className="h-4 w-48" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface Participant {
  username: string;
  role: string;
}

interface ConversationSummary {
  id: number;
  channelId: string;
  channelName: string;
  participants: Participant[];
  messageCount: number;
  firstMessageAt: string;
  lastMessageAt: string;
  preview: string;
}

interface ConversationsApiResponse {
  conversations: ConversationSummary[];
  total: number;
  page: number;
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(first: string, last: string): string {
  const ms = new Date(last).getTime() - new Date(first).getTime();
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

/** Number of conversations per page */
const PAGE_SIZE = 25;

/**
 * Conversation list page with search, filters, and pagination.
 */
export default function ConversationsClient() {
  const router = useRouter();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const onGuildChange = useCallback(() => {
    setConversations([]);
    setTotal(0);
    setPage(1);
    setError(null);
    setChannels([]);
  }, []);

  const guildId = useGuildSelection({ onGuildChange });

  const onUnauthorized = useCallback(() => router.replace('/login'), [router]);

  // Fetch channels for filter dropdown
  useEffect(() => {
    if (!guildId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/channels`);
        if (res.ok) {
          const data = (await res.json()) as Channel[];
          // Only show text channels (type 0)
          setChannels(data.filter((ch) => ch.type === 0));
        }
      } catch {
        // Non-critical — channels filter just won't populate
      }
    })();
  }, [guildId]);

  // Fetch conversations
  const fetchConversations = useCallback(
    async (opts: { guildId: string; search: string; channel: string; page: number }) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const requestId = ++requestIdRef.current;

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('page', String(opts.page));
        params.set('limit', String(PAGE_SIZE));
        if (opts.search) params.set('search', opts.search);
        if (opts.channel) params.set('channel', opts.channel);

        const res = await fetch(
          `/api/guilds/${encodeURIComponent(opts.guildId)}/conversations?${params.toString()}`,
          { signal: controller.signal },
        );

        if (requestId !== requestIdRef.current) return;

        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to fetch conversations (${res.status})`);
        }

        const data = (await res.json()) as ConversationsApiResponse;
        setConversations(data.conversations);
        setTotal(data.total);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    if (!guildId) return;
    void fetchConversations({
      guildId,
      search: debouncedSearch,
      channel: channelFilter,
      page,
    });
  }, [guildId, debouncedSearch, channelFilter, page, fetchConversations]);

  const handleRefresh = useCallback(() => {
    if (!guildId) return;
    void fetchConversations({
      guildId,
      search: debouncedSearch,
      channel: channelFilter,
      page,
    });
  }, [guildId, fetchConversations, debouncedSearch, channelFilter, page]);

  const handleRowClick = useCallback(
    (conversationId: number) => {
      if (!guildId) return;
      router.push(
        `/dashboard/conversations/${conversationId}?guildId=${encodeURIComponent(guildId)}`,
      );
    },
    [router, guildId],
  );

  const handleClearSearch = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
        <PageHeader
          icon={MessageSquare}
          title="Conversations"
          description="Browse, search, and replay AI conversations."
          actions={
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleRefresh}
              disabled={!guildId || loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          }
        />

        {/* No guild selected */}
        {!guildId && (
          <EmptyState
            icon={MessageSquare}
            title="Select a server"
            description="Choose a server from the sidebar to view conversations."
          />
        )}

        {/* Content */}
        {guildId && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="dashboard-panel rounded-2xl bg-gradient-to-br from-primary/12 to-background p-4 md:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Total Conversations
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
                  {total.toLocaleString()}
                </p>
              </div>
              <div className="dashboard-panel rounded-2xl bg-gradient-to-br from-secondary/10 to-background p-4 md:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Text Channels
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
                  {channels.length.toLocaleString()}
                </p>
              </div>
              <div className="dashboard-panel rounded-2xl p-4 md:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Page Window
                </p>
                <p className="mt-3 text-lg font-semibold tracking-tight md:text-xl">
                  {page} of {Math.max(1, totalPages)}
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="dashboard-panel flex flex-wrap items-center gap-3 rounded-2xl p-4 md:p-5">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-10 rounded-xl border-border/70 bg-background/70 pl-9 pr-8"
                  placeholder="Search conversations..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search conversations"
                />
                {search && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={handleClearSearch}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Select
                value={channelFilter}
                onValueChange={(val) => {
                  setChannelFilter(val === 'all' ? '' : val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-[200px] rounded-xl border-border/70 bg-background/70">
                  <SelectValue placeholder="All channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  {channels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      #{ch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {total > 0 && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {total.toLocaleString()} {total === 1 ? 'conversation' : 'conversations'}
                </span>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <strong>Error:</strong> {error}
              </div>
            )}

            {/* Table */}
            {loading && conversations.length === 0 ? (
              <ConversationsSkeleton />
            ) : conversations.length > 0 ? (
              <div className="dashboard-panel overflow-x-auto rounded-2xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead>Participants</TableHead>
                      <TableHead className="text-center">Messages</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="hidden md:table-cell">Preview</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversations.map((convo) => (
                      <TableRow
                        key={convo.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(convo.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Hash className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{convo.channelName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex -space-x-1">
                            {convo.participants.slice(0, 3).map((p) => (
                              <div
                                key={p.username}
                                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium text-white ring-2 ring-background ${
                                  p.role === 'user' ? 'bg-blue-500' : 'bg-gray-500'
                                }`}
                                title={`${p.username} (${p.role})`}
                              >
                                {p.username.slice(0, 2).toUpperCase()}
                              </div>
                            ))}
                            {convo.participants.length > 3 && (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-background">
                                +{convo.participants.length - 3}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{convo.messageCount}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDuration(convo.firstMessageAt, convo.lastMessageAt)}
                        </TableCell>
                        <TableCell className="hidden max-w-xs truncate md:table-cell">
                          <span className="text-sm text-muted-foreground">{convo.preview}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(convo.firstMessageAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={MessageSquare}
                title={
                  debouncedSearch || channelFilter
                    ? 'No matching conversations'
                    : 'No conversations found'
                }
                description={
                  debouncedSearch || channelFilter
                    ? 'Try adjusting search or channel filters.'
                    : 'Conversations will appear here once users start chatting.'
                }
              />
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="dashboard-chip flex items-center justify-between rounded-xl px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
    </div>
  );
}
