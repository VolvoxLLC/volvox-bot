# Development

Internal development guide for Volvox.Bot contributors.

## Prerequisites

- Node.js 22+
- pnpm 10.33+
- PostgreSQL 17+
- Redis 7+ (optional, in-memory fallback available)

## Setup

```bash
git clone https://github.com/VolvoxLLC/volvox-bot.git
cd volvox-bot
pnpm install
cp .env.example .env       # Edit .env with your tokens
pnpm migrate               # Run database migrations
pnpm deploy                # Register slash commands with Discord
pnpm start                 # Start the bot
```

For the web dashboard:

```bash
pnpm --prefix web install
pnpm mono:dev              # Start bot + dashboard together
```

> Use `pnpm dev` (bot only) or `pnpm mono:dev` (all workspaces) for file-watching dev mode.

## Environment Variables

Copy [`.env.example`](.env.example) to `.env` — it contains full documentation for every variable.

**Required:** `DISCORD_TOKEN`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `DISCORD_CLIENT_ID`

**Optional:** `REDIS_URL`, `SENTRY_DSN`, `BOT_API_SECRET`, `LOG_LEVEL`, `NEXT_PUBLIC_SITE_URL`, and more — see the file.

Dashboard Sentry capture is enabled when `NEXT_PUBLIC_SENTRY_DSN` is set for browser errors and `SENTRY_DSN` is set for server/edge errors. Use `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` to separate development, preview, staging, and production. Use `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE` for release grouping, and set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` in CI only if source maps should be uploaded.

## Commands

```bash
pnpm test              # Run bot tests
pnpm test:coverage     # With 85% coverage enforcement
pnpm lint              # Biome lint + format check
pnpm lint:fix          # Auto-fix
pnpm mono:dev          # Dev mode (all workspaces)
pnpm mono:build        # Build all workspaces
pnpm mono:typecheck    # Typecheck all workspaces
```

## Project Structure

See [AGENTS.md](AGENTS.md) for repo-specific agent rules, workflows, and gotchas.

See [DESIGN.md](DESIGN.md) for dashboard visual direction and the design system.


## GitHub Wiki workflow

Do not treat the project wiki as files inside this repository. GitHub wikis are a separate git repository.

1. Update source pages under `docs/wiki-pages/` (see `docs/wiki-pages/README.md` for page inventory).
2. Clone the wiki repo using GitHub's documented flow (`<repo>.wiki.git`).
3. Copy updated pages into the cloned wiki repo, commit, and push.

Example commands:

```bash
git clone https://github.com/VolvoxLLC/volvox-bot.wiki.git
cp docs/wiki-pages/{Home,Quick-Start,Configuration-Reference,Operations-Runbook,Troubleshooting}.md volvox-bot.wiki/
cd volvox-bot.wiki
git add *.md
git commit -m "docs: update wiki pages"
git push origin master
```

This follows GitHub's "cloning wikis to your computer" process directly without additional helper tooling.
