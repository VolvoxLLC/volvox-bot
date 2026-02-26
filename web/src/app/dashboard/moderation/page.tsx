'use client';

import { RefreshCw, Search, Shield, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { CaseTable } from '@/components/dashboard/case-table';
import { ModerationStats } from '@/components/dashboard/moderation-stats';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { useModerationCases } from '@/hooks/use-moderation-cases';
import { useModerationStats } from '@/hooks/use-moderation-stats';
import { useUserHistory } from '@/hooks/use-user-history';

export default function ModerationPage() {
  const router = useRouter();

  // Filters & pagination
  const [page, setPage] = useState(1);
  const [sortDesc, setSortDesc] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');

  // User history lookup
  const [userHistoryInput, setUserHistoryInput] = useState('');
  const [lookupUserId, setLookupUserId] = useState<string | null>(null);
  const [userHistoryPage, setUserHistoryPage] = useState(1);

  const onGuildChange = useCallback(() => {
    setPage(1);
    setLookupUserId(null);
    setUserHistoryInput('');
  }, []);

  const guildId = useGuildSelection({ onGuildChange });

  const onUnauthorized = useCallback(() => router.replace('/login'), [router]);

  const {
    stats,
    statsLoading,
    statsError,
    refetch: refetchStats,
  } = useModerationStats({ guildId, onUnauthorized });

  const {
    casesData,
    casesLoading,
    casesError,
    refetch: refetchCases,
  } = useModerationCases({ guildId, page, sortDesc, actionFilter, userSearch, onUnauthorized });

  const {
    userHistoryData,
    userHistoryLoading,
    userHistoryError,
    setUserHistoryData,
    setUserHistoryError,
    fetchUserHistory,
  } = useUserHistory({ guildId, lookupUserId, page: userHistoryPage, onUnauthorized });

  const handleRefresh = useCallback(() => {
    refetchStats();
    refetchCases();
    if (lookupUserId && guildId) fetchUserHistory(guildId, lookupUserId, userHistoryPage);
  }, [refetchStats, refetchCases, lookupUserId, guildId, fetchUserHistory, userHistoryPage]);

  const handleClearFilters = useCallback(() => {
    setActionFilter('all');
    setUserSearch('');
    setPage(1);
  }, []);

  const handleUserHistorySearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = userHistoryInput.trim();
      if (!trimmed || !guildId) return;
      setLookupUserId(trimmed);
      setUserHistoryPage(1);
      setUserHistoryData(null);
      void fetchUserHistory(guildId, trimmed, 1);
    },
    [guildId, userHistoryInput, fetchUserHistory, setUserHistoryData],
  );

  const handleClearUserHistory = useCallback(() => {
    setLookupUserId(null);
    setUserHistoryData(null);
    setUserHistoryError(null);
    setUserHistoryInput('');
  }, [setUserHistoryData, setUserHistoryError]);

  return (
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
          <RefreshCw className={`h-4 w-4 ${statsLoading || casesLoading ? 'animate-spin' : ''}`} />
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
          <ModerationStats stats={stats} loading={statsLoading} error={statsError} />

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
              onSortToggle={() => setSortDesc((d) => !d)}
              onActionFilterChange={setActionFilter}
              onUserSearchChange={setUserSearch}
              onClearFilters={handleClearFilters}
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
  );
}
