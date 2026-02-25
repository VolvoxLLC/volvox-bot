"use client";

import { useCallback } from "react";
import { LogViewer } from "@/components/dashboard/log-viewer";
import { LogFilters } from "@/components/dashboard/log-filters";
import { useLogStream } from "@/lib/log-ws";
import type { LogFilter } from "@/lib/log-ws";

/**
 * /dashboard/logs — Real-time log viewer page.
 *
 * Connects to the bot's /ws/logs WebSocket endpoint (authenticated via
 * /api/log-stream/ws-ticket) and streams logs in a terminal-style UI.
 */
export default function LogsPage() {
  const { logs, status, sendFilter, clearLogs } = useLogStream();

  const handleFilterChange = useCallback(
    (filter: LogFilter) => {
      sendFilter(filter);
    },
    [sendFilter],
  );

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Log Stream</h1>
          <p className="text-sm text-muted-foreground">
            Real-time logs from the bot API
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <LogFilters
        onFilterChange={handleFilterChange}
        disabled={status === "disconnected"}
      />

      {/* Terminal viewer — fills remaining height */}
      <div className="flex-1 min-h-0">
        <LogViewer logs={logs} status={status} onClear={clearLogs} />
      </div>
    </div>
  );
}
