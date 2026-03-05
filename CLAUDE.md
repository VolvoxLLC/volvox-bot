# CLAUDE.md

See [AGENTS.md](./AGENTS.md) for full project context, architecture, and coding guidelines.

## Session Notes (2026-03-05)

- Removed `preflight` from `package.json`.
- Husky pre-push now runs `pnpm lint && pnpm test` directly.
- Updated contributor docs and PR template to reference direct lint/test commands.

## Session Notes (2026-03-05 - validation pipeline)

- Added `pnpm validate` (`scripts/validate.js`) as a full quality gate command.
- `pnpm validate` runs bot lint/tests/coverage plus web lint/typecheck/tests/build.
- Husky pre-push now runs `pnpm validate`.
- PR template was slimmed down to concise high-signal sections (Why, What Changed, Validation, Risk, Final Check).
