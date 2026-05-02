# AGENTS.md

Repo-specific operating rules for agents working on Volvox.Bot. Keep this file sharp: if a new repo gotcha or required workflow appears, update it in the same PR that proves it.

## Start Here

- Use Node 22+ and the latest `pnpm`.
- Read the relevant code before changing it. Prefer existing patterns over new abstractions.
- For UI/UX work, read `DESIGN.md` before touching code. This includes dashboard, landing page, shared UI primitives, theme/token, layout, and visual copy changes.
- Run the narrowest meaningful verification while iterating, then run broader repo gates when the blast radius justifies it.
- For GitHub wiki updates, edit `docs/wiki-pages/` and publish through the wiki git repo flow (`git clone https://github.com/<owner>/<repo>.wiki.git`), not by treating `/wiki` as product docs.
- Ask questions only when the missing decision changes architecture, UX direction, data model, security posture, or external behavior. Otherwise make a reasonable choice, document it, and keep moving.

## Non-Negotiable Code Rules

- ESM only.
- Keep package dependencies current: use the latest version of all `package.json` dependencies before committing.
- Use `src/logger.js`; do not use `console.*`.
- Use safe Discord messaging helpers from `src/utils/safeSend.js`; do not use raw `reply`, `send`, or `edit` Discord message calls. If no helper fits, add or extend one.
- Use parameterized SQL only.
- Do not lower lint, typecheck, test, or coverage gates to make CI pass. Bot and web both enforce 85% coverage thresholds.

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
- Railway builds the web service with `web/` as the Docker context, so web code cannot import repo-root files. Keep root-shared web data copied under `web/src/data/` and covered by a sync test.
- New dashboard routes need title wiring in `web/src/lib/page-titles.ts`: use `createPageMetadata()` for SSR and keep `DashboardTitleSync` aligned for client navigation.
- Dashboard clients that need the guild list must consume `GuildDirectoryProvider`; do not add extra `/api/guilds` fetch loops in leaf components.
- Recharts dashboard views must use `web/src/components/ui/stable-responsive-container.tsx`; raw `ResponsiveContainer` mounts can spam `width(-1)/height(-1)` warnings when panels render before layout settles.
- Welcome-message variables use double braces only, like `{{user}}`. Single braces are plain text and should not be documented, inserted, or parsed as variables.
- Triage startup logging reports global defaults. Dashboard model changes are per-guild overrides, loaded from DB and applied at message time via `getConfig(guildId)`.

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

## Issue Conventions

Tickets are the source of context for asynchronous, agentic work. A well-formed issue should be clear enough to be picked up cold by a contributor or agent who has never seen the thread it came from. Templates live in `.github/ISSUE_TEMPLATE/`; the rules below describe the substance.

### Title Grammar

Use Conventional-Commits-style prefixes so titles communicate type and area at a glance:

- `feat(scope): …` — new capability or feature.
- `bug(scope): …` — bug report for a confirmed defect, regression, or reproducible unintended behavior.
- `fix(scope): …` — implementation work that fixes unintended behavior.
- `docs(scope): …` — documentation-only change.
- `test(scope): …` — test-only coverage, assertions, fixtures, or harness changes.
- `chore(scope): …` — repo hygiene and routine maintenance.
- `build(scope): …` — build system, CI, packaging, or dependency changes.
- `refactor(scope): …` — internal restructure with no behavioral change.

The scope is optional but encouraged. Prefer the primary scope-label tokens in titles (`ai`, `dashboard`, `backend`, `frontend`, `api`, `auth`, `ops`, `security`, `engagement`, `moderation`, `dependencies`). Narrower title-only scopes from templates are also allowed when they make the work easier to recognize at a glance: `agents`, `design`, `readme`, `mintlify`, `deps`, `tests`, `tooling`. Treat `deps` as title shorthand for `dependencies`; apply the `scope: dependencies` label when labeling dependency work. These title-only scopes do not create new label values, and labels still follow the taxonomy below. Slashed forms like `ui/dashboard` are accepted when narrower context helps. Drop the prefix only when the title is already specific and the type is unambiguous.

