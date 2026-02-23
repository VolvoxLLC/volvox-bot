# Code Review — bills-bot

**Date:** 2026-02-23
**Branch:** `review/main-code-review`
**Reviewers:** 4 specialized agents (security, architecture, code quality, test coverage)
**Scope:** All 69 source files in `src/`, all 30+ test files in `tests/`

---

## Executive Summary

The codebase is **functional and well-structured for a solo/small-team project**, with strong patterns in several areas (parameterized SQL, multi-layer auth, triage split-model design). However, it has accumulated technical debt typical of rapid feature growth — god modules, tight coupling, and gaps in test coverage for infrastructure code.

**Top 10 findings by impact:**

1. 🔴 **`ai.js:229` — missing `logError` import** will crash in production (runtime ReferenceError)
2. 🔴 **`triage.js` — 1191-line god module** with 12+ responsibilities (maintenance nightmare)
3. 🔴 **`cli-process.js` — 606 lines, zero test coverage** (most complex untested code)
4. 🔴 **`index.test.js` — 33/34 tests failing** (bot startup/shutdown not verified)
5. 🟠 **SQL injection risk in analytics** — `date_trunc()` built via string interpolation
6. 🟠 **No CLI process restart** — Claude CLI crash = permanently deaf bot
7. 🟠 **Inline DB migrations** — no version tracking, concurrent deploy hazards
8. 🟠 **Prompt injection surface** — no per-message length limit on user content
9. 🟠 **In-memory session store** — blocks horizontal scaling, sessions lost on restart
10. 🟠 **11 moderation commands** share identical boilerplate (DRY violation)

---

## Severity Breakdown

| Severity | Security | Architecture | Code Quality | Tests | **Total** |
|----------|----------|-------------|-------------|-------|-----------|
| CRITICAL | 1 | 1 | 2 | 2 | **6** |
| HIGH | 4 | 5 | 7 | 3 | **19** |
| MEDIUM | 6 | 6 | 13 | 5 | **30** |
| LOW | 5 | 3 | 8 | 2 | **18** |
| INFO | 2 | 0 | 5 | 0 | **7** |
| **Total** | **18** | **15** | **35** | **12** | **80** |

---

## 1. Security

### CRITICAL

| ID | File | Line | Finding | Recommendation |
|----|------|------|---------|----------------|
| S-C1 | `config.json` | 102 | Bot owner IDs hardcoded in repo — these users bypass ALL permission checks | Move `botOwners` to env var (`BOT_OWNER_IDS`), keep config.json for structural defaults only |

### HIGH

| ID | File | Line | Finding | Recommendation |
|----|------|------|---------|----------------|
| S-H1 | `src/api/routes/guilds.js` | 544 | `date_trunc()` expression built via string interpolation from user-controlled `interval` — SQL injection risk if `parseAnalyticsInterval()` is ever modified | Parameterize: pass `'hour'`/`'day'` as `$N` query param |
| S-H2 | `src/modules/triage.js` | 442-447 | User Discord messages interpolated directly into AI prompts without length limits. Current mitigation: system prompt warning + sanitizeText() + 30-message buffer. Missing: per-message char limit, jailbreak pattern filtering | Enforce per-message limit (500-1000 chars), add XML delimiters around user content |
| S-H3 | `src/modules/cli-process.js` | 241 | CLI subprocess spawning — **currently safe** (array args, no shell:true). Document why `shell: false` is critical and validate `baseUrl` format | Add defensive comment, URL format validation on baseUrl |
| S-H4 | `src/api/routes/auth.js` | 114 | OAuth state generation not rate-limited. Attacker can exhaust 10K state limit and evict legitimate in-flight OAuth flows | Apply rate limiting middleware to `/api/v1/auth/discord` |

### MEDIUM

