# Quick Start

This page is a minimal path from clone to running bot + dashboard locally.

## Prerequisites

- Node.js 22+
- pnpm `10.33.2` (pinned by the repo `packageManager`; Corepack recommended)
- PostgreSQL 17+
- Redis is optional; session storage falls back to in-memory when `REDIS_URL` is unset
- Discord application + bot token

## 1) Install dependencies

```bash
pnpm install
```

## 2) Configure environment

Copy `.env.example` to `.env` and fill the values you need:

```bash
cp .env.example .env
```

Required for the bot and shared API/database setup:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `SESSION_SECRET`
- `MINIMAX_API_KEY`
- `DATABASE_URL`
- `BOT_OWNER_IDS`

Required when running the web dashboard locally:

- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `BOT_API_URL`
- `BOT_API_SECRET`
- `DASHBOARD_URL`
- `NEXT_PUBLIC_DISCORD_CLIENT_ID`

Optional first-run values you may want to keep from `.env.example`:

- `BOT_API_PORT` (defaults to `3001`)
- `NEXT_PUBLIC_SITE_URL` (defaults to production site URL)
- `REDIS_URL` (optional; falls back to in-memory session storage)
- `MEM0_API_KEY` (optional memory integration)
- `LOG_LEVEL` (defaults to `info`)

## 3) Initialize database

```bash
pnpm migrate
```

## 4) Run bot + web

Run both workspace dev servers together:

```bash
pnpm mono:dev
```

Or run them in separate terminals:

```bash
pnpm dev
pnpm --prefix web dev
```

`pnpm dev` starts the bot only; use `pnpm mono:dev` or the split-terminal commands above when you also need the dashboard.

## 5) Validate core health

```bash
pnpm mono:typecheck
pnpm mono:test
```

## Common first-run issues

- OAuth callback mismatch: verify the Discord redirect URI points to the bot API callback endpoint, such as `http://localhost:3001/api/v1/auth/discord/callback`.
- Login loops in dashboard dev: confirm `127.0.0.1` support in `web/next.config.mjs`.
- Missing guild data in dashboard: ensure bot is in guild and permissions are granted.
