# Test Coverage Analysis

**Date:** 2026-03-19
**Test suite:** 190 test files, 3,895 test cases (3,892 passing, 2 failing, 2 skipped)

## Current State

The project has **164 test files** covering **~45 commands, ~46 modules, 19 API routes, 8 middleware, 9 API utilities, and 25 utils**. The Vitest config enforces an **85% coverage threshold** across statements, branches, functions, and lines.

### Existing Test Failures

| Test File | Failure | Root Cause |
|-----------|---------|------------|
| `tests/logger.test.js` | `addPostgresTransport` — "not a constructor" | `vi.mock` returns a plain function instead of a class; needs `vi.fn(() => ({ on, log, close }))` wrapped with proper constructor semantics |
| `tests/api/utils/ssrfProtection.test.js` | `validateUrlForSsrf` — 10s timeout | DNS resolution against `example.com` in CI/sandboxed environments; needs mocked `dns.resolve` |

### Vitest Deprecation Warnings

Multiple test files use **nested `vi.mock()` calls** that will become errors in a future Vitest version. Affected files:
- `tests/logger.test.js`
- `tests/config-listeners.test.js`
- `tests/modules/config.test.js`
- `tests/modules/config-events.test.js`

These `vi.mock()` calls must be moved to the top level of the module.

---

## Source Files With No Test Coverage

| File | Complexity | Priority |
|------|-----------|----------|
| `src/modules/pollHandler.js` (~300 lines) | DB transactions, button interactions, vote toggling, poll expiry | **High** |
| `src/modules/reviewHandler.js` (~327 lines) | DB queries, claim buttons, thread creation, stale review expiry | **High** |
| `src/modules/reputationDefaults.js` (~13 lines) | Static config object | Low |
| `src/api/middleware/requireGlobalAdmin.js` (~49 lines) | Auth middleware, permission checks | **Medium** |

### Recommended: `pollHandler.js`

This module has significant logic:
- `buildPollEmbed()` — vote counting, bar rendering, footer formatting
- `buildPollButtons()` — button row splitting (max 5 per row)
- `handlePollVote()` — DB transactions with `FOR UPDATE` locking, multi-vote vs single-vote toggle, expired poll rejection
- `closePoll()` — state transition and embed update
- `closeExpiredPolls()` — batch query and per-poll error isolation

### Recommended: `reviewHandler.js`

Complex interaction handling:
- `buildReviewEmbed()` — status colors, field truncation, conditional fields
- `handleReviewClaim()` — self-claim prevention, atomic UPDATE with race condition protection, thread creation
- `expireStaleReviews()` — per-guild config, batch expiry, nudge messages
- `updateReviewMessage()` — channel/message fetch with error recovery

### Recommended: `requireGlobalAdmin.js`

Security-critical middleware with 3 auth method branches (api-secret, oauth + bot owner, unknown).

---

## Quality Gaps in Existing Tests

### 1. Database Error Handling (All Modules) — **HIGH PRIORITY**

Almost every module uses fire-and-forget `pool.query()` calls where failures are caught and logged. None of the tests verify this behavior. If the DB connection drops mid-operation, we have no test confidence that:
- Transactions are properly rolled back
- Partial state isn't persisted
- The bot doesn't crash

**Affected modules:** `ai.js`, `triage.js`, `moderation.js`, `warningEngine.js`, `pollHandler.js`, `reviewHandler.js`

**Recommended action:** Add tests that mock `pool.query()` to reject, verifying rollback behavior and graceful error logging.

### 2. Auth Route Security Edge Cases — **HIGH PRIORITY**

`src/api/routes/auth.js` has several untested security-relevant paths:

| Gap | Risk |
|-----|------|
| OAuth state reuse after first consumption | CSRF protection bypass |
| `isValidDashboardUrl()` with malformed URLs, IPv6, port numbers | Open redirect |
| Token exchange with malformed response bodies | Unhandled exceptions |
| `/me` session store failures (should return 503) | Silent auth failures |
| Rate limiter 429 responses | Rate limit bypass |
| User fetch `AbortSignal.timeout(10_000)` firing | Hang on Discord API outage |

### 3. Concurrent Operation Race Conditions — **MEDIUM PRIORITY**

Several modules use database-level locking (`FOR UPDATE`, `FOR UPDATE SKIP LOCKED`, atomic `UPDATE ... WHERE status = 'open'`) but tests never exercise concurrent scenarios:

- **moderation.js:** `pollTempbans` uses `SKIP LOCKED` but no test verifies two concurrent pollers don't double-unban
- **triage.js:** `pendingReeval` flag prevents concurrent evaluations but isn't tested under contention
- **warningEngine.js:** `removeWarning` with `active = TRUE` filter isn't tested for the case where another process deactivated it

### 4. CLI/AI Timeout and Parse Failures — **MEDIUM PRIORITY**

`triage.js` spawns Claude CLI in headless mode. Gaps:
- `CLIProcessError` with `'timeout'` reason is rethrown but upstream handling isn't tested
- `parseClassifyResult` returning invalid structures (missing fields, wrong types) isn't tested
- Memory extraction (`extractMemories`) failures are fire-and-forget — never verified

### 5. Bot Startup Error Recovery — **MEDIUM PRIORITY**

`src/index.js` has untested failure modes:
- Redis initialization failure (graceful degradation intended but not verified)
- API server startup failure (bot should continue without dashboard API)
- Command loading failure (currently has `it.skip()` noting vitest limitation)
- State file corruption (conversationHistory present but wrong type)
- Sentry flush timeout during shutdown

### 6. Welcome Module Error Paths — **LOW PRIORITY**

`welcome.js` has excellent happy-path coverage (35 tests) but minor gaps:
- `buildDynamicWelcomeMessage` doesn't catch errors from sub-builders (`buildVibeLine`, `buildCtaLine`)
- Invalid timezone fallback in `getHourInTimezone()` isn't verified
- Milestone interval of 0 (should be treated as "no interval")

---

## Summary of Recommendations

### Immediate (fix existing issues)

1. **Fix 2 failing tests** — logger mock constructor and SSRF DNS resolution
2. **Move nested `vi.mock()` calls to top level** in 4 test files (will become errors in future Vitest)

### High Priority (new test files)

3. **Add `tests/modules/pollHandler.test.js`** — cover embed building, vote toggling, transaction rollback, poll expiry
4. **Add `tests/modules/reviewHandler.test.js`** — cover embed building, claim flow, self-claim prevention, stale expiry
5. **Add `tests/api/middleware/requireGlobalAdmin.test.js`** — cover all 3 auth method branches
6. **Harden `tests/api/routes/auth.test.js`** — add state reuse, URL validation edge cases, timeout, and rate limit tests

### Medium Priority (deepen existing tests)

7. **Add DB failure tests across modules** — mock `pool.query()` rejections in ai, triage, moderation, warningEngine
8. **Add concurrent operation tests** — verify locking semantics in moderation and triage
9. **Add CLI timeout/parse failure tests** — verify triage handles broken AI responses gracefully
10. **Add startup failure tests to `index.test.js`** — Redis failure, API server failure, state corruption

### Low Priority

11. **Add `tests/modules/reputationDefaults.test.js`** — simple snapshot test for the config object
12. **Add error path tests to `welcome.test.js`** — timezone fallback, sub-builder exceptions
