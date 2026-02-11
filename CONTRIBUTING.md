# Contributing to Bill Bot

Thanks for your interest in contributing! Bill Bot is part of the [Volvox](https://volvox.dev) open-source community.

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

1. **Lint:** `pnpm lint` — must pass with no errors
2. **Format:** `pnpm format` — auto-format your code
3. **Test:** `pnpm test` — all tests must pass
4. **Commit:** use conventional commit messages

### Pull Requests

1. Open a PR against `main`
2. Fill in the PR description with what changed and why
3. PRs are automatically reviewed by Claude Code
4. CI must pass (lint + tests)
5. Wait for a maintainer review

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
