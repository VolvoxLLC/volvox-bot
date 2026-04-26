'use client';

import { Hash, MessageSquare, Search, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/dashboard/empty-state';
import { useGuildChannels } from '@/components/layout/channel-directory-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/error-boundary';
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
import { useConversationsStore } from '@/stores/conversations-store';

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
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const PAGE_SIZE = 25;

/**
 * Renders the Conversations client UI for a selected guild, including filters, stats, results table, and pagination.
 *
 * Displays an empty prompt when no guild is selected. When a guild is selected the component:
 * - loads and shows text channels for channel filtering,
 * - fetches and displays paginated conversations with debounced search and channel filters,
 * - shows loading skeletons, error banner, or empty states as appropriate,
 * - navigates to a conversation detail on row click,
 * - redirects to `/login` if the conversation fetch reports `'unauthorized'`.
 *
 * @returns The Conversations client UI as a JSX element.
 */
export default function ConversationsClient() {
  const router = useRouter();
  const {
    conversations,
    total,
    loading,
    error,
    currentOpts,
    fetch: fetchConversations,
  } = useConversationsStore();
  const [search, setSearch] = useState(currentOpts.search);
  const [channelFilter, setChannelFilter] = useState(currentOpts.channel);
  const [page, setPage] = useState(currentOpts.page);
  const [brokenAvatars, setBrokenAvatars] = useState<Set<string>>(() => new Set());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState(currentOpts.search);

  const onGuildChange = useCallback(() => {
    useConversationsStore.getState().reset();
    setSearch('');
    setChannelFilter('');
    setPage(1);
    setBrokenAvatars(new Set());
  }, []);
  const guildId = useGuildSelection({ onGuildChange });
  const { channels: guildChannels } = useGuildChannels(guildId);
  const channels = guildChannels.filter((channel): channel is Channel => channel.type === 0);

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  useEffect(() => {
    if (!guildId) return;
    void fetchConversations(guildId, {
      search: debouncedSearch,
      channel: channelFilter,
      page,
    }).then((r) => {
      if (r === 'unauthorized') router.replace('/login');
    });
  }, [guildId, debouncedSearch, channelFilter, page, fetchConversations, router]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <ErrorBoundary title="Conversations failed to load">
      <div className="space-y-6">
        {!guildId && (
          <EmptyState
            icon={MessageSquare}
            title="Select a server"
            description="Choose a server from the sidebar to view conversations."
          />
        )}

        {guildId && (
          <>
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg bg-gradient-to-br from-primary/12 to-transparent">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Total Conversations
                </p>
                <p className="mt-3 text-3xl font-bold tabular-nums md:text-4xl">
                  {total.toLocaleString()}
                </p>
              </div>
              <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg bg-gradient-to-br from-secondary/10 to-transparent">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Text Channels
                </p>
                <p className="mt-3 text-3xl font-bold tabular-nums md:text-4xl">
                  {channels.length}
                </p>
              </div>
              <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Page Window
                </p>
                <p className="mt-3 text-lg font-bold md:text-xl">
                  {page} of {Math.max(1, totalPages)}
                </p>
              </div>
            </div>

            {/* Compact filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[240px] max-w-sm">
                <Input
                  className="pl-10 pr-10"
                  placeholder="Search conversations..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search conversations"
                />
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 pointer-events-none z-10" />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors z-10"
                    onClick={() => {
                      setSearch('');
                      setDebouncedSearch('');
                      setPage(1);
                    }}
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
                <SelectTrigger className="w-[200px] text-[10px] font-black uppercase tracking-[0.2em] data-[placeholder]:text-muted-foreground/40">
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
                <span className="ml-auto text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 tabular-nums">
                  {total.toLocaleString()} {total === 1 ? 'conversation' : 'conversations'}
                </span>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-[20px] border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive"
              >
                <strong>Error:</strong> {error}
              </div>
            )}

            {/* Table */}
            {loading && conversations.length === 0 ? (
              <div className="overflow-x-auto rounded-[24px] border border-border/40 bg-card/40 backdrop-blur-2xl shadow-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/20">
                      {['Channel', 'Participants', 'Messages', 'Duration', 'Preview', 'Date'].map(
                        (h) => (
                          <TableHead
                            key={h}
                            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50"
                          >
                            {h}
                          </TableHead>
                        ),
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: skeleton loader
                      <TableRow key={`sk-${i}`} className="border-border/10">
                        {[28, 32, 8, 16, 48, 20].map((w, j) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton loader
                          <TableCell key={j}>
                            <Skeleton className={`h-4 w-${w}`} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : conversations.length > 0 ? (
              <div className="overflow-x-auto rounded-[24px] border border-border/40 bg-card/40 backdrop-blur-2xl shadow-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/20 hover:bg-transparent">
                      {['Channel', 'Participants', 'Messages', 'Duration', 'Preview', 'Date'].map(
                        (h, i) => (
                          <TableHead
                            key={h}
                            className={`text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 ${i === 4 ? 'hidden md:table-cell' : ''} ${i === 2 ? 'text-center' : ''}`}
                          >
                            {h}
                          </TableHead>
                        ),
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversations.map((convo) => (
                      <TableRow
                        key={convo.id}
                        className="cursor-pointer border-border/10 transition-colors hover:bg-muted/30"
                        onClick={() => {
                          if (guildId)
                            router.push(
                              `/dashboard/conversations/${convo.id}?guildId=${encodeURIComponent(guildId)}`,
                            );
                        }}
                      >
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Hash className="h-3 w-3 text-muted-foreground/40" />
                            <span className="font-medium text-foreground/80">
                              {convo.channelName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex -space-x-1">
                            {convo.participants.slice(0, 3).map((p) => {
                              const avatarKey = `${p.userId ?? p.username}:${p.avatar ?? ''}`;
                              const avatarSrc = p.avatar ?? '';
                              const showAvatar =
                                avatarSrc.length > 0 && !brokenAvatars.has(avatarKey);

                              return (
                                <div
                                  key={`${p.userId ?? 'unknown'}-${p.username}`}
                                  className="group relative"
                                  title={`${p.username} (${p.role})`}
                                >
                                  {showAvatar ? (
                                    <Image
                                      src={avatarSrc}
                                      alt={p.username}
                                      width={24}
                                      height={24}
                                      className="h-6 w-6 rounded-full border-2 border-card object-cover"
                                      onError={() => {
                                        setBrokenAvatars((current) =>
                                          new Set(current).add(avatarKey),
                                        );
                                      }}
                                    />
                                  ) : (
                                    <div
                                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-card ${p.role === 'user' ? 'bg-primary/80' : 'bg-muted-foreground/50'}`}
                                    >
                                      {p.username.slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {convo.participants.length > 3 && (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold ring-2 ring-card">
                                +{convo.participants.length - 3}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="tabular-nums">
                            {convo.messageCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground/60">
                          {formatDuration(convo.firstMessageAt, convo.lastMessageAt)}
                        </TableCell>
                        <TableCell className="hidden max-w-xs truncate md:table-cell text-sm text-muted-foreground/50">
                          {convo.preview}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground/60">
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage(Math.max(1, page - 1))}
                    className="text-[10px] font-black uppercase tracking-[0.2em]"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage(page + 1)}
                    className="text-[10px] font-black uppercase tracking-[0.2em]"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
