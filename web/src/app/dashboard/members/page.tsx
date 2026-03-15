'use client';

import { RefreshCw, Search, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import {
  type MemberRow,
  MemberTable,
  type SortColumn,
  type SortOrder,
} from '@/components/dashboard/member-table';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Input } from '@/components/ui/input';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { useMembersStore } from '@/stores/members-store';

interface MembersApiResponse {
  members: MemberRow[];
  nextAfter: string | null;
  total: number;
  filteredTotal?: number;
}

/**
 * Renders the Members page with search, sorting, pagination, and a member list table.
 *
 * Displays a searchable and sortable list of guild members, supports cursor-based
 * pagination, refreshing, row navigation to a member detail page, and shows totals
 * and errors. If the API responds with an unauthorized status, navigates to `/login`.
 *
 * @returns The React element for the Members page UI.
 */
export default function MembersPage() {
  const router = useRouter();

  const {
    members,
    nextAfter,
    total,
    filteredTotal,
    loading,
    error,
    search,
    debouncedSearch,
    sortColumn,
    sortOrder,
    setMembers,
    appendMembers,
    setNextAfter,
    setTotal,
    setFilteredTotal,
    setLoading,
    setError,
    setSearch,
    setDebouncedSearch,
    setSortColumn,
    setSortOrder,
    resetPagination,
    resetAll,
  } = useMembersStore();

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // AbortController and request sequencing to prevent stale responses
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search, setDebouncedSearch]);

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const onGuildChange = useCallback(() => {
    resetAll();
  }, [resetAll]);

  const guildId = useGuildSelection({ onGuildChange });

  const onUnauthorized = useCallback(() => router.replace('/login'), [router]);

  // Fetch members — uses AbortController to cancel stale in-flight requests
  // and a monotonic request ID to discard out-of-order responses.
  const fetchMembers = useCallback(
    async (opts: {
      guildId: string;
      search: string;
      sortColumn: SortColumn;
      sortOrder: SortOrder;
      after: string | null;
      append: boolean;
    }) => {
      // Abort any previous in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const requestId = ++requestIdRef.current;

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (opts.search) params.set('search', opts.search);
        params.set('sort', opts.sortColumn);
        params.set('order', opts.sortOrder);
        if (opts.after) params.set('after', opts.after);
        params.set('limit', '50');

        const res = await fetch(
          `/api/guilds/${encodeURIComponent(opts.guildId)}/members?${params.toString()}`,
          { signal: controller.signal },
        );

        // Discard stale response if a newer request was issued
        if (requestId !== requestIdRef.current) return;

        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to fetch members (${res.status})`);
        }
        const data = (await res.json()) as MembersApiResponse;
        if (opts.append) {
          appendMembers(data.members);
        } else {
          setMembers(data.members);
        }
        setNextAfter(data.nextAfter);
        setTotal(data.total);
        setFilteredTotal(data.filteredTotal ?? null);
      } catch (err) {
        // Silently ignore aborted requests
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Discard errors from stale requests
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch members');
      } finally {
        // Only clear loading for the current (non-superseded) request
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [
      onUnauthorized,
      appendMembers,
      setMembers,
      setNextAfter,
      setTotal,
      setFilteredTotal,
      setLoading,
      setError,
    ],
  );

  // Fetch on guild/search/sort change
  useEffect(() => {
    if (!guildId) return;
    void fetchMembers({
      guildId,
      search: debouncedSearch,
      sortColumn,
      sortOrder,
      after: null,
      append: false,
    });
  }, [guildId, debouncedSearch, sortColumn, sortOrder, fetchMembers]);

  const handleSort = useCallback(
    (col: SortColumn) => {
      if (col === sortColumn) {
        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setSortColumn(col);
        setSortOrder('desc');
      }
      resetPagination();
    },
    [sortColumn, sortOrder, setSortColumn, setSortOrder, resetPagination],
  );

  const handleLoadMore = useCallback(() => {
    if (!guildId || !nextAfter || loading) return;
    void fetchMembers({
      guildId,
      search: debouncedSearch,
      sortColumn,
      sortOrder,
      after: nextAfter,
      append: true,
    });
  }, [guildId, nextAfter, loading, fetchMembers, debouncedSearch, sortColumn, sortOrder]);

  const handleRefresh = useCallback(() => {
    if (!guildId) return;
    resetPagination();
    void fetchMembers({
      guildId,
      search: debouncedSearch,
      sortColumn,
      sortOrder,
      after: null,
      append: false,
    });
  }, [guildId, fetchMembers, debouncedSearch, sortColumn, sortOrder, resetPagination]);

  const handleRowClick = useCallback(
    (userId: string) => {
      if (!guildId) return;
      router.push(`/dashboard/members/${userId}?guildId=${encodeURIComponent(guildId)}`);
    },
    [router, guildId],
  );

  const handleClearSearch = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
  }, [setSearch, setDebouncedSearch]);

  return (
    <ErrorBoundary title="Members failed to load">
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
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:flex-1 sm:max-w-sm">
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
                    type="button"
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
                  {filteredTotal !== null && filteredTotal !== total
                    ? `${filteredTotal.toLocaleString()} of ${total.toLocaleString()} members`
                    : `${total.toLocaleString()} ${total === 1 ? 'member' : 'members'}`}
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
              hasMore={nextAfter !== null}
              loading={loading}
              onRowClick={handleRowClick}
            />
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
