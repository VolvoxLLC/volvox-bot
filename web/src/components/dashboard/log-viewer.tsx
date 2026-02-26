"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConnectionStatus, LogEntry, LogLevel } from "@/lib/log-ws";

// ─── Level styling ────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<LogLevel, { badge: string; row: string; label: string }> = {
  error: {
    badge: "text-red-400 font-bold",
    row: "hover:bg-red-950/30",
    label: "ERR ",
  },
  warn: {
    badge: "text-yellow-400 font-bold",
    row: "hover:bg-yellow-950/30",
    label: "WARN",
  },
  info: {
    badge: "text-blue-400",
    row: "hover:bg-blue-950/20",
    label: "INFO",
  },
  debug: {
    badge: "text-gray-500",
    row: "hover:bg-gray-800/30",
    label: "DBUG",
  },
};

const STATUS_STYLES: Record<ConnectionStatus, { dot: string; label: string }> = {
  connected: { dot: "bg-green-500", label: "Connected" },
  disconnected: { dot: "bg-red-500", label: "Disconnected" },
  reconnecting: { dot: "bg-yellow-500 animate-pulse", label: "Reconnecting…" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusIndicator({ status }: { status: ConnectionStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full shrink-0", s.dot)} />
      <span>{s.label}</span>
    </div>
  );
}

function LogRow({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const level = LEVEL_STYLES[entry.level];
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const hasMeta = entry.meta && Object.keys(entry.meta).length > 0;

  const handleKeyDown = hasMeta
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }
    : undefined;

  return (
    <div
      className={cn(
        "group border-b border-gray-800/50 px-3 py-1 font-mono text-xs transition-colors",
        level.row,
        hasMeta && "cursor-pointer",
      )}
      role={hasMeta ? "button" : undefined}
      tabIndex={hasMeta ? 0 : undefined}
      aria-expanded={hasMeta ? isExpanded : undefined}
      onClick={hasMeta ? onToggle : undefined}
      onKeyDown={handleKeyDown}
    >
      {/* Main row */}
      <div className="flex items-start gap-2 min-w-0">
        {/* Timestamp */}
        <span className="shrink-0 text-gray-600 select-none">{time}</span>

        {/* Level badge */}
        <span className={cn("shrink-0 min-w-[3rem] select-none", level.badge)}>{level.label}</span>

        {/* Module */}
        {entry.module && (
          <span className="shrink-0 text-purple-400 max-w-[120px] truncate">
            [{entry.module}]
          </span>
        )}

        {/* Message */}
        <span className="text-gray-200 break-words min-w-0">{entry.message}</span>

        {/* Expand indicator */}
        {hasMeta && (
          <span className="ml-auto shrink-0 text-gray-600 select-none">
            {isExpanded ? "▲" : "▼"}
          </span>
        )}
      </div>

      {/* Expanded metadata */}
      {isExpanded && hasMeta && (
        <div className="mt-1 ml-14 rounded bg-gray-900 p-2 text-gray-400">
          <pre className="whitespace-pre-wrap break-words text-[11px]">
            {JSON.stringify(entry.meta, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface LogViewerProps {
  logs: LogEntry[];
  status: ConnectionStatus;
  onClear: () => void;
}

/**
 * Terminal-style log display with auto-scroll, pause, and metadata expansion.
 *
 * Renders up to 1000 log entries (enforced by the hook). Uses JetBrains Mono
 * for that authentic terminal vibe.
 */
export function LogViewer({ logs, status, onClear }: LogViewerProps) {
  const [paused, setPaused] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // Auto-scroll to bottom when new logs arrive (unless paused/user scrolled)
  useEffect(() => {
    if (paused || userScrolledRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [logs, paused]);

  // Detect manual scroll to pause auto-scroll
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledRef.current = distanceFromBottom > 50;
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p;
      if (!next) {
        // Resume — scroll to bottom
        userScrolledRef.current = false;
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        });
      }
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-3 py-2">
        <StatusIndicator status={status} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{logs.length} entries</span>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-6 px-2 text-xs border-gray-700 hover:bg-gray-800",
              paused && "border-yellow-600 text-yellow-400 hover:bg-yellow-950/30",
            )}
            onClick={togglePause}
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs border-gray-700 hover:bg-gray-800"
            onClick={onClear}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Log list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" }}
      >
        {logs.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-gray-600">
            {status === "connected"
              ? "Waiting for logs…"
              : status === "reconnecting"
                ? "Connecting to log stream…"
                : "Not connected"}
          </div>
        ) : (
          logs.map((entry) => (
            <LogRow
              key={entry.id}
              entry={entry}
              isExpanded={expandedIds.has(entry.id)}
              onToggle={() => toggleExpand(entry.id)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
