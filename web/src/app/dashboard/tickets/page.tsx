'use client';

import { RefreshCw, Search, Ticket, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGuildSelection } from '@/hooks/use-guild-selection';

interface TicketSummary {
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
}

interface TicketsApiResponse {
  tickets: TicketSummary[];
  total: number;
  page: number;
  limit: number;
}

interface TicketStats {
  openCount: number;
  avgResolutionSeconds: number;
  ticketsThisWeek: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const PAGE_SIZE = 25;

export default function TicketsPage() {
  const router = useRouter();

  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [stats, setStats] = useState<TicketStats | null>(null);

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
    setTickets([]);
    setTotal(0);
    setPage(1);
    setError(null);
    setStats(null);
  }, []);

  const guildId = useGuildSelection({ onGuildChange });

  const onUnauthorized = useCallback(() => router.replace('/login'), [router]);

  // Fetch stats
  useEffect(() => {
    if (!guildId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/tickets/stats`);
        if (res.ok) {
          const data = (await res.json()) as TicketStats;
          setStats(data);
        }
      } catch {
        // Non-critical
      }
    })();
  }, [guildId]);

  // Fetch tickets
  const fetchTickets = useCallback(
    async (opts: { guildId: string; status: string; user: string; page: number }) => {
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
        if (opts.status) params.set('status', opts.status);
        if (opts.user) params.set('user', opts.user);

        const res = await fetch(
          `/api/guilds/${encodeURIComponent(opts.guildId)}/tickets?${params.toString()}`,
          { signal: controller.signal },
        );

        if (requestId !== requestIdRef.current) return;

        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to fetch tickets (${res.status})`);
        }

        const data = (await res.json()) as TicketsApiResponse;
        setTickets(data.tickets);
        setTotal(data.total);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch tickets');
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
    void fetchTickets({
      guildId,
      status: statusFilter,
      user: debouncedSearch,
      page,
    });
  }, [guildId, statusFilter, debouncedSearch, page, fetchTickets]);

  const handleRefresh = useCallback(() => {
    if (!guildId) return;
    void fetchTickets({
      guildId,
      status: statusFilter,
      user: debouncedSearch,
      page,
    });
  }, [guildId, fetchTickets, statusFilter, debouncedSearch, page]);

  const handleRowClick = useCallback(
    (ticketId: number) => {
      if (!guildId) return;
      router.push(`/dashboard/tickets/${ticketId}?guildId=${encodeURIComponent(guildId)}`);
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
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Ticket className="h-6 w-6" />
            Tickets
          </h2>
          <p className="text-muted-foreground">Manage support tickets and view transcripts.</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-auto"
          onClick={handleRefresh}
          disabled={!guildId || loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium text-muted-foreground">Open Tickets</div>
            <div className="mt-1 text-2xl font-bold">{stats.openCount}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium text-muted-foreground">Avg Resolution</div>
            <div className="mt-1 text-2xl font-bold">
              {formatDuration(stats.avgResolutionSeconds)}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium text-muted-foreground">This Week</div>
            <div className="mt-1 text-2xl font-bold">{stats.ticketsThisWeek}</div>
          </div>
        </div>
      )}

      {/* No guild selected */}
      {!guildId && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            Select a server from the sidebar to view tickets.
          </p>
        </div>
      )}

      {/* Content */}
      {guildId && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 pr-8"
                placeholder="Search by user ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search tickets by user"
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
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val === 'all' ? '' : val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            {total > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {total.toLocaleString()} {total === 1 ? 'ticket' : 'tickets'}
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
          {tickets.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">ID</TableHead>
                    <TableHead>Topic</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="hidden md:table-cell">Closed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow
                      key={ticket.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(ticket.id)}
                    >
                      <TableCell className="font-mono text-sm">#{ticket.id}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {ticket.topic || (
                          <span className="text-muted-foreground italic">No topic</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{ticket.user_id}</TableCell>
                      <TableCell>
                        <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'}>
                          {ticket.status === 'open' ? '🟢 Open' : '🔒 Closed'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(ticket.created_at)}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {ticket.closed_at ? formatDate(ticket.closed_at) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            !loading && (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground">
                  {statusFilter || debouncedSearch
                    ? 'No tickets match your filters.'
                    : 'No tickets found.'}
                </p>
              </div>
            )
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
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
