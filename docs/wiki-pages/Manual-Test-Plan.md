# Volvox.Bot Manual Test Plan

Last updated: 2026-05-01

## 1) Purpose and Scope

This document is a comprehensive manual test plan for the **entire Volvox.Bot project**:

- Discord bot runtime and commands
- Dashboard/web app
- API integrations between dashboard and bot
- Data persistence and per-guild configuration behavior
- Safety, moderation, permission boundaries, and failure behavior
- UX, accessibility, theming, and responsive layouts
- Operational workflows (startup, logging, restarts, outages, and recovery)

This plan is written for repeatable QA passes before releases and for regression checks after larger changes.

---

## 2) Test Environment Matrix

Run tests in at least these environments.

### 2.1 Core Environments

- [ ] **Local development**
   - Bot + API + dashboard running from current branch
   - Fresh database state and seeded state
- [ ] **Staging-like environment**
   - Production-like env vars
   - Separate Discord test server/guild(s)
- [ ] **Production smoke check** (minimal/high-signal only)
   - Limited to non-destructive, read-only/low-risk checks

### 2.2 Platforms

- Desktop:
  - Chrome (latest)
  - Firefox (latest)
  - Safari (latest stable)
- Mobile:
  - iOS Safari
  - Android Chrome
- Light and dark themes for dashboard checks

### 2.3 Discord Test Matrix

Use at least 3 guilds:

- **Guild A (baseline)**: default config only
- **Guild B (customized)**: per-guild overrides for major configurable features
- **Guild C (restricted)**: narrow permissions to validate failure/permission messaging

Use at least 4 user personas:

- Server owner/admin
- Moderator
- Normal member
- User missing required permissions

---

## 3) Test Data and Preconditions

Before execution:

- [ ] Ensure bot is invited with expected intents and permission scopes.
- [ ] Ensure DB and cache are reachable.
- [ ] Prepare seeded data:
   - Existing warnings/cases
   - Open and closed tickets
   - Historical analytics data
   - Rank/profile data
- [ ] Confirm dashboard auth works for users with/without guild admin rights.
- [ ] Enable at least one feature with config flags and leave one disabled for gating checks.

---

## 4) Release Blocking Criteria

A release is blocked when any of the following occur:

- Any command causes uncaught errors or silent failures.
- Permission checks allow forbidden actions or block allowed actions.
- Config changes from dashboard fail to persist or fail to apply at runtime.
- Moderation actions do not log correctly in modlog/audit surfaces.
- Ticket/community workflows lose data, leak data across guilds, or mis-route responses.
- Dashboard pages fail SSR/CSR navigation expectations.
- Major visual regressions in light/dark or mobile/desktop layouts.
- Critical startup/runtime health signals are missing or misleading.

---

## 5) End-to-End Test Suites

Execute all suites. Capture screenshots/videos for failed or ambiguous cases.

## Suite A: Bot Startup, Presence, and Operational Health

- [ ] Start bot with valid environment.
- [ ] Validate startup logs show successful initialization.
- [ ] Confirm bot appears online in Discord.
- [ ] Verify status/presence command(s) are functional.
- [ ] Restart process and verify clean reconnect.
- [ ] Simulate transient dependency outage (DB/Redis/API) and verify graceful behavior + recovery logs.

Expected:

- No crash loops
- Clear startup/connection logging
- Graceful degradation messaging where applicable

## Suite B: Command Discovery and Help Surfaces

- [ ] Validate slash command registration appears complete.
- [ ] Trigger help/onboarding command(s).
- [ ] Confirm command descriptions are clear and accurate.
- [ ] Verify aliases and command grouping surfaces match expected behavior.

Expected:

- Users can find and understand command usage
- No stale names, missing commands, or broken aliases

## Suite C: Permissions and Security Boundaries

For each sensitive command category (moderation/config/tickets/admin-like):

- [ ] Execute as admin/mod/member/unprivileged.
- [ ] Validate allowed persona succeeds.
- [ ] Validate disallowed persona receives safe, non-leaky denial response.
- [ ] Validate permission escalation is impossible via malformed inputs.

