"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HealthCards } from "./health-cards";
import { RestartHistory } from "./restart-history";
import { isBotHealth, type BotHealth } from "./types";

const AUTO_REFRESH_MS = 60_000;

function formatLastUpdated(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function HealthSection() {
  const [health, setHealth] = useState<BotHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchHealth = useCallback(async (backgroundRefresh = false) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (!backgroundRefresh) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await fetch("/api/bot-health", {
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Failed to fetch health data";
        throw new Error(message);
      }

      if (!isBotHealth(payload)) {
        throw new Error("Invalid health payload from server");
      }

      setHealth(payload);
      setLastUpdatedAt(new Date());
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
      setError(
        fetchError instanceof Error ? fetchError.message : "Failed to fetch health data",
      );
    } finally {
      // Only clear loading if this controller is still the active one,
      // and only if we actually set loading to true (foreground refresh).
      if (abortControllerRef.current === controller && !backgroundRefresh) {
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchHealth();
    return () => abortControllerRef.current?.abort();
  }, [fetchHealth]);

  // Auto-refresh every 60s
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchHealth(true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchHealth]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bot Health</h2>
          <p className="text-muted-foreground">
            Live metrics and restart history. Auto-refreshes every 60s.
          </p>
          {lastUpdatedAt ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last updated {formatLastUpdated(lastUpdatedAt)}
            </p>
          ) : null}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-auto"
          onClick={() => void fetchHealth()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <strong>Failed to load health data:</strong> {error}
          <Button
            variant="outline"
            size="sm"
            className="ml-4"
            onClick={() => void fetchHealth()}
          >
            Try again
          </Button>
        </div>
      ) : null}

      <HealthCards health={health} loading={loading} />
      <RestartHistory health={health} loading={loading} />
    </div>
  );
}
