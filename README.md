# 🤖 Volvox.Bot

[![CI](https://github.com/VolvoxLLC/volvox-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/VolvoxLLC/volvox-bot/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/VolvoxLLC/volvox-bot/badge.svg?branch=main)](https://coveralls.io/github/VolvoxLLC/volvox-bot?branch=main)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10.33+-orange.svg)](https://pnpm.io)

AI-powered Discord bot for the [Volvox](https://volvox.dev) developer community — a pnpm monorepo containing the bot (Node.js, ESM JavaScript, discord.js v14) and a web dashboard (Next.js 16, TypeScript, React 19). Powered by [Claude](https://anthropic.com).

---

## ⚡ Quick Start

### Option A — Docker Compose (recommended)

The fastest way to get everything running. Docker Compose starts PostgreSQL, Redis, the bot, and the web dashboard in one command.

```bash
git clone https://github.com/VolvoxLLC/volvox-bot.git
cd volvox-bot
cp .env.example .env
# Edit .env — fill in DISCORD_TOKEN, ANTHROPIC_API_KEY, and DISCORD_CLIENT_ID at minimum
docker compose up --build
```

| Service | URL |
|---------|-----|
| Bot API | `http://localhost:6968` |
| Web Dashboard | `http://localhost:6969` |
| Docs | `http://localhost:3100` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

> Docker Compose automatically configures `DATABASE_URL`, `REDIS_URL`, and service networking. See [docker-compose.yml](docker-compose.yml) for details.

### Option B — Local development (without Docker)

Requires PostgreSQL 17+ and (optionally) Redis 7+ running on your machine.

```bash
# 1. Clone and install
git clone https://github.com/VolvoxLLC/volvox-bot.git
cd volvox-bot
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in DISCORD_TOKEN, ANTHROPIC_API_KEY, DATABASE_URL, DISCORD_CLIENT_ID

# 3. Run database migrations
pnpm migrate

# 4. Deploy slash commands to Discord
pnpm deploy

# 5. Start the bot
pnpm start
```

To also run the web dashboard:

```bash
# Install web dependencies (separate workspace)
pnpm --prefix web install

# Start bot + dashboard together (Turbo)
pnpm mono:dev
```

> **Tip:** For development with file watching, use `pnpm dev` (bot only) or `pnpm mono:dev` (all workspaces).

---

## ✨ Features

### AI & Chat

- **🧠 AI Chat** — Mention the bot to chat with Claude. Maintains per-channel conversation history with intelligent context management.
- **🎯 Smart Triage** — Two-step evaluation (fast classifier + responder) that drives chime-ins and community rule enforcement.
- **🤖 AI Auto-Moderation** — Automated moderation powered by Claude. Analyzes messages for toxicity, spam, and harassment with configurable thresholds and actions.
- **👍👎 AI Feedback** — Users can rate AI responses with thumbs up/down reactions. Feedback tracked in dashboard analytics.
- **🚫 AI Channel Blocklist** — Configure channels the bot ignores for AI responses. Supports thread inheritance.
- **🧠 User Memory** — Long-term memory per user via [mem0](https://mem0.ai) for personalized AI interactions.

### Community & Engagement

- **👋 Dynamic Welcome Messages** — Contextual onboarding with template variables (`{user}`, `{server}`, `{memberCount}`), multiple variants, DM sequences, and role menus.
- **🎭 Reaction Roles** — Role menus where users get roles by reacting. Custom/Unicode emoji support, built-in templates.
- **⏰ Temporary Roles** — Assign roles that auto-expire after a duration.
- **🎤 Voice Activity Tracking** — Track voice channel activity for insights and leaderboards.
- **⭐ Starboard** — Highlight popular messages with star reactions.
- **📊 Reputation / XP System** — Track engagement and award XP/levels with configurable thresholds and role rewards.
- **💤 AFK System** — Set AFK status; bot notifies mentioners and DMs ping summaries on return.
- **🏆 Challenges** — Daily coding challenges with submissions and leaderboards.
- **📌 Showcase** — Project showcase with threaded discussion.
- **👀 Code Review** — Request and manage code reviews within Discord.
- **💬 Polls** — Create and manage polls with reactions.
- **✂️ Snippets** — Save and share code snippets.
- **⏰ Reminders** — Schedule personal reminders.
- **🎫 Tickets** — Support ticket system with threads.

### Moderation

- **⚔️ Moderation Suite** — Full toolkit: warn, kick, ban, tempban, softban, timeout, purge, lock/unlock, slowmode.
- **🛡️ Protected Roles** — Admins/mods protected from moderation actions.
- **📋 Moderation History** — Case management with warn editing, removal, and escalation thresholds.
- **🔇 Channel Quiet Mode** — Temporarily silence the bot via `@bot quiet`.
- **📝 Scheduled Announcements** — Schedule one-time or recurring messages.

### Configuration & Management

- **⚙️ Runtime Config** — All settings in PostgreSQL with live `/config` command and web dashboard.
- **💾 Backup & Restore** — Export/import config with automatic scheduled backups.
- **🔄 Command Aliases** — Custom shortcuts for commands (e.g., `/w` → `/warn`).
- **📈 Performance Monitoring** — Real-time memory, CPU, response time tracking with alerting.
- **📡 Webhook Notifications** — Outbound webhooks for bot events (mod actions, errors, config changes).
- **🔐 Role-Based Permissions** — Configurable admin/moderator roles and per-command access control.

### Dashboard & Analytics

- **🌐 Web Dashboard** — Next.js admin panel with Discord OAuth2, dark/light themes, mobile support.
- **📊 Analytics** — Message activity, command usage, voice time, AI feedback, engagement metrics with PDF export.
- **📜 Audit Log** — Complete action history with filtering, CSV/JSON export, WebSocket streaming.
- **🔍 Conversation Viewer** — Browse AI conversation history with search and filtering.

### Infrastructure

- **⚡ Redis Caching** — Distributed caching for config, Discord API, reputation, rate limiting. Graceful in-memory fallback when Redis is unavailable.
- **🔒 Security** — HMAC webhooks, prototype pollution protection, input validation, secrets management.
- **📊 Health Monitoring** — Built-in health checks (`/api/v1/health`) and bot status reporting.
- **🔄 GitHub Feed** — Post GitHub repository events to Discord channels.

---

## 🏗️ Architecture

```text
Discord User
     │
     ▼
┌─────────────┐     ┌──────────────┐
│  Volvox.Bot  │────▶│   Claude API │
│  (Node.js)  │◀────│  (Anthropic) │
└──────┬──────┘     └──────────────┘
       │
       ├──────────────┬──────────────┐
       ▼              ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│  PostgreSQL  │ │  Redis   │ │     Web      │
│  (Config +   │ │  (Cache  │ │   Dashboard  │
│   State)     │ │  + Rate  │ │  (Next.js)   │
│              │ │  Limit)  │ │              │
└──────────────┘ └──────────┘ └──────────────┘
```

See [`package.json`](package.json) and [`web/package.json`](web/package.json) for the full dependency list and versions.

---

## 📋 Prerequisites

- [Node.js](https://nodejs.org) 22+ (enforced via `engines` in `package.json`)
- [pnpm](https://pnpm.io) 10.30+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [PostgreSQL](https://www.postgresql.org/) 17+
- [Redis](https://redis.io/) 7+ (optional — falls back to in-memory)
- [Anthropic API key](https://console.anthropic.com)
- [Discord application](https://discord.com/developers/applications) with bot token

> **Or just use Docker** — `docker compose up` handles all infrastructure.

---

## 🚀 Setup

### 1. Clone and install

```bash
git clone https://github.com/VolvoxLLC/volvox-bot.git
cd volvox-bot
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in values. See the [Environment Variables](#-environment-variables) section for all options.

### 3. Configure the bot

Edit `config.json` to match your Discord server. All settings can also be changed at runtime via the `/config` slash command or the web dashboard.

### 4. Set up your Discord application

1. Create an app at [discord.com/developers/applications](https://discord.com/developers/applications)
2. **Bot** → Add Bot → Copy token → set as `DISCORD_TOKEN` in `.env`
3. Enable **Privileged Gateway Intents**:
   - ✅ Message Content Intent
   - ✅ Server Members Intent
   - ✅ Guild Voice States Intent
   - ✅ Guild Message Reactions Intent
4. **OAuth2** → URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Permissions: View Channels, Send Messages, Read Message History, Manage Messages, Add Reactions, Manage Roles
5. Copy the generated URL and invite the bot to your server

### 5. Run database migrations

```bash
pnpm migrate
```

### 6. Deploy slash commands

Register slash commands with Discord (required on first run and when adding new commands):

```bash
pnpm deploy
```

For guild-scoped commands during development (instant, no 1-hour cache):

```bash
pnpm deploy -- --guild-id <your_guild_id>
```

### 7. Start the bot

```bash
pnpm start       # Production
pnpm dev          # Development (file watching)
```

---

## 🔑 Environment Variables

Copy `.env.example` to `.env`. Below is a summary — see [.env.example](.env.example) for full documentation and inline comments.

### Required

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Discord bot token |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude (or use `CLAUDE_CODE_OAUTH_TOKEN`) |
| `DATABASE_URL` | PostgreSQL connection string (e.g., `postgresql://postgres:postgres@localhost:5432/volvoxbot`) |
| `DISCORD_CLIENT_ID` | Discord application client ID (needed for slash command deployment) |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string | In-memory fallback |
| `BOT_API_PORT` | Port for the bot REST API | `3001` |
| `BOT_API_SECRET` | Shared secret for bot ↔ dashboard auth | — |
| `BOT_OWNER_IDS` | Comma-separated Discord user IDs (bypass all permission checks) | — |
| `MEM0_API_KEY` | [mem0](https://app.mem0.ai) API key for long-term memory | — |
| `SENTRY_DSN` | Sentry error tracking DSN | — |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) | `info` |
| `WEBHOOK_SECRET` | Secret for webhook HMAC signing | `SESSION_SECRET` |

### Web Dashboard

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_URL` | Dashboard canonical URL (e.g., `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Session encryption secret (generate: `openssl rand -base64 32`) |
| `DISCORD_CLIENT_SECRET` | Discord OAuth2 client secret |
| `DASHBOARD_URL` | Dashboard URL for CORS origin |
| `BOT_API_URL` | Bot API URL for dashboard → bot communication |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | Discord client ID exposed to browser |

---

## ⚙️ Configuration

All configuration lives in [`config.json`](config.json) and is editable via the `/config` slash command or the web dashboard. Config is stored in PostgreSQL with live reload — changes take effect immediately. See the file for all available sections and defaults.

---

## 🛠️ Development

### Commands Reference

| Command | Description |
|---------|-------------|
| `pnpm start` | Start the bot in production mode |
| `pnpm dev` | Start the bot with file watching |
| `pnpm deploy` | Register slash commands with Discord |
| `pnpm test` | Run bot tests (Vitest) |
| `pnpm test:coverage` | Run bot tests with 85% coverage enforcement |
| `pnpm lint` | Lint and format check (Biome — bot + web) |
| `pnpm lint:fix` | Auto-fix lint and formatting issues |
| `pnpm format` | Format all files with Biome |
| `pnpm migrate` | Run database migrations (up) |
| `pnpm migrate:down` | Rollback last migration |
| `pnpm migrate:create` | Create a new migration file |
| `pnpm changeset` | Create a changeset for versioning |

### Monorepo Commands (Turborepo)

| Command | Description |
|---------|-------------|
| `pnpm mono:dev` | Run dev scripts across all workspaces |
| `pnpm mono:build` | Build all workspaces |
| `pnpm mono:lint` | Lint all workspaces |
| `pnpm mono:test` | Test all workspaces |
| `pnpm mono:test:coverage` | Test all workspaces with coverage |
| `pnpm mono:typecheck` | Typecheck all workspaces |

### Web Dashboard Commands

| Command | Description |
|---------|-------------|
| `pnpm --prefix web install` | Install web dependencies |
| `pnpm --prefix web dev` | Start dashboard in dev mode (Turbopack) |
| `pnpm --prefix web build` | Build the Next.js dashboard |
| `pnpm --prefix web test` | Run web tests |
| `pnpm --prefix web test:coverage` | Run web tests with coverage |
| `pnpm --prefix web typecheck` | TypeScript type checking |

### Code Style

Code style is enforced by [Biome](https://biomejs.dev/) — see [`biome.json`](biome.json) for the full configuration. For codebase conventions and hard rules, see [`AGENTS.md`](AGENTS.md).

---

## 🧪 Testing

### Bot Tests

```bash
pnpm test              # Run all bot tests
pnpm test:coverage     # Run with 85% coverage threshold enforcement
```

- **Framework:** Vitest 4 with `node` environment
- **Test files:** `tests/**/*.test.js` (JavaScript, ESM)
- **Coverage thresholds:** 85% for statements, branches, functions, and lines
- **Timeout:** 10 seconds per test

### Web Dashboard Tests

```bash
pnpm --prefix web test             # Run web tests
pnpm --prefix web test:coverage    # Run with 85% coverage threshold
```

- **Framework:** Vitest 4 with `jsdom` environment and React Testing Library
- **Test files:** `web/tests/**/*.test.{ts,tsx}` (TypeScript)

### CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs on every PR and push to `main`:

1. **Lint** — `pnpm mono:lint` (Biome check on bot + web)
2. **Test** — Bot tests with coverage + web tests + Coveralls upload
3. **Typecheck & Build** — `pnpm mono:typecheck` + `pnpm mono:build`
4. **Docker** — Validates bot and web Docker images build successfully

All checks must pass before merging.

---

## 🐳 Docker

### Development with Docker Compose

```bash
cp .env.example .env
# Edit .env with your tokens
docker compose up --build
```

This starts:

- **PostgreSQL 17** on port 5432
- **Redis 7** on port 6379
- **Bot** on port 6968 (API + WebSocket)
- **Web Dashboard** on port 6969
- **Docs** on port 3100

### Production Docker Images

**Bot:**

```bash
docker build -t volvox-bot .
docker run -d --env-file .env volvox-bot
```

**Web Dashboard:**

```bash
docker build -t volvox-bot-web ./web \
  --build-arg NEXT_PUBLIC_DISCORD_CLIENT_ID=your_client_id
docker run -d --env-file .env volvox-bot-web
```

Both images use multi-stage builds with non-root users and health checks.

---

## 🗃️ Project Structure

```text
volvox-bot/
├── src/                        # Bot source (ESM JavaScript)
│   ├── index.js                # Entry point — event handlers, bot startup
│   ├── logger.js               # Winston logger (console, file, DB, Sentry, WS)
│   ├── redis.js                # Redis client with graceful degradation
│   ├── db.js                   # PostgreSQL pool management
│   ├── sentry.js               # Sentry error tracking setup
│   ├── deploy-commands.js      # Slash command registration script
│   ├── api/                    # Express 5 REST API
│   │   ├── server.js           # Express app + HTTP server lifecycle
│   │   ├── routes/             # API route handlers
│   │   ├── middleware/         # Auth, rate limiting, validation
│   │   ├── utils/              # configAllowlist.js, validation helpers
│   │   └── ws/                 # WebSocket streams (logs, audit)
│   ├── commands/               # 45 slash commands
│   ├── modules/                # Feature modules (ai, config, moderation, etc.)
│   │   └── handlers/          # Event-specific handlers
│   ├── prompts/                # AI prompt templates
│   ├── transports/             # Winston transports (Sentry, PostgreSQL, WS)
│   └── utils/                  # Shared utilities (cache, safeSend, etc.)
├── tests/                      # Bot test suite (Vitest, JavaScript)
├── web/                        # Next.js web dashboard (TypeScript)
│   ├── src/
│   │   ├── app/                # App Router pages
│   │   ├── components/         # React components (dashboard, landing, UI)
│   │   ├── hooks/              # Custom React hooks
│   │   ├── lib/                # Utilities, page-titles, auth, API client
│   │   ├── stores/             # Zustand state management
│   │   └── types/              # TypeScript types
│   ├── tests/                  # Web test suite
│   ├── Dockerfile              # Dashboard production image
│   └── package.json            # Web workspace dependencies
├── migrations/                 # PostgreSQL migrations (.cjs files)
├── docs/                       # Documentation site
├── scripts/                    # Build/utility scripts
├── config.json                 # Default bot configuration
├── docker-compose.yml          # Local dev stack (PostgreSQL, Redis, bot, web)
├── Dockerfile                  # Bot production image
├── biome.json                  # Biome linter/formatter config
├── vitest.config.js            # Bot test config
├── turbo.json                  # Turborepo task config
├── pnpm-workspace.yaml         # Monorepo workspace config
├── railway.toml                # Railway deployment config
└── .env.example                # Environment variable template
```

### Slash Commands (45)

| Category | Commands |
|----------|----------|
| **AI & Utility** | `help`, `memory`, `ping`, `profile`, `rank`, `snippet`, `status`, `tldr` |
| **Community** | `afk`, `challenge`, `github`, `leaderboard`, `poll`, `reactionrole`, `remind`, `review`, `rolemenu`, `showcase`, `ticket`, `voice`, `welcome` |
| **Moderation** | `ban`, `case`, `clearwarnings`, `editwarn`, `history`, `kick`, `lock`, `modlog`, `purge`, `removewarn`, `slowmode`, `softban`, `tempban`, `timeout`, `unban`, `unlock`, `untimeout`, `warn`, `warnings` |
| **Admin** | `alias`, `announce`, `config`, `reload`, `temprole` |

---

## 🗄️ Database Migrations

Migrations use [node-pg-migrate](https://github.com/salsita/node-pg-migrate) with `.cjs` file extension (CommonJS required for compatibility with ESM project).

```bash
pnpm migrate              # Run all pending migrations
pnpm migrate:down         # Rollback last migration
pnpm migrate:create -- my-migration-name   # Create a new migration
```

Migrations use sequential numbering (`001_`, `002_`, etc.).

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| Slash commands not appearing | Run `pnpm deploy` to register commands with Discord |
| Redis connection errors | Check `REDIS_URL` in `.env`; bot degrades gracefully without Redis |
| Tests failing on CI | Run `pnpm test:coverage` locally; check 85% coverage thresholds |
| Config not saving via API/dashboard | Ensure the key is in `SAFE_CONFIG_KEYS` in `src/api/utils/configAllowlist.js` |
| Lint errors on `console.*` | Replace with Winston logger: `import logger from './logger.js'` |
| Web build fails | Run `pnpm --prefix web install` then `pnpm --prefix web build` |
| Migration ESM errors | Ensure migration files use `.cjs` extension, not `.js` |
| Docker build fails | Ensure Docker BuildKit is enabled and `.env` is populated |
| Bot can't connect to DB in Docker | Wait for the `db` health check; `docker compose up` handles this automatically |

---

## 📚 Documentation

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Development workflow, branch naming, commit conventions, PR process
- **[AGENTS.md](AGENTS.md)** — Codebase conventions, hard rules, wiring details for contributors
- **[DESIGN.md](DESIGN.md)** — Design system, color palette, component guidelines for the web dashboard
- **[.env.example](.env.example)** — Complete environment variable reference with inline documentation
- **[config.json](config.json)** — Full bot configuration with all available options
- **API Reference** — Available at `/api/docs.json` when the bot is running (OpenAPI/Swagger)

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, coding conventions, and PR process.

## 📄 License

MIT License — see [LICENSE](LICENSE).

---

Built with ❤️ by the [Volvox](https://volvox.dev) team.
