'use client';

import { RefreshCw, Search, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type MemberRow,
  MemberTable,
  type SortColumn,
  type SortOrder,
} from '@/components/dashboard/member-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGuildSelection } from '@/hooks/use-guild-selection';

interface MembersApiResponse {
  members: MemberRow[];
  cursor: string | null;
  total: number;
}

export default function MembersPage() {
  const router = useRouter();

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('xp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  const onGuildChange = useCallback(() => {
    setMembers([]);
    setCursor(null);
    setTotal(0);
    setError(null);
  }, []);

  const guildId = useGuildSelection({ onGuildChange });

  const onUnauthorized = useCallback(() => router.replace('/login'), [router]);

  // Fetch members
  const fetchMembers = useCallback(
    async (opts: {
      guildId: string;
      search: string;
      sortColumn: SortColumn;
      sortOrder: SortOrder;
      cursor: string | null;
      append: boolean;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (opts.search) params.set('search', opts.search);
        params.set('sort', opts.sortColumn);
        params.set('order', opts.sortOrder);
        if (opts.cursor) params.set('cursor', opts.cursor);
        params.set('limit', '50');

        const res = await fetch(
          `/api/guilds/${encodeURIComponent(opts.guildId)}/members?${params.toString()}`,
        );
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to fetch members (${res.status})`);
        }
        const data = (await res.json()) as MembersApiResponse;
        if (opts.append) {
          setMembers((prev) => [...prev, ...data.members]);
        } else {
          setMembers(data.members);
        }
        setCursor(data.cursor);
        setTotal(data.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch members');
      } finally {
        setLoading(false);
      }
    },
    [onUnauthorized],
  );

  // Fetch on guild/search/sort change
  useEffect(() => {
    if (!guildId) return;
    void fetchMembers({
      guildId,
      search: debouncedSearch,
      sortColumn,
      sortOrder,
      cursor: null,
      append: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, debouncedSearch, sortColumn, sortOrder]);

  const handleSort = useCallback(
    (col: SortColumn) => {
      if (col === sortColumn) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(col);
        setSortOrder('desc');
      }
      setMembers([]);
      setCursor(null);
    },
    [sortColumn],
  );

  const handleLoadMore = useCallback(() => {
    if (!guildId || !cursor || loading) return;
    void fetchMembers({
      guildId,
      search: debouncedSearch,
      sortColumn,
      sortOrder,
      cursor,
      append: true,
    });
  }, [guildId, cursor, loading, fetchMembers, debouncedSearch, sortColumn, sortOrder]);

  const handleRefresh = useCallback(() => {
    if (!guildId) return;
    setMembers([]);
    setCursor(null);
    void fetchMembers({
      guildId,
      search: debouncedSearch,
      sortColumn,
      sortOrder,
      cursor: null,
      append: false,
    });
  }, [guildId, fetchMembers, debouncedSearch, sortColumn, sortOrder]);

  const handleRowClick = useCallback(
    (userId: string) => {
      router.push(`/dashboard/members/${userId}`);
    },
    [router],
  );

  const handleClearSearch = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Users className="h-6 w-6" />
            Members
          </h2>
          <p className="text-muted-foreground">
            View member activity, XP, levels, and moderation history.
          </p>
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

      {/* No guild selected */}
      {!guildId && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            Select a server from the sidebar to view members.
          </p>
        </div>
      )}

      {/* Content */}
      {guildId && (
        <>
          {/* Search + stats bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 pr-8"
                placeholder="Search by username or display name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search members"
              />
              {search && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {total > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {total.toLocaleString()} {total === 1 ? 'member' : 'members'}
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
          <MemberTable
            members={members}
            onSort={handleSort}
            sortColumn={sortColumn}
            sortOrder={sortOrder}
            onLoadMore={handleLoadMore}
            hasMore={cursor !== null}
            loading={loading}
            onRowClick={handleRowClick}
          />
        </>
      )}
    </div>
  );
}