| ID | File | Line | Finding | Recommendation |
|----|------|------|---------|----------------|
| S-M1 | `src/api/routes/auth.js` | 41-61 | `isValidDashboardUrl()` allows HTTP for localhost but doesn't enforce HTTPS in production | Add `NODE_ENV=production` check rejecting non-HTTPS |
| S-M2 | `src/api/middleware/verifyJwt.js` | 22-26 | `SESSION_SECRET` falls back to empty string — allows trivial JWT forgery. Failure mode is runtime error, not startup failure | Fail fast at startup if `SESSION_SECRET` is missing |
| S-M3 | `src/modules/config.js` | 781 | Dangerous keys (`__proto__`, `constructor`) filtered on writes but not reads. If inserted via raw SQL, they'd propagate | Filter on read side; add DB CHECK constraint |
| S-M4 | `src/commands/config.js` | 271,325,360 | Error handlers return raw `err.message` in development mode — leaks internal paths, connection strings | Never return raw errors to users; log server-side only |
| S-M5 | `src/api/utils/sessionStore.js` | 38-63 | In-memory session store — sessions lost on restart, can't scale horizontally, memory grows unbounded | Migrate to Redis for production |
| S-M6 | `src/api/routes/guilds.js` | 862 | No CSRF protection on `POST /:id/actions`. Mitigated by CORS, but vulnerable if CORS misconfigured | Add CSRF token or restrict API-secret to server-to-server |

### LOW

| ID | File | Line | Finding | Recommendation |
|----|------|------|---------|----------------|
| S-L1 | `src/api/routes/guilds.js` | 188 | `hasOAuthGuildPermission()` checks ANY flag (bitwise OR) but name suggests ALL — future misuse risk | Rename param to `anyOfFlags` |
| S-L2 | `src/api/middleware/rateLimit.js` | 33 | Rate limiter uses `req.ip` without verifying `trust proxy` config — inaccurate behind proxies | Configure `app.set('trust proxy', true)` |
| S-L3 | `src/modules/config.js` | 85-98 | No integrity check for config.json after loading | Document as out-of-scope or add hash verification |
| S-L4 | `src/api/routes/auth.js` | 105-109 | OAuth config errors log which env vars are missing (not values) — minor info leakage | Log generic "OAuth2 not configured" without specifics |
| S-L5 | `src/modules/cli-process.js` | 531-545 | Restart caps at 3 retries — transient Anthropic outages permanently disable triage | Increase to 5-7 retries with jitter; add circuit breaker |

### Positive Observations

- ✅ 99%+ of SQL queries use parameterized placeholders
- ✅ Multi-layered auth (API secret with `crypto.timingSafeEqual` + OAuth2 JWT)
- ✅ Mention sanitization with defense-in-depth (@everyone/@here protection)
- ✅ CORS properly configured
- ✅ No hardcoded API keys or tokens in source

---

## 2. Architecture

### CRITICAL

| ID | File | Finding | Recommendation |
|----|------|---------|----------------|
| A-C1 | `src/modules/triage.js` | **God module** — 1191 LOC with 12+ responsibilities: buffering, scheduling, filtering, prompt building, CLI orchestration, response formatting, moderation logging, memory injection, analytics | Split into `triage-buffer.js`, `triage-scheduler.js`, `triage-classifier.js`, `triage-responder.js` |

### HIGH

| ID | File | Finding | Recommendation |
|----|------|---------|----------------|
| A-H1 | `src/db.js:92-269` | **Inline DDL migrations** — no version tracking, no rollback capability, concurrent deploy deadlocks possible | Adopt `node-pg-migrate` with versioned migrations and advisory locks |
| A-H2 | `src/modules/triage.js:873-894` | **CLI process restart not wired** — `restart()` exists in cli-process.js but nothing calls it. Claude CLI crash = permanently deaf bot | Wire restart() into triage error handlers; add circuit breaker after 3 failures in 60s |
| A-H3 | `src/api/utils/sessionStore.js` | **In-memory session store** blocks horizontal scaling and loses state on restart | Replace with Redis-backed sessions |
| A-H4 | `src/modules/triage.js:953-996` | **Tight lifecycle coupling** triage.js ↔ cli-process.js — triage owns process instantiation, config, and error handling | Extract `TriageProcessManager` abstraction |
| A-H5 | Multiple | **Single-process architecture** with all state in-memory (triage buffers, session store, config cache) — blocks scale-out | Move state to Redis for distributed deployments |

