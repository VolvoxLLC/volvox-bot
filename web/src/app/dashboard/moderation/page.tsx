"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaseTable } from "@/components/dashboard/case-table";
import { ModerationStats } from "@/components/dashboard/moderation-stats";
import {
  GUILD_SELECTED_EVENT,
  SELECTED_GUILD_KEY,
} from "@/lib/guild-selection";
import type { CaseListResponse, ModStats } from "@/components/dashboard/moderation-types";

const PAGE_LIMIT = 25;

export default function ModerationPage() {
  const router = useRouter();

  // Guild selection (mirrors pattern from analytics-dashboard)
  const [guildId, setGuildId] = useState<string | null>(null);

  // Stats state
  const [stats, setStats] = useState<ModStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Cases state
  const [casesData, setCasesData] = useState<CaseListResponse | null>(null);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesError, setCasesError] = useState<string | null>(null);

  // Filters & pagination
  const [page, setPage] = useState(1);
  const [sortDesc, setSortDesc] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");

  const statsAbortRef = useRef<AbortController | null>(null);
  const casesAbortRef = useRef<AbortController | null>(null);

  // ── Guild selection from localStorage ──────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = window.localStorage.getItem(SELECTED_GUILD_KEY);
      if (saved) setGuildId(saved);
    } catch {
      // localStorage unavailable
    }

    const handleGuildSelect = (event: Event) => {
      const selected = (event as CustomEvent<string>).detail;
      if (selected) {
        setGuildId(selected);
        setPage(1);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SELECTED_GUILD_KEY || !event.newValue) return;
      setGuildId(event.newValue);
      setPage(1);
    };

    window.addEventListener(GUILD_SELECTED_EVENT, handleGuildSelect as EventListener);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(GUILD_SELECTED_EVENT, handleGuildSelect as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // ── Fetch stats ──────────────────────────────────────────────────────────────
  const fetchStats = useCallback(
    async (id: string) => {
      statsAbortRef.current?.abort();
      const controller = new AbortController();
      statsAbortRef.current = controller;

      setStatsLoading(true);
      setStatsError(null);

      try {
        const res = await fetch(
          `/api/moderation/stats?guildId=${encodeURIComponent(id)}`,
          { cache: "no-store", signal: controller.signal },
        );

        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        const payload: unknown = await res.json();
        if (!res.ok) {
          const msg =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof (payload as Record<string, unknown>).error === "string"
              ? (payload as Record<string, string>).error
              : "Failed to fetch stats";
          throw new Error(msg);
        }

        setStats(payload as ModStats);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatsError(err instanceof Error ? err.message : "Failed to fetch stats");
      } finally {
        setStatsLoading(false);
      }
    },
    [router],
  );

  // ── Fetch cases ──────────────────────────────────────────────────────────────
  const fetchCases = useCallback(
    async (id: string, currentPage: number, desc: boolean, action: string, search: string) => {
      casesAbortRef.current?.abort();
      const controller = new AbortController();
      casesAbortRef.current = controller;

      setCasesLoading(true);
      setCasesError(null);

      try {
        const params = new URLSearchParams({
          guildId: id,
          page: String(currentPage),
          limit: String(PAGE_LIMIT),
        });
        if (action !== "all") params.set("action", action);
        if (search.trim()) params.set("targetId", search.trim());

        const res = await fetch(`/api/moderation/cases?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        const payload: unknown = await res.json();
        if (!res.ok) {
          const msg =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof (payload as Record<string, unknown>).error === "string"
              ? (payload as Record<string, string>).error
              : "Failed to fetch cases";
          throw new Error(msg);
        }

        // Client-side sort by date (API returns DESC, we may want ASC)
        const data = payload as CaseListResponse;
        if (!desc) {
          data.cases = [...data.cases].reverse();
        }

        setCasesData(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCasesError(err instanceof Error ? err.message : "Failed to fetch cases");
      } finally {
        setCasesLoading(false);
      }
    },
    [router],
  );

  // Trigger fetches when guildId or filter params change
  useEffect(() => {
    if (!guildId) return;
    void fetchStats(guildId);
  }, [guildId, fetchStats]);

  useEffect(() => {
    if (!guildId) return;
    void fetchCases(guildId, page, sortDesc, actionFilter, userSearch);
  }, [guildId, page, sortDesc, actionFilter, userSearch, fetchCases]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      statsAbortRef.current?.abort();
      casesAbortRef.current?.abort();
    };
  }, []);

  const handleRefresh = useCallback(() => {
    if (!guildId) return;
    void fetchStats(guildId);
    void fetchCases(guildId, page, sortDesc, actionFilter, userSearch);
  }, [guildId, page, sortDesc, actionFilter, userSearch, fetchStats, fetchCases]);

  const handleClearFilters = useCallback(() => {
    setActionFilter("all");
    setUserSearch("");
    setPage(1);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
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
          <RefreshCw
            className={`h-4 w-4 ${statsLoading || casesLoading ? "animate-spin" : ""}`}
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
              onPageChange={setPage}
              onSortToggle={() => setSortDesc((d) => !d)}
              onActionFilterChange={setActionFilter}
              onUserSearchChange={setUserSearch}
              onClearFilters={handleClearFilters}
            />
          </div>
        </>
      )}
    </div>
  );
}
