# Task: Fix PR #87 Backend Review Comments

## Parent
- **PR:** [#87](https://github.com/VolvoxLLC/volvox-bot/pull/87)
- **Branch:** feat/logs-and-health

## IMPORTANT — READ FIRST
1. **Commit after every file you fix**
2. **Start writing code IMMEDIATELY**
3. **Expected duration: ~15m**

## Issues to Fix (10 total)

### Critical
1. **`src/api/ws/logStream.js:145`** — Critical issue flagged by reviewer. Read the code around line 145, check what's wrong, fix it.

### Major
2. **`src/api/routes/health.js:8`** — `queryLogs` is a hard static import for an optional diagnostic feature. Make it a lazy/dynamic import with graceful fallback.
3. **`src/api/routes/health.js:71`** — A `queryLogs` failure causes health endpoint to return 500. Wrap in try/catch, return partial data on failure.
4. **`src/transports/websocket.js:85`** — Coerce `info.message` to string before search filtering (it can be non-string).
5. **`src/utils/restartTracker.js:108`** — `getRestarts()` should self-heal when table is missing (auto-create like `recordRestart` does).
6. **`tests/api/ws/logStream.test.js:56`** — Timed-out queue waiters are not removed correctly. Line 50 compares different function references.

### Minor
7. **`src/api/ws/logStream.js:313`** — Add structured metadata to shutdown log entry.
8. **`src/index.js:268`** — Don't swallow shutdown failures silently. Log the error.
9. **`src/utils/restartTracker.js:72`** — Add structured metadata to warning log.
10. **`TASK.md:3`** — Ignore (markdownlint warnings, not real code).

## Constraints
- Do NOT touch frontend files
- Fix each file, commit, move to next

## Acceptance Criteria
- [x] All 9 backend issues fixed (skip TASK.md markdownlint)
- [x] Tests pass
- [x] Lint passes
- [x] All changes committed progressively

## Results

**Status:** ✅ Done

**Commits:** (7 progressive commits)
- `51a1370` fix: await async handleAuth in WS message handler, add shutdown metadata
- `f33207b` fix: lazy-load queryLogs in health route, wrap in try/catch
- `2075903` fix: coerce message to string before search filtering in WS transport
- `e8af514` fix: self-heal getRestarts on missing table, add structured warn metadata
- `eff5fc0` fix: correctly remove timed-out queue waiters in test helper
- `4406415` fix: log shutdown uptime recording failures instead of swallowing silently
- `6e3e3c9` test: update restartTracker test for structured warn metadata

**Changes:**
- `src/api/ws/logStream.js`: Made handleMessage async, await handleAuth, added .catch() for unhandled rejections, added structured shutdown metadata
- `src/api/routes/health.js`: Converted queryLogs to lazy dynamic import, wrapped usage in try/catch with partial data fallback
- `src/transports/websocket.js`: Coerce entry.message to String() before search filtering
- `src/utils/restartTracker.js`: getRestarts auto-creates table on 42P01 error (self-heal), added structured metadata to warn log
- `tests/api/ws/logStream.test.js`: Fixed waiter removal using indexOf(waiter) instead of broken resolve reference comparison
- `src/index.js`: Replaced silent catch with warn() for shutdown uptime recording failures
- `tests/utils/restartTracker.test.js`: Updated test assertion for new structured warn metadata

**Tests:** 1308 passing, 1 skipped, 0 failed
**Lint:** Clean (biome check passes)

**Blockers:** None
