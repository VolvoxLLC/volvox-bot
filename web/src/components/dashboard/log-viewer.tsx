'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ConnectionStatus, LogEntry, LogLevel } from '@/lib/log-ws';
import { cn } from '@/lib/utils';

// ─── Level styling ────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<LogLevel, { badge: string; row: string; label: string }> = {
  error: {
    badge: 'text-red-500 font-bold',
    row: 'hover:bg-red-500/5',
    label: 'ERR ',
  },
  warn: {
    badge: 'text-amber-500 font-bold',
    row: 'hover:bg-amber-500/5',
    label: 'WARN',
  },
  info: {
    badge: 'text-primary font-bold',
    row: 'hover:bg-primary/5',
    label: 'INFO',
  },
  debug: {
    badge: 'text-muted-foreground/60',
    row: 'hover:bg-muted/20',
    label: 'DBUG',
  },
};

const STATUS_STYLES: Record<ConnectionStatus, { dot: string; label: string }> = {
  connected: { dot: 'bg-green-500', label: 'Connected' },
  disconnected: { dot: 'bg-red-500', label: 'Disconnected' },
  reconnecting: { dot: 'bg-yellow-500 animate-pulse', label: 'Reconnecting…' },
};

/**
 * Extracts a channel identifier from a log entry's metadata.
 *
 * @param entry - The log entry to inspect
 * @returns The channel identifier from `entry.meta.channelId` or `entry.meta.channel_id` if it is a non-empty string, `null` otherwise
 */
function getEntryChannelId(entry: LogEntry): string | null {
  const value = entry.meta?.channelId ?? entry.meta?.channel_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Render a connection status indicator with a colored dot and label.
 *
 * @param status - The current connection status used to select the dot color and label text
 * @returns The UI element displaying a colored status dot and its label
 */
// StatusIndicator removed — status rendering is handled inline by the parent page.

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Renders a single log entry row including time, level badge, optional module and channel badges, message, and an expandable metadata panel when metadata is present.
 *
 * The row displays a resolved channel name (via `resolveChannelName`) if a channel identifier exists in `entry.meta`. When metadata exists, the main row is rendered as a toggle button that shows or hides a formatted JSON metadata panel based on `isExpanded`.
 *
 * @param entry - The log entry to render
 * @param isExpanded - Whether the entry's metadata panel is currently expanded
 * @param onToggle - Callback invoked when the user toggles the entry's expanded state
 * @param resolveChannelName - Optional resolver to convert a channel identifier into a display name
 * @returns The rendered React element for the log entry row
 */
function LogRow({
  entry,
  isExpanded,
  onToggle,
  resolveChannelName,
}: {
  entry: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  resolveChannelName?: (channelId: string | null | undefined) => string | null;
}) {
  const level = LEVEL_STYLES[entry.level];
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const hasMeta = entry.meta && Object.keys(entry.meta).length > 0;
  const channelId = getEntryChannelId(entry);
  const channelName = resolveChannelName?.(channelId) ?? null;

  const rowClassName = cn(
    'group border-b border-border/5 px-4 py-1.5 font-mono text-[11px] transition-colors',
    level.row,
  );

  const mainRow = (
    <div className="flex items-start gap-3 min-w-0">
      <span className="shrink-0 text-muted-foreground/30 select-none tabular-nums">{time}</span>
      <span
        className={cn(
          'shrink-0 min-w-[2.5rem] select-none text-[10px] tracking-tight',
          level.badge,
        )}
      >
        {level.label}
      </span>
      {entry.module && (
        <span className="shrink-0 text-secondary/60 max-w-[100px] truncate text-[10px] font-bold uppercase tracking-wider">
          [{entry.module}]
        </span>
      )}
      {channelId && (
        <Badge
          variant="outline"
          className="h-5 shrink-0 rounded-md border-border/70 bg-background/60 px-1.5 font-mono text-[10px]"
        >
          #{channelName ?? channelId}
        </Badge>
      )}
      <span className="text-foreground/80 break-words min-w-0 leading-relaxed">
        {entry.message}
      </span>
      {hasMeta && (
        <span className="ml-auto shrink-0 text-muted-foreground/20 select-none text-[9px] group-hover:text-muted-foreground/40 transition-colors">
          {isExpanded ? 'CLOSE' : 'META'}
        </span>
      )}
    </div>
  );

  if (hasMeta) {
    return (
      <div
        className={cn('border-b border-border/5', isExpanded ? 'bg-white/[0.02]' : '', level.row)}
      >
        <button
          type="button"
          className="group w-full cursor-pointer px-4 py-1.5 font-mono text-[11px] text-left transition-colors"
          aria-expanded={isExpanded}
          onClick={onToggle}
        >
          {mainRow}
        </button>
        {isExpanded && (
          <div className="mx-4 mb-3 mt-1 rounded-[14px] border border-border/20 bg-black/20 p-4 text-muted-foreground/70">
            <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed font-mono">
              {JSON.stringify(entry.meta, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return <div className={rowClassName}>{mainRow}</div>;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface LogViewerProps {
  logs: LogEntry[];
  status: ConnectionStatus;
  onClear: () => void;
  resolveChannelName?: (channelId: string | null | undefined) => string | null;
}

/**
 * Render a terminal-style log viewer with auto-scroll, pause/resume, clear, and optional metadata expansion.
 *
 * The viewer shows connection status, an entry count, controls to pause/resume auto-scrolling and clear logs,
 * and a scrollable list of log rows that can expand to reveal JSON metadata. Auto-scrolling is disabled when
 * paused or when the user has scrolled away from the bottom.
 *
 * @param resolveChannelName - Optional function that maps a channel identifier (from a log entry's metadata)
 *                             to a human-friendly display name; may return `null` to indicate no replacement.
 */
export function LogViewer({ logs, status, onClear, resolveChannelName }: LogViewerProps) {
  const [paused, setPaused] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  useEffect(() => {
    if (!logs.length || paused || userScrolledRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [logs, paused]);

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
        userScrolledRef.current = false;
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      }
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-border/20 bg-background/40 backdrop-blur-md">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border/10 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
            {logs.length} active entries
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider',
              paused
                ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                : 'text-muted-foreground/60 hover:bg-white/5 hover:text-foreground',
            )}
            onClick={togglePause}
          >
            {paused ? 'Resume Stream' : 'Pause Stream'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40 hover:bg-red-500/10 hover:text-red-500"
            onClick={onClear}
          >
            Clear Terminal
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" }}
      >
        {logs.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
            <div className="h-6 w-6 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <p className="text-[11px] font-medium text-muted-foreground/30 italic">
              {status === 'connected'
                ? 'Listening for bot log signals...'
                : status === 'reconnecting'
                  ? 'Re-establishing log frequency...'
                  : 'Terminal interface offline'}
            </p>
          </div>
        ) : (
          <div className="py-2">
            {logs.map((entry) => (
              <LogRow
                key={entry.id}
                entry={entry}
                isExpanded={expandedIds.has(entry.id)}
                onToggle={() => toggleExpand(entry.id)}
                resolveChannelName={resolveChannelName}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
}
