# Task: Restart Tracker + DB Migration

## Parent
- **Master Task:** task-001
- **Branch:** feat/logs-and-health
- **Issue:** [#35](https://github.com/VolvoxLLC/volvox-bot/issues/35)

## Context

Track bot restarts in a PostgreSQL table so the dashboard can display restart history.

### Existing Code
- `src/db.js` — PostgreSQL pool (`getPool()`)
- `src/transports/postgres.js` — Reference for DB interaction patterns
- `src/index.js` or `src/bot.js` — Bot startup entry point (record restart here)

## Files to Create/Modify

**Create:**
- `src/utils/restartTracker.js` — Record/query restarts

**Modify:**
- Bot entry point — Call `recordRestart()` on startup
- Graceful shutdown handler — Update uptime on shutdown

## Requirements

- [ ] Create `bot_restarts` table (auto-create if not exists):
  ```sql
  CREATE TABLE IF NOT EXISTS bot_restarts (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    reason TEXT NOT NULL DEFAULT 'startup',
    version TEXT,
    uptime_seconds NUMERIC
  );
  ```
- [ ] `recordRestart(reason, version)` — Insert row on bot startup
- [ ] `updateUptimeOnShutdown()` — Update last row with uptime on graceful shutdown
- [ ] `getRestarts(limit)` — Query recent restarts (default 20)
- [ ] `getLastRestart()` — Get most recent restart
- [ ] Auto-create table if not exists (in `recordRestart`)
- [ ] Tests pass
- [ ] Lint passes

## IMPORTANT
- **Commit progressively** — commit after creating the file, after wiring in, after tests
- Do NOT wait until everything is done to commit
- This is a SMALL task — should take ~10 minutes

## Constraints
- Do NOT touch WebSocket code
- Do NOT touch health endpoint
- Do NOT touch frontend

## Acceptance Criteria
- [x] `bot_restarts` table created on first startup
- [x] Restart recorded on bot startup
- [x] Uptime updated on graceful shutdown
- [x] `getRestarts()` returns recent restart history
- [x] All existing tests pass

## Results

**Status:** ✅ Done

**Commits:**
- `739e385` feat: add restartTracker utility
- `82d9a09` feat: wire restart tracking into startup and graceful shutdown
- `dcbc76c` test: add restartTracker tests and fix index test mock for package.json reads

**Changes:**
- `src/utils/restartTracker.js` — New utility: `recordRestart()`, `updateUptimeOnShutdown()`, `getRestarts()`, `getLastRestart()`, `getStartedAt()`, `_resetState()`. Auto-creates `bot_restarts` table via `ensureTable()` on first `recordRestart()` call.
- `src/index.js` — Added `getPool` import, `BOT_VERSION` constant from package.json, `recordRestart()` call in `startup()` after DB init, `updateUptimeOnShutdown()` call in `gracefulShutdown()` before pool close. Biome import-sort applied.
- `tests/utils/restartTracker.test.js` — 13 new tests covering all exported functions (happy path + error paths).
- `tests/index.test.js` — Updated `readFileSync` mock to be path-aware so `package.json` reads return valid JSON regardless of `stateRaw` scenario.

**Tests:** 1271 passing | 1 skipped | 61 files

**Lint:** Biome clean on all changed files

**Blockers:** None
