# AGENTS.md

Keep this file for repo-specific rules, gotchas, and conventions. If something belongs in `README.md`, it does not belong here.

## Hard Rules

- Use Node 22+ and LATEST version of `pnpm`.
- Use the latest version of ALL package.json dependencies. These should always be upgraded to the latest version before committing.
- ESM only.
- Use `src/logger.js`; do not use `console.*`.
- Use the safe Discord messaging helpers in `src/utils/safeSend.js` instead of raw reply/send/edit calls.
- Use parameterized SQL only.
- Do not lower lint, typecheck, test, or coverage gates to make CI shut up. Bot and web both enforce 85% coverage thresholds.
- When in doubt, ask questions. When unsure, ask questions. When you're not sure what to do, ask questions. Ask questions.

## Easy-To-Miss Wiring

- Config-backed features must be added to `config.json` and `src/api/utils/configAllowlist.js`. If a key is missing from `SAFE_CONFIG_KEYS`, the dashboard cannot save it.
- Community features should be gated behind `config.<feature>.enabled`. Moderation commands are the exception.
- New dashboard routes need title wiring in `web/src/lib/page-titles.ts`: use `createPageMetadata()` for SSR and keep `DashboardTitleSync` aligned for client navigation.
- If a feature is configurable, ship the whole path: runtime logic, API/dashboard wiring, and tests.
- Next.js 16 dev + Chrome DevTools MCP uses `127.0.0.1`; keep `web/next.config.mjs` `allowedDevOrigins` including `127.0.0.1` or HMR will fail, pages will reload-loop, and Turbopack can fall over with `Map maximum size exceeded`.
- Dashboard clients that need the guild list should consume `GuildDirectoryProvider`; do not stack extra `/api/guilds` fetch loops in leaf components.
- Recharts dashboard views should use `web/src/components/ui/stable-responsive-container.tsx`; raw `ResponsiveContainer` mounts can spam `width(-1)/height(-1)` warnings when panels render before layout settles.
- Welcome-message variables use double braces only, like `{{user}}`; single braces are plain text and should not be documented, inserted, or parsed as variables.

## Visual Verification - IMPORTANT

- Any visual dashboard or landing page change must be verified with Chrome DevTools MCP before you call it done.
- Take a screenshot after the change.
- Check both themes, light and dark, if colors or theming changed. Always check both themes this is important.
- Check responsive behavior if layout changed. Verify on mobile, tablet, and desktop.
- If the dashboard is not running or MCP is unavailable, say so plainly. Do not pretend it was verified.

## Verification

- Run the narrowest checks that actually prove the change.
- Use repo-level commands when the blast radius is real: `pnpm mono:lint`, `pnpm mono:test`, `pnpm mono:typecheck`, `pnpm mono:build`, `pnpm mono:test:coverage`.
- Workspace-only checks are fine for tight loops, but they do not replace the real gate on risky changes.

## Design

See [DESIGN.md](DESIGN.md) for the design system and color palette. Follow the design system when making changes to the UI/UX.
This is extremely important. If you don't follow the design system, your changes will be rejected.
Always update the design system when making changes to the UI/UX.