Dependency changes use `build(deps): …` or another `build(...)` title, not `chore(deps): …`.

Use `bug(...)` when the issue is primarily reporting the defect to investigate or repair. Use `fix(...)` when the title describes the code change that resolves the defect, or when filing an issue only to track a PR that already contains the fix.

### Label Taxonomy

Apply one label per axis. Missing labels make issues invisible to triage filters.

- **Scope** — where the work lives. Pick exactly one primary, add a secondary if the work clearly straddles two surfaces.
  - `scope: ai`, `scope: api`, `scope: auth`, `scope: backend`, `scope: dashboard`, `scope: dependencies`, `scope: engagement`, `scope: frontend`, `scope: moderation`, `scope: ops`, `scope: security`.
- **Priority** — urgency relative to other open work. Default to `priority: medium` if unsure.
  - `priority: high` — blocks releases, breaks production, or affects security.
  - `priority: medium` — meaningful improvement, no immediate blast radius.
  - `priority: low` — nice-to-have, polish, or speculative.
- **Size** — engineering effort estimate. The label has no space after the colon (matches the existing repo labels): `size:XS`, `size:S`, `size:M`, `size:L`, `size:XL`.
- Add `blocked` when an open dependency prevents progress. Reuse functional labels (`tests`, `config`, `documentation`, `dependencies`) when they meaningfully describe the change.

Do not invent new label values without first updating this section and the repository labels.

### Body Structure

Every non-trivial issue should be self-contained. Use the following sections, in order, omitting any that do not apply:

- **Summary** — one or two sentences naming the change and the file(s) at fault. Cite paths with line numbers when relevant (e.g. `src/utils/aiClient.js:263`).
- **Current state** / **Problem** — what exists today, with file references and observable behavior. Include reproduction steps for bugs.
- **Motivation** — why this matters now. Skip when the summary already makes it obvious.
- **Scope** — `IN` and `OUT` lists. Make the boundary explicit so reviewers know what to push back on.
- **Proposed design** / **Implementation sketch** — the shape of the solution, not a final spec. Snippets and pseudocode welcome.
- **Acceptance criteria** — a checkbox list a reviewer can tick off. Each item must be verifiable.
- **Dependencies** — `**Depends on:** #N` for hard ordering, `**Blocks:** #N` for outbound. Add the `blocked` label when the dependency is open.
- **Open questions** — unresolved decisions that should not block filing the issue.
- **Files likely touched** — best-effort path list to help the implementer orient.

### Self-Containment

A ticket must carry enough context to be picked up cold:

- Cite file paths and line numbers, not "the function in the AI client".
- Link related issues and PRs. If the conversation that produced this issue happened in Slack or a meeting, summarize the conclusion in the body.
- Quote relevant config keys, log lines, error messages, or schema snippets verbatim. Do not paraphrase.
- Capture any decision the issue depends on, even one already taken — future agents will not have access to your memory.

### Split, Merge, Epics

- **Split** when an issue spans more than one acceptance-criteria boundary, more than one scope label, or two distinct review surfaces (e.g. backend wiring + dashboard UX). File children that depend on each other and link them.
- **Merge** when two open issues describe the same root cause or would land in the same PR. Close the duplicate and reference the survivor.
- **File an epic** when work needs more than three child issues to land coherently or spans multiple PRs. Use a tracking issue with a checklist linking each child; mark it with the dominant scope and `priority: medium` (or higher) — epics rarely belong at `priority: low`. Children do their own labeling.

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
- Update the `Issue Conventions` section above and the templates in `.github/ISSUE_TEMPLATE/` when title grammar, label taxonomy, or body structure changes.
- Do not bury agent-only rules in `README.md`; keep them here.