Expected:

- Least-privilege behavior
- Consistent denial messages
- No stack traces or internal detail leaks to users

## Suite D: Moderation Command Flows

Validate full lifecycle for moderation commands present in repo:

- warn, warnings, clearwarnings, editwarn, removewarn
- timeout/untimeout (if available)
- kick, ban, unban, softban, tempban
- lock/unlock
- purge
- case/modlog

For each:

- [ ] Run happy path with valid target.
- [ ] Run invalid target/input path.
- [ ] Run permission failure path.
- [ ] Validate DB persistence/state change.
- [ ] Validate moderation log entries and reason metadata.
- [ ] Validate reversibility where command semantics require it.

Expected:

- Accurate enforcement and auditability
- No cross-guild data leakage

## Suite E: Community and Utility Features

Validate major non-moderation commands and workflows:

- poll, announce, remind, snippet, tldr, history
- rolemenu
- rank/profile/challenge/review
- showcase/community features
- github integration features
- memory/voice (if enabled)

For each feature:

- [ ] Validate baseline command execution.
- [ ] Validate malformed input handling.
- [ ] Validate configured limits/rate limits.
- [ ] Validate disable/enable config gating.
- [ ] Validate output formatting and user safety.

Expected:

- Stable user workflows
- Guardrails respected

## Suite F: Ticketing and Support Workflows

- [ ] Create ticket from eligible user.
- [ ] Validate channel/thread creation and ACLs.
- [ ] Add staff replies and user replies.
- [ ] Close ticket and validate closure metadata.
- [ ] Reopen/archive flows (if supported).
- [ ] Validate transcript/history availability (if supported).

Expected:

- Access controls prevent unauthorized viewing
- State transitions are consistent and logged

## Suite G: Temp Roles / Time-Based Automation

- [ ] Assign temp role.
- [ ] Validate immediate role assignment.
- [ ] Validate expiration and cleanup job behavior.
- [ ] Validate restart during countdown does not lose schedule.
- [ ] Validate duplicate/conflicting assignments are handled safely.

Expected:

- Time-based behaviors execute accurately and idempotently

## Suite H: AI/Conversation Features (if enabled)

- [ ] Enable AI feature flag in test guild only.
- [ ] Run prompt-response cycles with normal, long, and adversarial inputs.
- [ ] Validate moderation/safety constraints on generated output.
- [ ] Validate rate/usage limits and fallback messages.
- [ ] Disable feature and verify hard stop behavior.

Expected:

- Predictable gating and safe response behavior
- Clear user messaging on unavailable states

## Suite I: Dashboard Authentication and Guild Access

- [ ] Log in as user with multiple guilds.
- [ ] Validate guild directory and switching behavior.
- [ ] Validate unauthorized guild access is denied.
- [ ] Validate session expiry/logout/login flows.
- [ ] Validate direct-link access to settings pages works when authorized.

Expected:

- Correct guild scoping and secure auth boundaries

## Suite J: Dashboard Configuration CRUD and Runtime Application

For each configurable feature section in dashboard:

- [ ] Read current values.
- [ ] Update value(s) and save.
- [ ] Refresh and verify persistence.
- [ ] Trigger matching bot behavior in Discord to confirm runtime application.
- [ ] Revert to baseline.

Expected:

- No save failures, no ghost writes
- Dashboard state matches runtime behavior

## Suite K: Dashboard UX, Theming, and Responsiveness

- [ ] Validate page titles and navigation consistency.
- [ ] Check key routes in light theme.
- [ ] Repeat in dark theme.
- [ ] Validate mobile/tablet/desktop layout behavior.
- [ ] Validate chart-heavy pages for rendering stability.
- [ ] Validate loading, empty, and error states.

Expected:

- No overlapping content, clipped controls, unreadable contrast, or unstable chart mounts

## Suite L: Analytics, Audit, and Reporting

- [ ] Generate known events (moderation action, ticket event, command usage).
- [ ] Validate analytics pages reflect expected values.
- [ ] Validate audit log/order/timestamp consistency.
- [ ] Validate timezone representation and date range filters.

