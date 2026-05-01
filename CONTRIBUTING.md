# Contributing to Volvox.Bot

Volvox.Bot is developed internally by the Volvox team. We're not currently accepting external contributions.

## Internal Contributors

See [DEVELOPMENT.md](DEVELOPMENT.md) for setup instructions and [AGENTS.md](AGENTS.md) for codebase conventions.

### Workflow

- Branch from `main` using branch naming prefixes that map to the issue/PR title type, such as `feat/`, `fix/`, `docs/`, `test/`, `build/`, `chore/`, and `refactor/`; use `fix/` for branches that resolve a `bug(...)` ticket
- Open a PR against `main` — CI must pass (lint + tests)
- PRs can be reviewed by Claude Code on demand by mentioning `@claude` in a PR comment or review
- Code style enforced by [Biome](https://biomejs.dev/) — run `pnpm lint` to check and `pnpm format` to auto-fix formatting

### Filing Issues and PRs

- Issue and PR titles follow the Conventional-Commits-style grammar in the [Issue Conventions section of `AGENTS.md`](AGENTS.md#issue-conventions).
- Use the issue templates in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/) when filing new issues; keep bodies self-contained with file references, dependencies, and acceptance criteria.
- Apply the appropriate `scope:`, `priority:`, and `size:` labels so triage filters work.
- The workflow branch prefixes above map to title prefixes, with `bug(...)` reports shipping from `fix/` branches.

### Questions?

Reach out in the Volvox internal channels.
