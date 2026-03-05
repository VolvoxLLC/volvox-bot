# Contributing to Volvox Bot

Thanks for your interest in contributing! Volvox Bot is part of the [Volvox](https://volvox.dev) open-source community.

## Getting Started

1. Fork the repository
2. Follow the [setup instructions](README.md#-setup) in the README
3. Create a feature branch from `main`

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

- `feat/add-music-command` — new features
- `fix/welcome-message-crash` — bug fixes
- `chore/update-dependencies` — maintenance
- `docs/update-readme` — documentation
- `refactor/simplify-config` — code improvements

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add music playback command
fix: prevent crash on empty welcome channel
chore: update discord.js to v14.16
docs: add API reference to README
refactor: simplify config loading logic
style: format with Biome
test: add config validation tests
ci: update Node.js version in CI
```

### Before Submitting

1. **Validate (required):** `pnpm validate`
2. **Format (if needed):** `pnpm format`
3. **Commit:** use conventional commit messages

`pnpm validate` runs:

- bot lint
- bot tests
- bot coverage thresholds
- web lint
- web typecheck
- web tests
- web build

### Pull Requests

1. Open a PR against `main`
2. Fill in the PR description with what changed and why
3. PRs are automatically reviewed by Claude Code
4. CI must pass (lint + tests)
5. Wait for a maintainer review

For review standards and module boundary checks, use [docs/review-checklist.md](docs/review-checklist.md).
For analytics schema/query changes, follow [docs/analytics-change-playbook.md](docs/analytics-change-playbook.md).

## Code Style

Code style is enforced by [Biome](https://biomejs.dev/):

- Single quotes
- Semicolons always
- 2-space indentation
- Trailing commas
- 100-character line width

Run `pnpm format` to auto-format. The CI will reject PRs with formatting issues.

## Project Structure

See [AGENTS.md](AGENTS.md) for a detailed guide to the codebase, including:

- Key files and their purposes
- How to add commands and modules
- Code conventions
- Common pitfalls

## Questions?

- Open an issue on GitHub
- Ask in the Volvox Discord server at [volvox.dev](https://volvox.dev)