Expected:

- Consistent numbers, expected lag, accurate filters

## Suite M: API Contract and Error Handling

- [ ] Exercise dashboard actions that hit API endpoints.
- [ ] Validate successful response shapes.
- [ ] Validate 4xx/5xx handling and user-visible messaging.
- [ ] Validate retries (if any), backoff behavior, and idempotency on duplicate submissions.

Expected:

- No opaque failures; actionable user error messages

## Suite N: Data Integrity and Multi-Guild Isolation

- [ ] Make distinct config/feature changes in Guild A and Guild B.
- [ ] Verify behavior is isolated per guild.
- [ ] Validate dashboard reads and bot runtime both reflect correct guild context.
- [ ] Validate deleting/archiving entities in one guild does not impact another.

Expected:

- Strict tenant isolation

## Suite O: Resilience, Recovery, and Operational Runbook Checks

- [ ] Restart services during active activity.
- [ ] Validate no data corruption and acceptable recovery.
- [ ] Simulate intermittent network loss.
- [ ] Validate observable error logs and recovery logs.
- [ ] Validate runbook instructions remain accurate while executing a sample incident drill.

Expected:

- Recoverable behavior with clear operator signals

---

## 6) Negative and Abuse Cases

Run the following across command and dashboard surfaces:

- Oversized inputs
- Invalid IDs/mentions
- Rapid repeated submissions (spam/race checks)
- Markdown/formatting injection attempts
- Variable/template misuse (including welcome variable syntax)
- Unauthorized direct route/API access
- Stale/expired session actions

Expected:

- Inputs safely rejected or normalized
- No crashes or leaked internals

---

## 7) Accessibility Checklist (Manual)

Dashboard:

- [ ] Keyboard-only navigation for primary workflows.
- [ ] Visible focus indicators.
- [ ] Reasonable tab order.
- [ ] Form controls have labels and errors are announced clearly.
- [ ] Contrast is acceptable in light and dark themes.
- [ ] Zoom to 200% without loss of core functionality.
- [ ] Screen reader spot checks on login, guild switcher, and settings forms.

Discord bot:

- [ ] Bot responses are understandable and not purely emoji/color dependent.
- [ ] Error/success messages include clear text semantics.

---

## 8) Performance and Perceived Latency (Manual)

- [ ] Cold start timing for dashboard primary routes.
- [ ] Save action latency for config updates.
- [ ] Command response latency under light and moderate load.
- [ ] Chart/report rendering responsiveness on low-powered device.

Expected:

- No severe UI jank; no command timeouts in normal use

---

## 9) Regression Checklist for Every Release Candidate

Minimum required pass before release:

- [ ] Smoke: startup, login, guild switch, one config save, one moderation command, one community command.
- [ ] Full permission boundary checks on at least 3 sensitive commands.
- [ ] Multi-guild isolation spot check.
- [ ] Dark/light + mobile/desktop spot check on dashboard home/settings.
- [ ] Ticket open/close flow.
- [ ] Modlog/audit event verification.
- [ ] Runbook-linked operational smoke (restart + reconnect).

---

## 10) Evidence Collection Template

For each failed or suspect case, record:

- Test ID / suite / step
- Timestamp (UTC)
- Environment (local/staging/prod smoke)
- Guild ID and user role persona
- Inputs provided
- Expected result
- Actual result
- Attachments (screenshot/video/log excerpt)
- Severity and release impact
- Suspected component owner

---

## 11) Suggested Execution Cadence

- **Per PR (targeted):** impacted suites only
- **Pre-release RC:** full plan execution (all suites)
- **Post-release:** production smoke + incident watch window
- **Monthly hardening pass:** full negative/abuse and resilience suites

---

## 12) Ownership and Sign-off

Recommended sign-off roles:

- QA/Tester: feature and regression execution
- Bot maintainer: runtime/moderation validation
- Dashboard maintainer: UX/config and API verification
- Operations owner: resilience and runbook validation

A release candidate is approved only after all blocking issues are resolved or explicitly waived with documented risk acceptance.
