# Quick Start

This page is a minimal path from clone to running bot + dashboard locally.

## Prerequisites

- Node.js 22+
- pnpm (latest)
- PostgreSQL and Redis available
- Discord application + bot token

## 1) Install dependencies

```bash
pnpm install
```

## 2) Configure environment

Create `.env` using project defaults from docs and set at least:

- `DISCORD_TOKEN`
- `DATABASE_URL`
- `REDIS_URL`
- `SESSION_SECRET` (for dashboard auth/session security)

## 3) Initialize database

```bash
pnpm db:migrate
```

## 4) Run bot + web

```bash
pnpm dev
```

## 5) Validate core health

```bash
pnpm mono:typecheck
pnpm mono:test
```

## Common first-run issues

- OAuth callback mismatch: verify Discord redirect URI matches local dashboard URL.
- Login loops in dashboard dev: confirm `127.0.0.1` support in `web/next.config.mjs`.
- Missing guild data in dashboard: ensure bot is in guild and permissions are granted.
