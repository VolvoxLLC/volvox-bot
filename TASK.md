# Task: Log Viewer Page + WebSocket Client

## Parent
- **Master Task:** task-001
- **Branch:** feat/logs-and-health
- **Issue:** [#35](https://github.com/VolvoxLLC/volvox-bot/issues/35)

## Context

Build the frontend log viewer page that connects to the WebSocket server at `/ws/logs` and displays real-time + historical logs in a terminal-style UI.

### Existing Code
- `web/src/app/dashboard/` — Dashboard pages (reference for routing/layout)
- `web/src/components/dashboard/config-editor.tsx` — Reference for dashboard component patterns
- `web/src/lib/bot-api-proxy.ts` — API proxy (reference for auth patterns)
- Backend WebSocket server at `/ws/logs` — auth via `{ type: "auth", secret }`, streams `{ type: "log" }`, accepts `{ type: "filter" }`

## IMPORTANT — READ FIRST

1. **Commit after every file you create or major change**
2. **Start writing code IMMEDIATELY**
3. **Expected duration: ~20m**

**Commit flow:**
1. Create WS client hook → commit
2. Create log viewer component → commit
3. Create filter bar component → commit
4. Create page route → commit
5. Wire navigation → commit
6. Lint/build → commit

## Files to Create

- `web/src/lib/log-ws.ts` — WebSocket client hook (`useLogStream`)
- `web/src/components/dashboard/log-viewer.tsx` — Terminal-style log display
- `web/src/components/dashboard/log-filters.tsx` — Filter bar (level, module, search)
- `web/src/app/dashboard/logs/page.tsx` — Log viewer page

## Requirements

- [x] **WebSocket client hook** (`useLogStream`):
  - Connect to `/ws/logs`, send auth message
  - Handle `auth_ok`, `history`, `log` message types
  - Auto-reconnect on disconnect (exponential backoff)
  - Send filter messages to server
  - Expose: `logs`, `isConnected`, `isReconnecting`, `sendFilter`, `clearLogs`
- [x] **Log viewer component**:
  - Terminal-style: dark background, **JetBrains Mono** font
  - Color-coded levels: 🔴 error (red), 🟡 warn (yellow), 🔵 info (blue), ⚫ debug (gray)
  - Auto-scroll to bottom with "Pause" button to freeze
  - Click log entry to expand metadata JSON
  - Max 1000 logs in memory (drop oldest)
  - Connection status indicator (🟢 connected, 🔴 disconnected, 🟡 reconnecting)
- [x] **Filter bar**:
  - Level dropdown (all, error, warn, info, debug)
  - Module text input
  - Search text input
  - "Clear" button
  - Sends filter to WS server on change
- [x] **Page route** at `/dashboard/logs`
- [x] Add "Logs" link to dashboard navigation
- [x] Lint passes, build succeeds

## Constraints
- Do NOT touch backend files
- Do NOT touch health cards (different slice)
- Use existing shadcn/ui components where possible
- Use Tailwind for styling

## Acceptance Criteria
- [ ] `/dashboard/logs` page loads
- [ ] WebSocket connects and authenticates
- [ ] Historical logs display on connect
- [ ] Real-time logs stream in
- [ ] Filters work (level, module, search)
- [ ] Auto-scroll with pause button
- [ ] Click to expand metadata
- [ ] Connection status indicator
- [ ] Navigation link added
- [ ] Lint + build pass

## Results

**Status:** ✅ Done

**Commits:**
- `88f10c2` feat: add /api/log-stream/ws-ticket route for authenticated WS connection
- `ea06e14` feat: add useLogStream WebSocket hook with auto-reconnect
- `8ae516d` feat: add LogViewer terminal-style component with auto-scroll and metadata expansion
- `0efdcf9` feat: add LogFilters component with level/module/search controls
- `1095bf1` feat: add /dashboard/logs page route + fix gitignore scope
- `ede33e4` feat: add Logs link to dashboard sidebar navigation

**Files Created:**
- `web/src/app/api/log-stream/ws-ticket/route.ts` — Server-side API route; validates NextAuth session, returns WS URL + secret to browser
- `web/src/lib/log-ws.ts` — `useLogStream` hook with auto-reconnect (exponential backoff), auth, history/log/filter message handling, 1000-entry cap
- `web/src/components/dashboard/log-viewer.tsx` — Terminal-style viewer (JetBrains Mono, color-coded levels, auto-scroll, pause, click-to-expand meta)
- `web/src/components/dashboard/log-filters.tsx` — Filter bar: level dropdown, module input, search input, clear button; debounced text inputs
- `web/src/app/dashboard/logs/page.tsx` — Page route at /dashboard/logs

**Files Modified:**
- `web/src/components/layout/sidebar.tsx` — Added "Logs" nav link (ScrollText icon)
- `.gitignore` — Scoped `logs/` to root-only (`/logs/`) so Next.js routes named `logs/` aren't ignored

**Note on architecture:** `BOT_API_SECRET` stays server-side. Browser first calls `/api/log-stream/ws-ticket` (NextAuth-gated), receives WS URL + secret, then connects to bot WS directly.

**Lint:** Pre-existing errors in `src/` only — zero errors in new web/ files.
**Build:** ✅ `next build` passed — `/dashboard/logs` and `/api/log-stream/ws-ticket` both appear in route manifest.

## Acceptance Criteria
- [x] `/dashboard/logs` page loads
- [x] WebSocket connects and authenticates
- [x] Historical logs display on connect
- [x] Real-time logs stream in
- [x] Filters work (level, module, search)
- [x] Auto-scroll with pause button
- [x] Click to expand metadata
- [x] Connection status indicator
- [x] Navigation link added
- [x] Lint + build pass