### MEDIUM

| ID | File | Finding | Recommendation |
|----|------|---------|----------------|
| A-M1 | `src/modules/config.js:517-554` | Config ↔ DB coupling — config.js knows PostgreSQL transaction internals (SELECT FOR UPDATE, ROLLBACK) | Extract `ConfigRepository` class |
| A-M2 | Multiple | **No centralized error boundary** — CLIProcessError caught at 3+ overlapping layers | Implement `ErrorBoundary` class with `classify()` and `handle()` |
| A-M3 | `src/modules/cli-process.js:384` | **SIGKILL timeout** — no grace period, subprocess can't flush diagnostics | Use SIGTERM → 2s wait → SIGKILL escalation |
| A-M4 | `src/modules/ai.js:220-237` | **Missing transactions** — multi-statement DB writes are fire-and-forget without atomicity | Wrap in BEGIN/COMMIT with `pool.connect()` |
| A-M5 | `src/modules/events.js:141-169` | **Inappropriate intimacy** — events.js manually orchestrates `accumulateMessage()` + `evaluateNow()` with knowledge of internal buffer mechanics | Expose `handleMention()` facade from triage.js |
| A-M6 | `src/db.js:68-74` | **Hard-coded pool size** (max=5) — no back-pressure when saturated | Make configurable via `PG_POOL_SIZE` env var |

### LOW

| ID | File | Finding | Recommendation |
|----|------|---------|----------------|
| A-L1 | `src/modules/config.js:277-280` | `getConfig()` returns live reference for global config — mutations bypass cache invalidation | Document or freeze returned objects |
| A-L2 | Multiple | **Prompt building scattered** across triage.js, prompts/index.js, and inline concatenation | Extract `PromptBuilder` class |
| A-L3 | `src/modules/triage.js:1093-1096` | Buffer truncation (>30 messages) is silent — no alerting when messages are dropped | Emit warning; add healthMonitor metric |

### Design Strengths

- ✅ Two-step triage (cheap Haiku classifier → expensive Sonnet responder) — excellent cost optimization
- ✅ Three-layer config hierarchy (config.json → DB global → DB per-guild) with hot-reload
- ✅ LRU cache for guild configs with generation-based invalidation
- ✅ Token-based CLI process recycling
- ✅ No circular dependencies detected
- ✅ Clean API route organization with proper middleware composition

---

## 3. Code Quality

### CRITICAL

| ID | File | Line | Finding | Recommendation |
|----|------|------|---------|----------------|
| Q-C1 | `src/modules/ai.js` | 229 | **Missing import** — `logError()` called but never imported. Will throw `ReferenceError` at runtime | Add `error as logError` to import on line 7 |
| Q-C2 | `src/modules/triage.js` | all | **1191-line god module** — see A-C1 | Split into 4-6 focused modules |

### HIGH

