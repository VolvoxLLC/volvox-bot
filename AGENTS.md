# AGENTS.md

Repo-specific operating rules for agents working on Volvox.Bot. Keep this file sharp: if a new repo gotcha or required workflow appears, update it in the same PR that proves it.

## Start Here

- Use Node 22+ and the latest `pnpm`.
- Read the relevant code before changing it. Prefer existing patterns over new abstractions.
- For UI/UX work, read `DESIGN.md` before touching code. This includes dashboard, landing page, shared UI primitives, theme/token, layout, and visual copy changes.
- Run the narrowest meaningful verification while iterating, then run broader repo gates when the blast radius justifies it.
- Ask questions only when the missing decision changes architecture, UX direction, data model, security posture, or external behavior. Otherwise make a reasonable choice, document it, and keep moving.

## Non-Negotiable Code Rules

- ESM only.
- Keep package dependencies current: use the latest version of all `package.json` dependencies before committing.
- Use `src/logger.js`; do not use `console.*`.
- Use safe Discord messaging helpers from `src/utils/safeSend.js`; do not use raw `reply`, `send`, or `edit` Discord message calls. If no helper fits, add or extend one.
- Use parameterized SQL only.
- Do not lower lint, typecheck, test, or coverage gates to make CI pass. Bot coverage
  enforces the thresholds in `vitest.config.js`; web coverage enforces the PR #626
  ratcheted baseline in `web/vitest.config.ts`.

## Configurable Feature Contract

If a feature is configurable, ship the whole path or do not call it done:

- Runtime logic.
- API/dashboard wiring.
- Tests for the behavior and wiring.
- `config.json` updates for config-backed defaults.
- `src/api/utils/configAllowlist.js` updates, including `SAFE_CONFIG_KEYS`; if the key is missing there, the dashboard cannot save it.

Community-facing features must be gated behind `config.<feature>.enabled`. Moderation commands are the exception.

## Dashboard and Web Gotchas

- Next.js dev with Chrome DevTools uses `127.0.0.1`; keep `web/next.config.mjs` `allowedDevOrigins` including `127.0.0.1` or HMR can reload-loop and Turbopack can fail with `Map maximum size exceeded`.
- New dashboard routes need title wiring in `web/src/lib/page-titles.ts`: use `createPageMetadata()` for SSR and keep `DashboardTitleSync` aligned for client navigation.
- Dashboard clients that need the guild list must consume `GuildDirectoryProvider`; do not add extra `/api/guilds` fetch loops in leaf components.
- Recharts dashboard views must use `web/src/components/ui/stable-responsive-container.tsx`; raw `ResponsiveContainer` mounts can spam `width(-1)/height(-1)` warnings when panels render before layout settles.
- Welcome-message variables use double braces only, like `{{user}}`. Single braces are plain text and should not be documented, inserted, or parsed as variables.

## DESIGN.md Is the Visual Source of Truth

`DESIGN.md` defines the current product direction: calm, technical, muted sage/olive, restrained glass, operational panels, and compact data-heavy layouts.

- Read `DESIGN.md` before any UI/UX, dashboard, landing page, shared UI primitive, theme/token, layout, or visual copy change.
- If code and `DESIGN.md` disagree, either align code to `DESIGN.md` or update `DESIGN.md` with the new accepted direction in the same PR.
- Update `DESIGN.md` whenever you add or change reusable visual patterns, design tokens, shared components, layout rules, dashboard/landing visual direction, or design-system exceptions.
- Do not reintroduce the old neon green/purple marketing style unless `DESIGN.md` is intentionally updated with the rationale.
- Prefer existing components and tokens over one-off styling. If you need a new pattern, document it.

## Visual Verification

Any visual dashboard or landing page change requires browser verification before it is done.

- Use Chrome DevTools MCP when available.
- Take a screenshot after the change.
- Check both light and dark themes when colors or theming changed.
- Check mobile, tablet, and desktop when layout changed.
- If dashboard auth, shell, navigation, or settings flows changed, verify the affected dashboard flow directly.
- If the dashboard is not running or browser tooling is unavailable, say so plainly. Do not pretend it was verified.

## Verification

Run checks that prove the change without wasting time:

- Narrow checks are best for tight loops.
- Use repo-level gates when the change is broad or risky: `pnpm mono:lint`, `pnpm mono:test`, `pnpm mono:typecheck`, `pnpm mono:build`, `pnpm mono:test:coverage`.
- Workspace-only checks do not replace repo-level gates for cross-cutting changes.
- Never weaken tests, snapshots, coverage, lint, or typecheck to get green.

## Keep Docs Current

Docs updates are part of done criteria, not optional cleanup.

- Update all affected docs in the same PR when behavior, setup, config, commands, public docs navigation, or architecture changes.
- Update `AGENTS.md` when repo-specific operating rules, workflows, or gotchas change.
- Update `DESIGN.md` when visual/design-system direction changes.
- Update `DEVELOPMENT.md` when local setup, dev commands, environment variables, project structure, or contributor/developer workflow changes.
- Update `README.md` when the public/product overview, user-facing setup, or feature summaries change.
- Update `CONTRIBUTING.md` when contribution workflow or review expectations change.
- Update Mintlify docs (`docs/**/*.mdx`) and `docs/docs.json` when user-facing feature/config/security/help docs, dashboard docs, public behavior, or docs navigation changes.
- Update `.github/workflows/maintain-docs.md` when the automated doc-maintenance scope or rules change.
- Do not bury agent-only rules in `README.md`; keep them here.
