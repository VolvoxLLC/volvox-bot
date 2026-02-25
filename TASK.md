# Task: WebSocket Log Streaming Server + Winston Transport

## Parent
- **Master Task:** task-001
- **Branch:** feat/logs-and-health
- **Issue:** [#35](https://github.com/VolvoxLLC/volvox-bot/issues/35)

## Context

Build a WebSocket server that streams bot logs in real-time to dashboard clients.
Hybrid approach: real-time via custom Winston transport + historical via existing `queryLogs()`.

### Existing Code
- `src/logger.js` — Winston logger (console + file rotation + PostgreSQL)
- `src/transports/postgres.js` — PostgreSQL batch transport (reference pattern)
- `src/utils/logQuery.js` — `queryLogs()` with level/search/since/until/pagination
- `src/api/server.js` — Express HTTP server (attach WS here)
- `src/api/middleware/auth.js` — `isValidSecret()` for API key validation

## IMPORTANT — READ THIS FIRST
- **Commit PROGRESSIVELY** — after EVERY file you create or major change
- Do NOT spend 30 minutes thinking. Start writing code immediately.
- This should follow this commit flow:
  1. `npm install ws` → commit
  2. Create `src/transports/websocket.js` → commit
  3. Create `src/api/ws/logStream.js` → commit
  4. Wire into `src/api/server.js` and `src/logger.js` → commit
  5. Run tests → fix → commit

## Files to Create/Modify

**Create:**
- `src/transports/websocket.js` — Custom Winston transport that broadcasts to WS clients
- `src/api/ws/logStream.js` — WebSocket server setup, auth, client management

**Modify:**
- `src/api/server.js` — Attach WebSocket server to HTTP server
- `src/logger.js` — Add WebSocketTransport after server starts

## Requirements

- [x] Install `ws` package
- [x] Create `WebSocketTransport` extending `winston-transport`
  - Broadcast log entries to all authenticated clients
  - Per-client filtering (level, module, search)
  - Zero overhead when no clients connected
- [x] Create WebSocket server on path `/ws/logs`
  - Attach to existing Express HTTP server
  - Auth: first message `{ type: "auth", secret: "..." }` → validate via `isValidSecret()`
  - On auth: send `{ type: "auth_ok" }` then last 100 logs via `queryLogs()` as `{ type: "history", logs: [...] }`
  - Real-time: `{ type: "log", level, message, metadata, timestamp, module }`
  - Client filter: `{ type: "filter", level?, module?, search? }`
  - Heartbeat ping every 30s, clean dead connections
  - Max 10 concurrent authenticated clients
- [x] Wire into server.js and logger.js
- [x] Tests pass, lint passes

## Constraints
- Do NOT touch frontend files
- Do NOT touch health.js or restartTracker.js
- Use `ws` library (not socket.io)

## Acceptance Criteria
- [x] WebSocket server accepts connections on `/ws/logs`
- [x] Auth required before receiving logs
- [x] Historical logs sent on connect
- [x] Real-time streaming works
- [x] Per-client filtering works
- [x] Heartbeat keeps connections alive
- [x] Max client limit enforced
- [x] All existing tests pass

## Results

**Status:** ✅ Done

**Commits:**
- `044771c` feat: install ws package for WebSocket log streaming
- `b173cdb` feat: add WebSocketTransport custom Winston transport
- `96a063d` feat: add WebSocket log stream server with auth, filtering, and heartbeat
- `9347543` feat: wire WebSocket transport into server.js and logger.js
- `4fe40c4` feat: add WebSocket transport to startup sequence
- `bae1dbd` test: add WebSocket transport and log stream tests
- `36cef93` chore: fix import order in logStream.js (biome lint)

**Changes:**
- `package.json` / `pnpm-lock.yaml`: added `ws ^8.19.0`
- `src/transports/websocket.js`: new — custom Winston transport that broadcasts to WS clients with per-client filtering (level, module, search) and zero overhead when no clients connected
- `src/api/ws/logStream.js`: new — WebSocket server on `/ws/logs` with auth via `isValidSecret()`, history via `queryLogs()`, real-time streaming, per-client filters, heartbeat (30s), max 10 clients
- `src/api/server.js`: imports `setupLogStream`/`stopLogStream`, wires WS server into `startServer()` via options param, cleans up in `stopServer()`
- `src/logger.js`: imports `WebSocketTransport`, adds `addWebSocketTransport()` and `removeWebSocketTransport()` exports
- `src/index.js`: calls `addWebSocketTransport()` before `startServer()`, passes transport via options
- `tests/transports/websocket.test.js`: 18 tests — transport, filtering, broadcast, edge cases
- `tests/api/ws/logStream.test.js`: 16 tests — auth flow, rejection, max clients, streaming, filtering, message handling, lifecycle, shutdown

**Tests:** 1292 passing, 1 skipped (62 test files)

**Lint:** All new files pass biome lint. Pre-existing lint issues in other files unchanged.

**Blockers:** None