| ID | File | Line | Finding | Recommendation |
|----|------|------|---------|----------------|
| Q-H1 | `src/modules/triage.js` | 716-898 | `evaluateAndRespond()` — 182 lines, 7 nesting levels, cyclomatic complexity ~15+ | Extract 5-6 helper functions |
| Q-H2 | Multiple commands | — | **11 moderation commands** share identical boilerplate: deferReply, getConfig, getMember, checkHierarchy, DM, createCase, modLogEmbed, catch | Extract `executeModerationCommand()` helper |
| Q-H3 | `src/index.js` | 151,194,739 | **Silent catch blocks** — transaction rollback failures swallowed with `.catch(() => {})` | Log at debug level: `.catch(e => debug('Rollback failed', { error: e.message }))` |
| Q-H4 | `src/modules/triage.js` | 635-636 | Fire-and-forget `sendModerationLog` uses `debug` level for failures — invisible in production | Use `warn` level for operational failures |
| Q-H5 | `src/modules/config.js` | all | **891-line module** combines cache, persistence, events, validation, parsing | Split into config-cache, config-persistence, config-events, config-utils |
| Q-H6 | `src/modules/memory.js` | all | **588 lines** — combines availability checking, client management, cooldowns, CRUD, graph formatting | Extract `memory-availability.js` |
| Q-H7 | `src/modules/cli-process.js` | all | **606 lines** — dual-mode lifecycle, NDJSON parsing, mutex, token tracking, recycling | Consider splitting short-lived vs long-lived modes |

### MEDIUM

| ID | File | Line | Finding | Recommendation |
|----|------|------|---------|----------------|
| Q-M1 | `src/modules/triage.js` | 1047-1110 | `accumulateMessage()` — nested try-catch inside if-inside-if for reply context | Extract `fetchReplyContext()` |
| Q-M2 | `src/modules/triage.js` | 157-158 | Magic numbers: 100, 30, 5000, 4, 5 — undocumented thresholds | Extract to named constants (`MAX_TRACKED_CHANNELS`, etc.) |
| Q-M3 | `src/modules/triage.js` | 96 | `validateMessageId()` name implies validation but performs fallback selection with side effects | Rename to `resolveMessageId()` |
| Q-M4 | `src/modules/triage.js` | 1176-1187 | **Race condition** — `pendingReeval` flag read-then-clear is non-atomic. Message arriving between read (1178) and clear (1179) could cause double-evaluation | Check and clear atomically: `const shouldReeval = buf.pendingReeval; buf.pendingReeval = false;` |
| Q-M5 | `src/index.js` | 232-238 | Graceful shutdown calls `stopTriage()`, `stopConversationCleanup()`, `stopTempbanScheduler()` synchronously — may have in-flight async operations | Add `await` or document as fire-and-forget by design |
| Q-M6 | `src/modules/triage.js` | 399 | Uses `debug` for channel access failure (should be `warn`) | Correct log level |
| Q-M7 | `src/modules/triage.js` | 786 | Uses `debug` for memory timeout (should be `warn`) | Correct log level |
| Q-M8 | `src/modules/triage.js` | 848 | `client.channels.fetch()` swallows all errors as `null` without logging | Log before returning null |
| Q-M9 | `src/modules/triage.js` | 665 | Warning log missing `classification.reasoning` field — helpful for debugging | Include reasoning in metadata |
| Q-M10 | `src/modules/triage.js` | 612-614 | Channel null check comes after channelId fallback assignment — inconsistent defensive programming | Check before assignment or remove redundant check |
| Q-M11 | `src/modules/triage.js` | 14 | Inconsistent import rename style (`logError` imported differently across modules) | Standardize |
| Q-M12 | `src/index.js` | 338-384 | Nested config change listeners — 4+ nesting levels | Extract to separate module |
| Q-M13 | `src/modules/triage.js` | 119-130 | Module-level `_client`, `_config`, `_healthMonitor` use leading underscore (private convention) in ES module scope | Remove underscores or use class with `#private` |

### LOW

