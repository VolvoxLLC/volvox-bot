# Task: Health Cards + Restart History UI

## Parent
- **Master Task:** task-001
- **Branch:** feat/logs-and-health
- **Issue:** [#35](https://github.com/VolvoxLLC/volvox-bot/issues/35)

## Context

Build health metric cards and restart history table for the dashboard. Data comes from the extended health endpoint (`GET /api/v1/health`).

### Existing Code
- `web/src/lib/bot-api-proxy.ts` — API proxy for authenticated requests
- `web/src/components/dashboard/config-editor.tsx` — Reference for dashboard patterns
- `web/src/components/ui/` — shadcn/ui components (card, table, badge, etc.)
- Health endpoint returns: uptime, memory, discord, system, errors, restarts

## IMPORTANT — READ FIRST

1. **Commit after every file you create or major change**
2. **Start writing code IMMEDIATELY**
3. **Expected duration: ~15m**

**Commit flow:**
1. Create health cards component → commit
2. Create restart history component → commit
3. Create page or section → commit
4. Lint/build → commit

## Files to Create

- `web/src/components/dashboard/health-cards.tsx` — Health metric cards
- `web/src/components/dashboard/restart-history.tsx` — Restart log table
- `web/src/app/dashboard/logs/page.tsx` — Add health section (if page exists from log viewer slice, just add to it — otherwise create)

## Requirements

- [ ] **Health cards** (grid layout):
  | Card | Data | Display |
  |------|------|---------|
  | Uptime | `health.uptime` | Human-readable ("3d 14h 22m") |
  | Memory | `health.memory.heapUsed/heapTotal` | MB + percentage bar |
  | Discord Ping | `health.discord.ping` | ms, color: green <100, yellow <300, red >300 |
  | Guilds | `health.discord.guilds` | Count |
  | Errors (1h) | `health.errors.lastHour` | Count, red if >0 |
  | Errors (24h) | `health.errors.lastDay` | Count |
  | CPU | `health.system.cpuUsage` | user + system % |
  | Node | `health.system.nodeVersion` | Version string |
- [ ] **Restart history table**:
  - Columns: timestamp, reason, version, uptime before restart
  - Last 20 restarts from `health.restarts`
  - Human-readable timestamps
  - Color-coded reasons (startup=green, crash=red)
- [ ] Auto-refresh health data every 60s
- [ ] Loading skeleton while fetching
- [ ] Lint passes, build succeeds

## Constraints
- Do NOT touch backend files
- Do NOT touch log viewer (different slice)
- Use shadcn/ui Card, Table, Badge components
- Use Tailwind for styling

## Acceptance Criteria
- [ ] Health cards display all 8 metrics
- [ ] Color coding works for ping and errors
- [ ] Restart history table shows recent restarts
- [ ] Auto-refresh every 60s
- [ ] Loading state while fetching
- [ ] Lint + build pass

## Results

**Status:** ✅ Done

**Commits:**
- `45f908d` feat: add bot health API proxy route
- `3c213c5` feat: add health cards component and shared types
- `c71f821` feat: add restart history table component
- `8157ffe` feat: add health section orchestrator and logs page; fix gitignore for logs route

**Changes:**
- `web/src/app/api/bot-health/route.ts` — authenticated proxy to bot's `GET /api/v1/health`
- `web/src/components/dashboard/types.ts` — `BotHealth` / `RestartRecord` types + runtime validator
- `web/src/components/dashboard/health-cards.tsx` — 8-card grid (uptime, memory + bar, discord ping w/ color, guilds, errors 1h/24h w/ red, CPU, Node version)
- `web/src/components/dashboard/restart-history.tsx` — table with last 20 restarts, color-coded reason badges, human-readable timestamps
- `web/src/components/dashboard/health-section.tsx` — client component with auto-refresh (60s), loading skeleton, error banner, refresh button
- `web/src/app/dashboard/logs/page.tsx` — new `/dashboard/logs` route rendering `<HealthSection />`
- `.gitignore` — added exception for `web/src/app/dashboard/logs/` (conflicts with `logs/` gitignore rule)

**Build:** ✅ `next build` — compiled successfully, `/dashboard/logs` route created
**TypeCheck:** ✅ `tsc --noEmit` — no errors in new files
**Root lint:** Pre-existing failures in bot JS files only (26 errors existed before this task)

**Acceptance Criteria:**
- [x] Health cards display all 8 metrics
- [x] Color coding works for ping (green/yellow/red) and errors (red if >0)
- [x] Restart history table shows recent restarts (last 20, reversed)
- [x] Auto-refresh every 60s
- [x] Loading state while fetching (skeleton cards + table skeleton)
- [x] Lint + build pass (build ✅, root lint pre-existing failures not introduced by this task)
