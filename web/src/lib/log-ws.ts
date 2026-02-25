"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogEntry {
  /** Unique client-side ID (timestamp + index) */
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
  /** Arbitrary structured metadata */
  meta?: Record<string, unknown>;
}

export interface LogFilter {
  level?: LogLevel | "all";
  module?: string;
  search?: string;
}

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

export interface UseLogStreamResult {
  logs: LogEntry[];
  status: ConnectionStatus;
  sendFilter: (filter: LogFilter) => void;
  clearLogs: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_LOGS = 1000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _idSeq = 0;
function makeId(): string {
  return `${Date.now()}-${_idSeq++}`;
}

function normalizeLevel(raw: unknown): LogLevel {
  const s = String(raw ?? "info").toLowerCase();
  if (s === "error" || s === "warn" || s === "info" || s === "debug") return s;
  return "info";
}

function normalizeEntry(raw: unknown, id: string): LogEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const message = typeof r.message === "string" ? r.message : JSON.stringify(r.message ?? "");
  const timestamp =
    typeof r.timestamp === "string"
      ? r.timestamp
      : new Date().toISOString();
  const level = normalizeLevel(r.level);
  const module = typeof r.module === "string" ? r.module : undefined;

  // Everything that isn't a top-level field goes into meta
  const { message: _m, timestamp: _t, level: _l, module: _mod, type: _type, ...rest } = r;
  const meta = Object.keys(rest).length > 0 ? (rest as Record<string, unknown>) : undefined;

  return { id, timestamp, level, message, module, meta };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Connect to the bot's /ws/logs endpoint.
 *
 * Fetches WS URL + auth secret from the Next.js API route first, then
 * maintains a WebSocket connection with auto-reconnect (exponential backoff).
 *
 * @param enabled - Set to false to disable connection (e.g. when page is hidden)
 */
export function useLogStream(enabled = true): UseLogStreamResult {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeFilterRef = useRef<LogFilter>({});
  const ticketRef = useRef<{ wsUrl: string; ticket: string } | null>(null);
  const unmountedRef = useRef(false);
  const connectingRef = useRef(false);

  // ── Fetch ticket once ──────────────────────────────────────────────────────
  const fetchTicket = useCallback(async (): Promise<{ wsUrl: string; ticket: string } | null> => {
    // Always fetch a fresh ticket — they're short-lived HMAC tokens
    try {
      const res = await fetch("/api/log-stream/ws-ticket");
      if (!res.ok) return null;
      const data = (await res.json()) as { wsUrl?: string; ticket?: string };
      if (!data.wsUrl || !data.ticket) return null;
      ticketRef.current = { wsUrl: data.wsUrl, ticket: data.ticket };
      return ticketRef.current;
    } catch {
      return null;
    }
  }, []);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (unmountedRef.current || connectingRef.current) return;
    connectingRef.current = true;

    const ticket = await fetchTicket();
    if (!ticket || unmountedRef.current) {
      connectingRef.current = false;
      return;
    }

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(ticket.wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) {
        ws.close();
        return;
      }
      ws.send(JSON.stringify({ type: "auth", ticket: ticket.ticket }));
    };

    ws.onmessage = (event: MessageEvent) => {
      if (unmountedRef.current) return;
      let msg: unknown;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (typeof msg !== "object" || msg === null) return;
      const m = msg as Record<string, unknown>;

      switch (m.type) {
        case "auth_ok": {
          setStatus("connected");
          backoffRef.current = INITIAL_BACKOFF_MS;
          connectingRef.current = false;
          // Re-apply active filter after reconnect
          const f = activeFilterRef.current;
          if (Object.keys(f).length > 0) {
            ws.send(JSON.stringify({ type: "filter", ...f }));
          }
          break;
        }

        case "history": {
          const entries = Array.isArray(m.logs) ? m.logs : [];
          const normalized = entries
            .map((e: unknown) => normalizeEntry(e, makeId()))
            .filter((e): e is LogEntry => e !== null)
            .slice(-MAX_LOGS);
          setLogs(normalized);
          break;
        }

        case "log": {
          const entry = normalizeEntry(m, makeId());
          if (!entry) return;
          setLogs((prev) => {
            const next = [...prev, entry];
            return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
          });
          break;
        }

        default:
          break;
      }
    };

    ws.onerror = () => {
      // Will be followed by onclose — handle there
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      connectingRef.current = false;
      setStatus("reconnecting");

      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);

      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) connect();
      }, delay);
    };
  }, [fetchTicket]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    unmountedRef.current = false;

    if (enabled) {
      setStatus("reconnecting");
      connect();
    }

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setStatus("disconnected");
    };
  }, [enabled, connect]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const sendFilter = useCallback((filter: LogFilter) => {
    activeFilterRef.current = filter;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "filter", ...filter }));
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return { logs, status, sendFilter, clearLogs };
}