| ID | File | Line | Finding | Recommendation |
|----|------|------|---------|----------------|
| Q-L1 | `src/modules/triage.js` | 16 | `CLIProcessError` imported but never used for `instanceof` checks | Remove if unused |
| Q-L2 | `src/modules/triage.js` | 673-676 | `!r.response?.trim()` relies on falsy coercion — works but fragile | Use explicit `r.response.trim() === ''` |
| Q-L3 | Multiple files | — | Excessive optional chaining where API docs guarantee non-null | Use `?.` only for documented nullable |
| Q-L4 | `src/modules/cli-process.js` | 133-134 | Comment about `--dangerously-skip-permissions` is accurate but scary without context | Clarify: "Headless mode: safe because bot only calls trusted prompts" |
| Q-L5 | `src/modules/triage.js` | — | Missing JSDoc for `accumulateMessage()` and `evaluateNow()` (exported) | Add JSDoc with parameter types, return types |
| Q-L6 | `src/index.js` | 421-423 | Stale TODO about `loadState()` migration — may be resolved | Convert to GitHub issue or resolve |
| Q-L7 | `src/modules/events.js` | 178-182 | Optional chaining `p?.catch()` implies `accumulateMessage()` might return undefined — undocumented | Make return type explicit |
| Q-L8 | Multiple | — | Abbreviation inconsistency: `msg` vs `message`, `err` vs `error`, `config` vs `cfg` | Establish naming guide |

---

## 4. Test Coverage

### Test Status

**177 tests passing** across all files except `index.test.js`.
**33/34 tests FAILING** in `tests/index.test.js` due to mock configuration issues.

### Coverage Map

| Category | Tested | Untested | Quality |
|----------|--------|----------|---------|
| Commands (17 files) | 17 ✅ | 0 | MEDIUM-HIGH |
| Modules (12 files) | 10 ✅ | 2 ❌ | EXCELLENT for triage/moderation |
| Utils (9 files) | 8 ✅ | 1 ❌ | HIGH |
| API routes (3 files) | 3 ✅ | 0 | EXCELLENT |
| API middleware (4 files) | 2 ✅ | 2 ⚠️ | HIGH (indirect coverage) |
| Transports (1 file) | 1 ✅ | 0 | HIGH |

### CRITICAL Gaps

| ID | File | Lines | Finding | Suggested Tests |
|----|------|-------|---------|-----------------|
| T-C1 | `src/modules/cli-process.js` | 606 | **Zero test coverage** — most complex infrastructure code: dual-mode lifecycle, token recycling, mutex, EPIPE handling, timeouts | AsyncQueue, short-lived spawn/timeout, long-lived recycle/EPIPE, concurrent send() serialization |
| T-C2 | `tests/index.test.js` | all | **33/34 tests failing** — excessive global mocking (10+ vi.mock calls), shared mutable state, module reset issues | Simplify mocks, split into smaller integration tests, use real modules where possible |

### HIGH Gaps

| ID | File | Finding | Suggested Tests |
|----|------|---------|-----------------|
| T-H1 | `src/api/utils/sessionStore.js` | TTL expiry, cleanup cycle, expired-entry-on-get not tested | `get()` returns undefined after TTL, `cleanup()` removes all expired |
| T-H2 | `src/prompts/index.js` | File-not-found error, variable interpolation, cache behavior untested | Throw on missing file, interpolate variables, handle missing keys |
| T-H3 | `src/modules/triage.js` | WebSearch integration in responder flow not tested | onEvent callback WebSearch detection, searchCount tracking |

### MEDIUM Gaps

| ID | Finding | Detail |
|----|---------|--------|
| T-M1 | Permissive mocks hide bugs | Triage tests mock CLIProcess to always succeed — timeout, malformed JSON, crashes untested |
| T-M2 | No Discord API error path testing | Moderation tests don't cover 429 rate limits, 403 permissions, already-banned |
| T-M3 | No connection pool exhaustion tests | DB tests only cover successful connections |
| T-M4 | Config hot-reload race conditions | Concurrent changes from multiple sources untested |
| T-M5 | No integration tests for full flows | Triage pipeline, OAuth→guild access, config change→model swap |

### Mock Anti-Patterns

