# Task: Fix PR #87 Frontend Review Comments

## Parent
- **PR:** [#87](https://github.com/VolvoxLLC/volvox-bot/pull/87)
- **Branch:** feat/logs-and-health

## IMPORTANT — READ FIRST
1. **Commit after every file you fix**
2. **Start writing code IMMEDIATELY**
3. **Expected duration: ~15m**

## Issues to Fix (15 total)

### Critical/Major
1. **`web/src/app/api/log-stream/ws-ticket/route.ts:56`** — SECURITY: `BOT_API_SECRET` returned raw to the browser. This breaks the security model. The endpoint should NOT return the secret directly. Instead, generate a short-lived token/ticket that the WS server can validate, OR have the WS server validate via a different mechanism.
2. **`web/src/components/dashboard/health-cards.tsx:87`** — CPU card shows cumulative CPU time, not utilization. `process.cpuUsage()` returns microseconds, not percentage. Need to calculate delta between two readings or display differently.
3. **`web/src/components/dashboard/log-viewer.tsx:79`** — Metadata toggle not keyboard-accessible. Add `onKeyDown` handler for Enter/Space, use `role="button"` and `tabIndex={0}`.
4. **`web/src/lib/log-ws.ts:70`** — Flatten server `metadata` into `meta` during normalization. Currently keeps raw server format.
5. **`web/src/lib/log-ws.ts:119`** — Retry ticket-fetch failures instead of returning permanently. Add retry logic with backoff.

### Minor
6. **`.gitignore:4`** — Root-scoped `/logs/` makes unignore rules redundant. Clean up.
7. **`web/src/app/api/bot-health/route.ts:30`** — Misleading error message when only one config value missing. Check which is missing.
8. **`web/src/app/api/bot-health/route.ts:69`** — Inconsistent error logging. Use structured format.
9. **`web/src/app/dashboard/logs/page.tsx:25`** — `handleFilterChange` wrapper adds no value. Pass `sendFilter` directly.
10. **`web/src/app/dashboard/logs/page.tsx:46`** — Filters enabled during "connecting" state. Disable until connected.
11. **`web/src/components/dashboard/health-cards.tsx:47`** — 300ms ping classified as red. Use `<=` not `<`.
12. **`web/src/components/dashboard/health-section.tsx:80`** — `setLoading(false)` redundant on background refresh.
13. **`web/src/components/dashboard/restart-history.tsx:41`** — Dead code: `|| "< 1m"` fallback unreachable.
14. **`web/src/components/dashboard/restart-history.tsx:71`** — `"start"` substring matches `"restart"`, misclassifying as green. Use exact match or startsWith.
15. **`web/src/components/dashboard/types.ts:65`** — `isBotHealth` doesn't validate individual `RestartRecord` items. Add item validation.

## Constraints
- Do NOT touch backend files
- Fix each file, commit, move to next

## Acceptance Criteria
- [ ] All 15 frontend issues fixed
- [ ] Build passes (`cd web && npx next build`)
- [ ] TypeScript clean (`tsc --noEmit`)
- [ ] All changes committed progressively

## Results

**Status:** ✅ Done

**Commits (12 progressive):**
- `e678912` fix(security): replace raw BOT_API_SECRET with short-lived HMAC ticket
- `61589f7` fix: show CPU utilization % instead of raw cumulative seconds
- `642ed56` fix(a11y): make log metadata toggle keyboard-accessible
- `f5252d9` fix: flatten server metadata field into meta during normalization
- `9c25e5f` fix: retry ticket-fetch failures with exponential backoff
- `f88b176` chore: clean up .gitignore — remove redundant /logs/security/ and unignore rules
- `e8f5f13` fix: improve bot-health error logging — show which env vars are missing
- `167a06b` fix: pass sendFilter directly and disable filters until connected
- `8188397` fix: classify 300ms ping as yellow, not red
- `38c7a2d` fix: skip redundant setLoading(false) on background health refresh
- `a14feca` fix: restart-history — remove dead code and fix 'start' matching 'restart'
- `3523768` fix: validate individual RestartRecord items in isBotHealth

**Changes (10 files, +109/-51):**
- `.gitignore` — removed redundant `/logs/security/` and unignore rules
- `ws-ticket/route.ts` — HMAC ticket generation, no longer exposes raw secret
- `log-ws.ts` — use ticket auth, flatten metadata, retry ticket-fetch failures
- `health-cards.tsx` — CPU shows utilization %, ping 300ms is yellow not red
- `log-viewer.tsx` — keyboard-accessible metadata toggle (Enter/Space, role, tabIndex)
- `bot-health/route.ts` — structured error logging, specific missing env vars
- `logs/page.tsx` — removed wrapper fn, filters disabled until connected
- `health-section.tsx` — no redundant setLoading(false) on background refresh
- `restart-history.tsx` — removed dead code, fixed 'start' matching 'restart'
- `types.ts` — isBotHealth validates individual RestartRecord items

**Build:** ✅ `next build` passes (compiled in 6.4s, all routes generated)
**TypeScript:** ✅ `tsc --noEmit` clean (0 errors)
**Blockers:** None
