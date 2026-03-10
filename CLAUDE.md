# CLAUDE.md

See [AGENTS.md](./AGENTS.md) for full project context, architecture, and coding guidelines.

## Session Notes (2026-03-05)

- Railway bot startup crash fixed by resolving migration ordering conflict:
  - Renamed `migrations/004_command_aliases.cjs` -> `migrations/007_command_aliases.cjs`.
  - Renamed `migrations/004_reaction_roles.cjs` -> `migrations/008_reaction_roles.cjs`.
  - Renamed `migrations/004_role_menu_templates.cjs` -> `migrations/009_role_menu_templates.cjs`.
  - Renamed `migrations/004_temp_roles.cjs` -> `migrations/010_temp_roles.cjs`.
  - Reason: production DB had `004_performance_indexes` and `004_voice_sessions` already run while other `004_*` files were pending, which node-pg-migrate rejects as out-of-order.
- Deployment/runtime fix for Railway port binding:
  - API server now prefers `PORT` with `BOT_API_PORT` fallback in `src/api/server.js`.
  - Bot Docker healthcheck now targets `http://localhost:${PORT:-3001}/api/v1/health`.
- Multi-guild env cleanup:
  - Removed `GUILD_ID` from Railway shared environment for bot and web services.
  - Removed `process.env.GUILD_ID` runtime reads from startup/reload command registration.
  - Updated `.env.example` and `README.md` to remove `GUILD_ID` as a persisted env var.
  - Preserved dev-only guild-scoped deploy support via CLI flag: `pnpm deploy -- --guild-id <guild_id>`.
- Web dashboard config editor redesign shipped:
  - Replaced monolithic settings stack with category workspace navigation (`AI & Automation`, `Onboarding & Growth`, `Moderation & Safety`, `Community Tools`, `Support & Integrations`) in `web/src/components/dashboard/config-workspace/`.
  - Added metadata-driven config search with cross-category quick jump, focus/scroll targeting, and advanced-section auto-open when search hits advanced controls.
  - Refactored config feature presentation to reusable `SettingsFeatureCard` pattern (header + master toggle + Basic/Advanced blocks).
  - Kept save contract unchanged: global save/discard, diff-modal confirmation, per-section PATCH batching, and partial-failure behavior.
  - Updated config editor tests from stale autosave assumptions to explicit manual-save workspace behavior and added coverage for category switching/search/dirty badges.

## Session Notes (2026-03-07)

- Dashboard browser titles now sync with dashboard route changes:
  - Added shared title helpers in `web/src/lib/page-titles.ts` with the canonical app title string `Volvox.Bot - AI Powered Discord Bot`.
  - Mounted `DashboardTitleSync` in `web/src/components/layout/dashboard-shell.tsx` so client-rendered dashboard pages update `document.title` on pathname changes without needing a server-wrapper refactor for every route.
  - Added static metadata for server-rendered dashboard entry pages (`/dashboard`, `/dashboard/config`, `/dashboard/performance`) and switched the root app metadata to a title template so direct loads and client transitions use the same suffix format.
  - Coverage lives in `web/tests/lib/page-titles.test.ts` and `web/tests/components/layout/dashboard-title-sync.test.tsx`.

## Session Notes (2026-03-10)

<<<<<<< codex/fix-reaction-role-privilege-escalation
- Security fix: `/reactionrole add` now enforces invoker role hierarchy for target role assignment in addition to existing bot-role hierarchy check.
  - Added guard in `src/commands/reactionrole.js` that blocks non-owner invokers from configuring roles at or above their highest role.
  - Guild owners are explicitly exempted, matching Discord permission model expectations.
- Extended command tests in `tests/commands/reactionrole.test.js`:
  - Added coverage for rejection when invoker cannot manage the target role.
  - Added coverage confirming guild owners can still configure higher roles.
=======
- Security fix: bound audit-log WebSocket auth tickets to a guild context.
  - Updated audit stream ticket validation in `src/api/ws/auditStream.js` to require `nonce.expiry.guildId.hmac` and persist authenticated `ws.guildId`.
  - Enforced tenant scoping server-side: `handleFilter()` now rejects mismatched `guildId`, and broadcast matching now requires `entry.guild_id === ws.guildId` even when no filter is provided.
  - Updated dashboard ws-ticket issuer in `web/src/app/api/log-stream/ws-ticket/route.ts` to include `guildId` in the signed payload.
  - Added backward-compatible ticket parsing in `src/api/ws/logStream.js` to accept both legacy 3-part and new 4-part tickets so existing log stream behavior remains intact.
  - Extended `tests/api/ws/auditStream.test.js` with cross-guild isolation coverage (no-filter cross-guild drop + mismatched filter rejection).
>>>>>>> main
