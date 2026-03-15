'use client';

import { RefreshCw, Search, Shield, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { CaseTable } from '@/components/dashboard/case-table';
import { ModerationStats } from '@/components/dashboard/moderation-stats';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Input } from '@/components/ui/input';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { useModerationStore } from '@/stores/moderation-store';

export default function ModerationPage() {
  const router = useRouter();

  const {
    page,
    sortDesc,
    actionFilter,
    userSearch,
    userHistoryInput,
    lookupUserId,
    userHistoryPage,
    casesData,
    casesLoading,
    casesError,
    stats,
    statsLoading,
    statsError,
    userHistoryData,
    userHistoryLoading,
    userHistoryError,
    setPage,
    toggleSortDesc,
    setActionFilter,
    setUserSearch,
    setUserHistoryInput,
    setLookupUserId,
    setUserHistoryPage,
    clearFilters,
    clearUserHistory,
    resetOnGuildChange,
    fetchStats,
    fetchCases,
    fetchUserHistory,
  } = useModerationStore();

  // AbortController for automatic cleanup of in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  const onGuildChange = useCallback(() => {
    abortRef.current?.abort();
    resetOnGuildChange();
  }, [resetOnGuildChange]);

  const guildId = useGuildSelection({ onGuildChange });

  const onUnauthorized = useCallback(() => router.replace('/login'), [router]);

  // Helper to run a fetch and handle the unauthorized result
  const runFetch = useCallback(
    async (fn: (signal: AbortSignal) => Promise<'ok' | 'unauthorized' | 'error'>) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const result = await fn(controller.signal);
      if (result === 'unauthorized') onUnauthorized();
    },
    [onUnauthorized],
  );

  // Fetch stats when guild changes
  useEffect(() => {
    if (!guildId) return;
    void runFetch((signal) => fetchStats(guildId, { signal }));
  }, [guildId, fetchStats, runFetch]);

  // Fetch cases when guild / filters change.
  // page, actionFilter, userSearch are read inside fetchCases via get() but must
  // appear in deps so the effect re-fires when they change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: filter deps trigger refetch
  useEffect(() => {
    if (!guildId) return;
    void runFetch((signal) => fetchCases(guildId, { signal }));
  }, [guildId, page, actionFilter, userSearch, fetchCases, runFetch]);

  // Fetch user history on page change
  useEffect(() => {
    if (!guildId || !lookupUserId) return;
    void runFetch((signal) => fetchUserHistory(guildId, lookupUserId, userHistoryPage, { signal }));
  }, [guildId, lookupUserId, userHistoryPage, fetchUserHistory, runFetch]);

  // Abort on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleRefresh = useCallback(() => {
    if (!guildId) return;
    void runFetch(async (signal) => {
      const [statsResult, casesResult] = await Promise.all([
        fetchStats(guildId, { signal }),
        fetchCases(guildId, { signal }),
      ]);
      if (lookupUserId) {
        await fetchUserHistory(guildId, lookupUserId, userHistoryPage, { signal });
      }
      if (statsResult === 'unauthorized' || casesResult === 'unauthorized') return 'unauthorized';
      return 'ok';
    });
  }, [guildId, lookupUserId, userHistoryPage, fetchStats, fetchCases, fetchUserHistory, runFetch]);

  const handleUserHistorySearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = userHistoryInput.trim();
      if (!trimmed || !guildId) return;
      setLookupUserId(trimmed);
      setUserHistoryPage(1);
      void runFetch((signal) => fetchUserHistory(guildId, trimmed, 1, { signal }));
    },
    [guildId, userHistoryInput, fetchUserHistory, setLookupUserId, setUserHistoryPage, runFetch],
  );

  const handleClearUserHistory = useCallback(() => {
    clearUserHistory();
  }, [clearUserHistory]);

  return (
    <ErrorBoundary title="Moderation failed to load">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Shield className="h-6 w-6" />
              Moderation
            </h2>
            <p className="text-muted-foreground">
              Review cases, track activity, and audit your moderation team.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-2 self-start sm:self-auto"
            onClick={handleRefresh}
            disabled={!guildId || statsLoading || casesLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${statsLoading || casesLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>

        {/* No guild selected */}
        {!guildId && (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">
              Select a server from the sidebar to view moderation data.
            </p>
          </div>
        )}

        {/* Content */}
        {guildId && (
          <>
            {/* Stats */}
            <ErrorBoundary title="Stats failed to load">
              <ModerationStats stats={stats} loading={statsLoading} error={statsError} />
            </ErrorBoundary>

            {/* Cases */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Cases</h3>
              <CaseTable
                data={casesData}
                loading={casesLoading}
                error={casesError}
                page={page}
                sortDesc={sortDesc}
                actionFilter={actionFilter}
                userSearch={userSearch}
                guildId={guildId}
                onPageChange={setPage}
                onSortToggle={toggleSortDesc}
                onActionFilterChange={setActionFilter}
                onUserSearchChange={setUserSearch}
                onClearFilters={clearFilters}
              />
            </div>

            {/* User History Lookup */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">User History Lookup</h3>
              <p className="text-sm text-muted-foreground">
                Search for a user&apos;s complete moderation history by their Discord user ID.
              </p>

              <form onSubmit={handleUserHistorySearch} className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Discord user ID (e.g. 123456789012345678)"
                    value={userHistoryInput}
                    onChange={(e) => setUserHistoryInput(e.target.value)}
                    aria-label="User ID for history lookup"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!userHistoryInput.trim() || userHistoryLoading}
                >
                  {userHistoryLoading ? (
                    <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-1.5 h-4 w-4" />
                  )}
                  Look up
                </Button>
                {lookupUserId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearUserHistory}
                    title="Clear user history"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </form>

              {lookupUserId && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    History for{' '}
                    <span className="font-mono font-semibold text-foreground">{lookupUserId}</span>
                    {userHistoryData && (
                      <>
                        {' '}
                        &mdash; <span className="font-semibold">{userHistoryData.total}</span>{' '}
                        {userHistoryData.total === 1 ? 'case' : 'cases'} total
                      </>
                    )}
                  </p>

                  <CaseTable
                    data={userHistoryData}
                    loading={userHistoryLoading}
                    error={userHistoryError}
                    page={userHistoryPage}
                    sortDesc={true}
                    actionFilter="all"
                    userSearch=""
                    guildId={guildId}
                    onPageChange={(pg) => setUserHistoryPage(pg)}
                    onSortToggle={() => {}}
                    onActionFilterChange={() => {}}
                    onUserSearchChange={() => {}}
                    onClearFilters={() => {}}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