- **`index.test.js`**: 10+ global mocks → testing the harness, not the code
- **Shared mutable state**: `const mocks = vi.hoisted(...)` — order-dependent failures
- **Global fetch spy leakage**: Multiple test files spy on `globalThis.fetch` without consistent cleanup
- **Timer cleanup**: `vi.useFakeTimers()` not always restored on failure paths

### Test Infrastructure

- ✅ Vitest with 80% coverage thresholds enforced
- ✅ Consistent `beforeEach`/`afterEach` patterns in API tests
- ❌ No global test setup file — logger mock copy-pasted across files
- ❌ No shared test fixtures — mock guilds/channels/members duplicated

### Test Quality Score: **7/10**

| Dimension | Score | Notes |
|-----------|-------|-------|
| Coverage breadth | 8/10 | 26/36 files tested |
| Coverage depth | 6/10 | CLIProcess, index.js critically untested |
| Mock quality | 5/10 | Excessive mocking, permissive mocks |
| Edge cases | 7/10 | Strong for API/moderation, weak for infrastructure |
| Integration | 4/10 | Many unit tests, few end-to-end flows |

---

## Priority Action Items

### P0 — Fix Now (runtime bugs)

| # | Finding | Effort |
|---|---------|--------|
| 1 | **Q-C1**: Add missing `logError` import in `ai.js:229` — will crash on DB write failure | 1 line |
| 2 | **T-C2**: Fix 33 failing tests in `index.test.js` — simplify mocks or rewrite | 2-4h |

### P1 — This Sprint (security + reliability)

| # | Finding | Effort |
|---|---------|--------|
| 3 | **S-H1**: Parameterize `date_trunc()` in guilds.js analytics | 30min |
| 4 | **S-M2**: Fail fast on missing `SESSION_SECRET` at startup | 15min |
| 5 | **A-H2**: Wire CLI process restart into triage error handlers | 2h |
| 6 | **S-H4**: Rate-limit OAuth state endpoint | 30min |
| 7 | **T-C1**: Write CLIProcess test suite (most critical untested code) | 4-6h |
| 8 | **Q-H3**: Replace silent catch blocks with debug-level logging | 30min |

### P2 — Next Sprint (architecture + quality)

| # | Finding | Effort |
|---|---------|--------|
| 9 | **A-C1/Q-C2**: Refactor triage.js into 4 focused modules | 8-12h |
| 10 | **Q-H2**: Extract moderation command boilerplate | 4-6h |
| 11 | **A-H1**: Migrate from inline DDL to versioned DB migrations | 4-6h |
| 12 | **Q-H5**: Split config.js into focused sub-modules | 4-6h |
| 13 | **S-H2**: Add per-message char limits for prompt injection defense | 2h |

### P3 — Backlog (scaling + polish)

| # | Finding | Effort |
|---|---------|--------|
| 14 | **A-H3/S-M5**: Replace in-memory session store with Redis | 4-6h |
| 15 | **A-M6**: Make DB pool size configurable | 30min |
| 16 | **A-M2**: Implement centralized ErrorBoundary class | 4-6h |
| 17 | **S-C1**: Move botOwners to environment variable | 1h |
| 18 | Create global test setup file + shared fixtures | 2h |
| 19 | Add integration test suite (triage pipeline, OAuth flow) | 8-12h |
| 20 | **A-M3**: SIGTERM→SIGKILL escalation for CLI timeouts | 2h |

---

## Methodology

Each domain was reviewed by a specialized agent with full read access to the codebase:

- **Security**: OWASP-focused audit of all input paths, auth flows, SQL queries, subprocess spawning, and prompt injection surfaces
- **Architecture**: Dependency graph analysis, coupling assessment, error propagation tracing, scalability evaluation
- **Code Quality**: Complexity analysis, code smell detection, DRY audit, async pattern review, naming/documentation assessment
- **Test Coverage**: Source↔test cross-reference, mock quality analysis, edge case gap identification, integration test assessment

All file paths are relative to `/workspaces/projects/bills-bot/project/`.
