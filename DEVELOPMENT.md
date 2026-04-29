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
> Restart dev mode after changing `.env` files; running Node/Next processes keep their startup environment.

## Environment Variables

Copy [`.env.example`](.env.example) to `.env` — it contains full documentation for every variable.

**Required:** `DISCORD_TOKEN`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `DISCORD_CLIENT_ID`

**Optional:** `REDIS_URL`, `SENTRY_DSN`, `BOT_API_SECRET`, `LOG_LEVEL`, `NEXT_PUBLIC_SITE_URL`, and more — see the file.

The bot dev script loads root [`.env`](.env). The dashboard dev script runs from [`web/`](web) and loads [`web/.env`](web/.env.example); changing root dashboard values like `NEXTAUTH_URL` does not update the Next.js dev server unless the matching `web/.env` value changes too. Dev startup intentionally lets those files override stale exported shell variables.

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
