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

- Fixed authorization gap on dashboard operational endpoints:
  - `web/src/app/api/log-stream/ws-ticket/route.ts` now enforces guild-admin authorization via `authorizeGuildAdmin` and requires `guildId` query param before minting WS tickets.
  - `web/src/app/api/bot-health/route.ts` now requires `guildId` and enforces `authorizeGuildAdmin` before proxying `/health`.
- Wired dashboard clients to send selected guild context for privileged endpoints:
  - `useLogStream` now accepts `{ enabled, guildId }` and requests `/api/log-stream/ws-ticket?guildId=...`.
  - Logs page passes selected guild into `useLogStream`; health section now calls `/api/bot-health?guildId=...`.
- Added API route tests for the above authorization behavior:
  - `web/tests/api/log-stream-ws-ticket.test.ts`
  - `web/tests/api/bot-health-route.test.ts`
