# 🤖 Bill Bot — Volvox Discord Bot

[![CI](https://github.com/BillChirico/bills-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/BillChirico/bills-bot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org)

AI-powered Discord bot for the [Volvox](https://volvox.dev) developer community. Built with discord.js v14 and powered by Claude via the [Anthropic Agent SDK](https://github.com/anthropics/claude-agent-sdk).

## ✨ Features

- **🧠 AI Chat** — Mention the bot to chat with Claude. Maintains per-channel conversation history with intelligent context management.
- **🎯 Smart Triage** — Intelligent message triage system that classifies conversations, selects the right model tier (Haiku/Sonnet/Opus), and responds naturally — including organic chime-ins when the bot has something valuable to add.
- **👋 Dynamic Welcome Messages** — Contextual onboarding with time-of-day greetings, community activity snapshots, member milestones, and highlight channels.
- **🛡️ Spam Detection** — Pattern-based scam/spam detection with mod alerts and optional auto-delete.
- **⚔️ Moderation Suite** — Full-featured mod toolkit: warn, kick, ban, tempban, softban, timeout, purge, lock/unlock, slowmode. Includes case management, mod log routing, DM notifications, auto-escalation, and tempban scheduling.
- **⚙️ Config Management** — All settings stored in PostgreSQL with live `/config` slash command for runtime changes.
- **📊 Health Monitoring** — Built-in health checks and `/status` command for uptime, memory, and latency stats.
- **🎤 Voice Activity Tracking** — Tracks voice channel activity for community insights.
- **🌐 Web Dashboard** — Next.js-based admin dashboard with Discord OAuth2 login, server selector, and guild management UI.

## 🏗️ Architecture

```text
Discord User
     │
     ▼
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│  Bill Bot    │────▶│  Anthropic   │────▶│  Claude  │
│  (Node.js)  │◀────│  Agent SDK  │◀────│  (AI)    │
└──────┬──────┘     └──────────────┘     └─────────┘
       │
       ▼
┌──────────────┐
│  PostgreSQL  │  Config, state persistence
└──────────────┘
```

## 📋 Prerequisites

- [Node.js](https://nodejs.org) 22+
- [pnpm](https://pnpm.io) (`npm install -g pnpm`)
- [PostgreSQL](https://www.postgresql.org/) database
- An [Anthropic API key](https://console.anthropic.com) (for AI chat features)
- A [Discord application](https://discord.com/developers/applications) with bot token

## 🚀 Setup

### 1. Clone and install

```bash
git clone https://github.com/BillChirico/bills-bot.git
cd bills-bot
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values (see [Environment Variables](#-environment-variables) below).

### 3. Configure the bot

Edit `config.json` to match your Discord server (see [Configuration](#️-configuration) below).

### 4. Set up Discord bot

1. Create an app at [discord.com/developers/applications](https://discord.com/developers/applications)
2. **Bot** → Add Bot → Copy token → paste as `DISCORD_TOKEN`
3. Enable **Privileged Gateway Intents**:
   - ✅ Message Content Intent
   - ✅ Server Members Intent
4. **OAuth2** → URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Permissions: View Channels, Send Messages, Read Message History, Manage Messages
5. Invite bot to your server with the generated URL

### 5. Run

```bash
pnpm start
```

For development with auto-restart:

```bash
pnpm dev
```

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | ✅ | Discord bot token |
| `DISCORD_CLIENT_ID` | ✅* | Discord application/client ID for slash-command deployment (`pnpm deploy`) |
| `GUILD_ID` | ❌ | Guild ID for faster dev command deployment (omit for global) |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key for Claude Agent SDK |
| `DATABASE_URL` | ✅** | PostgreSQL connection string for persistent config/state |
| `MEM0_API_KEY` | ❌ | Mem0 API key for long-term memory |
| `BOT_API_SECRET` | ✅*** | Shared secret for web dashboard API authentication |
| `LOG_LEVEL` | ❌ | Logging level: `debug`, `info`, `warn`, `error` (default: `info`) |

\* Legacy alias supported: `CLIENT_ID`  
\** Bot can run without DB, but persistent config is strongly recommended in production.  
\*** Required when running with the web dashboard. Can be omitted for bot-only deployments.


### Web Dashboard

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_URL` | ✅ | Canonical URL of the dashboard (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | ✅ | Random secret for NextAuth.js JWT encryption (min 32 chars). Generate with `openssl rand -base64 48` |
| `DISCORD_CLIENT_ID` | ✅ | Discord OAuth2 application client ID |
| `DISCORD_CLIENT_SECRET` | ✅ | Discord OAuth2 application client secret |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | ❌ | Public client ID for bot invite links in the UI |
| `BOT_API_URL` | ❌ | URL of the bot's REST API for mutual guild filtering |
| `BOT_API_SECRET` | ❌ | Shared secret for authenticating requests to the bot API |

## ⚙️ Configuration

All configuration lives in `config.json` and can be updated at runtime via the `/config` slash command. When `DATABASE_URL` is set, config is persisted to PostgreSQL.

### AI Chat (`ai`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable/disable AI responses |
| `systemPrompt` | string | System prompt defining bot personality |
| `channels` | string[] | Channel IDs to respond in (empty = all channels) |
| `historyLength` | number | Max conversation history entries per channel (default: 20) |
| `historyTTLDays` | number | Days before old history is cleaned up (default: 30) |
| `threadMode.enabled` | boolean | Enable threaded responses |
| `threadMode.autoArchiveMinutes` | number | Thread auto-archive timeout |
| `threadMode.reuseWindowMinutes` | number | Window for reusing existing threads |

### Triage (`triage`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable triage-based message classification |
| `defaultInterval` | number | Base evaluation interval in ms (default: 10000) |
| `maxBufferSize` | number | Max messages per channel buffer (default: 30) |
| `triggerWords` | string[] | Words that force instant evaluation |
| `moderationKeywords` | string[] | Words that flag for moderation |
| `models.triage` | string | Model for classification (default: `claude-haiku-4-5`) |
| `models.default` | string | Default response model (default: `claude-sonnet-4-5`) |
| `budget.triage` | number | Max USD per triage classification (default: 0.05) |
| `budget.response` | number | Max USD per response generation (default: 0.50) |
| `timeouts.triage` | number | Classification timeout in ms (default: 10000) |
| `timeouts.response` | number | Response generation timeout in ms (default: 30000) |
| `channels` | string[] | Channels to monitor (empty = all) |
| `excludeChannels` | string[] | Channels to never triage |

### Welcome Messages (`welcome`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable welcome messages |
| `channelId` | string | Channel to post welcome messages |
| `message` | string | Static fallback message template |
| `dynamic.enabled` | boolean | Enable AI-generated dynamic welcomes |
| `dynamic.timezone` | string | Timezone for time-of-day greetings |
| `dynamic.activityWindowMinutes` | number | Window for activity snapshot |
| `dynamic.milestoneInterval` | number | Member count milestone interval |
| `dynamic.highlightChannels` | string[] | Channels to highlight in welcomes |

### Moderation (`moderation`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable moderation features |
| `alertChannelId` | string | Channel for mod alerts |
| `autoDelete` | boolean | Auto-delete detected spam |
| `dmNotifications.warn` | boolean | DM users when warned |
| `dmNotifications.timeout` | boolean | DM users when timed out |
| `dmNotifications.kick` | boolean | DM users when kicked |
| `dmNotifications.ban` | boolean | DM users when banned |
| `escalation.enabled` | boolean | Enable auto-escalation after repeated warns |
| `escalation.thresholds` | array | Escalation rules (see below) |
| `logging.channels.default` | string | Fallback mod log channel ID |
| `logging.channels.warns` | string | Channel for warn events |
| `logging.channels.bans` | string | Channel for ban/unban events |
| `logging.channels.kicks` | string | Channel for kick events |
| `logging.channels.timeouts` | string | Channel for timeout events |
| `logging.channels.purges` | string | Channel for purge events |
| `logging.channels.locks` | string | Channel for lock/unlock events |

**Escalation thresholds** are objects with: `warns` (count), `withinDays` (window), `action` ("timeout" or "ban"), `duration` (for timeout, e.g. "1h").

### Permissions (`permissions`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable permission checks |
| `adminRoleId` | string | Role ID for admin commands |
| `moderatorRoleId` | string | Role ID for moderator commands |
| `botOwners` | string[] | Discord user IDs that bypass all permission checks |
| `allowedCommands` | object | Per-command permission levels (`everyone`, `moderator`, `admin`) |

> **⚠️ For forks/deployers:** The default `config.json` ships with the upstream maintainer's Discord user ID in `permissions.botOwners`. Update this array with your own Discord user ID(s) before deploying. Bot owners bypass all permission checks.

## ⚔️ Moderation Commands

Most moderation commands require admin-level access. `/modlog` is moderator-level by default (`permissions.allowedCommands.modlog = "moderator"`).

### Core Actions

| Command | Description |
|---------|-------------|
| `/warn <user> [reason]` | Issue a warning |
| `/kick <user> [reason]` | Remove from server |
| `/timeout <user> <duration> [reason]` | Temporarily mute (up to 28 days) |
| `/untimeout <user> [reason]` | Remove active timeout |
| `/ban <user> [reason] [delete_days]` | Permanent ban |
| `/tempban <user> <duration> [reason] [delete_days]` | Temporary ban with auto-unban |
| `/unban <user_id> [reason]` | Unban by user ID |
| `/softban <user> [reason] [delete_days]` | Ban + immediate unban (purges messages) |

### Message Management

| Command | Description |
|---------|-------------|
| `/purge all <count>` | Bulk delete messages (1–100) |
| `/purge user <user> <count>` | Delete messages from a specific user |
| `/purge bot <count>` | Delete bot messages only |
| `/purge contains <text> <count>` | Delete messages containing text |
| `/purge links <count>` | Delete messages with URLs |
| `/purge attachments <count>` | Delete messages with files/images |

### Case Management

| Command | Description |
|---------|-------------|
| `/case view <case_id>` | View a specific case |
| `/case list [user] [type]` | List recent cases with optional filters |
| `/case reason <case_id> <reason>` | Update a case's reason |
| `/case delete <case_id>` | Delete a case |
| `/history <user>` | View full mod history for a user |

### Channel Control

| Command | Description |
|---------|-------------|
| `/lock [channel] [reason]` | Prevent @everyone from sending messages |
| `/unlock [channel] [reason]` | Restore send permissions |
| `/slowmode <duration> [channel]` | Set channel slowmode (0 to disable) |

### Mod Log Configuration

| Command | Description |
|---------|-------------|
| `/modlog setup` | Interactive channel routing with select menus |
| `/modlog view` | View current log routing config |
| `/modlog disable` | Disable all mod logging |

## 🌐 Web Dashboard

The `web/` directory contains a Next.js admin dashboard for managing Bill Bot through a browser.

### Features

- **Discord OAuth2 Login** — Sign in with your Discord account via NextAuth.js
- **Server Selector** — Choose from mutual guilds (servers where both you and the bot are present)
- **Token Refresh** — Automatic Discord token refresh with graceful error handling
- **Analytics Dashboard** — KPI cards, message/AI usage charts, channel activity filtering, and activity heatmaps
- **Responsive UI** — Mobile-friendly layout with sidebar navigation and dark mode support

### Setup

```bash
cd web
cp .env.example .env.local    # Fill in Discord OAuth2 credentials
pnpm install --legacy-peer-deps
pnpm dev                       # Starts on http://localhost:3000
```

> **Note:** `--legacy-peer-deps` is required due to NextAuth v4 + Next.js 16 peer dependency constraints.

### Discord OAuth2 Configuration

1. Go to your [Discord application](https://discord.com/developers/applications) → **OAuth2**
2. Add a redirect URL: `http://localhost:3000/api/auth/callback/discord` (adjust for production)
3. Copy the **Client ID** and **Client Secret** into your `.env.local`

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm test` | Run tests with Vitest |
| `pnpm typecheck` | Type-check with TypeScript compiler |

## 🛠️ Development

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm start` | Start the bot |
| `pnpm dev` | Start with auto-restart (watch mode) |
| `pnpm deploy` | Register slash commands with Discord |
| `pnpm lint` | Check code with Biome |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm format` | Format code with Biome |
| `pnpm test` | Run tests with Vitest |

### Adding a new command

1. Create `src/commands/yourcommand.js`
2. Export `data` (SlashCommandBuilder) and `execute(interaction)` function
3. Commands are auto-loaded on startup

### Adding a new module

1. Create `src/modules/yourmodule.js`
2. Wire it into `src/modules/events.js` event handlers
3. Use the Winston logger (`import { info, error } from '../logger.js'`)

## 🚄 Deployment

Bill Bot runs on [Railway](https://railway.app) as a multi-service project with three components:

| Service | Type | Config |
|---------|------|--------|
| **Bot** | Node.js (Dockerfile) | `railway.toml` |
| **Postgres** | Railway Plugin | Added via dashboard |
| **Web Dashboard** | Next.js (Dockerfile) | `web/railway.toml` |

> **Note:** The web dashboard is introduced in PR #60. The `web/` directory may not exist on `main` yet.

### Project Setup

1. Create a new project on [Railway](https://railway.app)
2. Connect your GitHub repo — Railway will detect `railway.toml` and create the **Bot** service automatically
3. Add a **Postgres** plugin from the Railway dashboard (New → Database → PostgreSQL)
4. Add the **Web Dashboard** as a second service pointing to the `web/` directory (New → GitHub Repo → select this repo, set root directory to `web/`)
5. Railway auto-deploys on push to `main`

### Database

Add the Railway Postgres plugin, then reference it in service variables using Railway's variable references:

```text
DATABASE_URL = ${{Postgres.DATABASE_URL}}
```

This injects the connection string at runtime for both the Bot and Web Dashboard services.

### Bot Service Environment Variables

Set these in the Railway dashboard for the Bot service:

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `DISCORD_CLIENT_ID` | Yes | Discord application/client ID |
| `GUILD_ID` | No | Guild ID for faster dev command deployment (omit for global) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude Agent SDK |
| `DATABASE_URL` | Yes | `${{Postgres.DATABASE_URL}}` — Railway variable reference |
| `MEM0_API_KEY` | No | Mem0 API key for long-term memory |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, or `error` (default: `info`) |
| `SESSION_SECRET` | Yes | JWT signing secret for OAuth2 sessions. Generate with `openssl rand -base64 32` |
| `DISCORD_CLIENT_SECRET` | Yes | Discord OAuth2 client secret (required for dashboard auth) |
| `DISCORD_REDIRECT_URI` | Yes | OAuth2 callback URL (e.g. `https://your-bot/api/v1/auth/discord/callback`) |
| `BOT_API_SECRET` | Yes | Shared secret for web dashboard API auth |

### Web Dashboard Environment Variables

Set these in the Railway dashboard for the Web Dashboard service:

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_CLIENT_ID` | Yes | Discord application/client ID (same as bot) |
| `DISCORD_CLIENT_SECRET` | Yes | Discord OAuth2 client secret |
| `NEXTAUTH_SECRET` | Yes | Random secret for NextAuth.js session encryption |
| `NEXTAUTH_URL` | Yes | Public URL — use `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
| `BOT_API_URL` | Yes | Bot internal URL (see private networking below) |
| `BOT_API_SECRET` | Yes | Shared secret (must match bot's `BOT_API_SECRET`) |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | Yes | Discord client ID (public, exposed to browser) |
| `DATABASE_URL` | Yes | `${{Postgres.DATABASE_URL}}` — Railway variable reference |
| `PORT` | No | Set to `3000` if not automatically detected |

### Private Networking

Railway services within the same project can communicate over a private internal network. The bot exposes a REST API server, and the Web Dashboard reaches it at:

```text
http://bot.railway.internal:<PORT>
```

> **Note:** The bot exposes a REST API server on `BOT_API_PORT` (default `3001`) alongside its Discord WebSocket connection. `BOT_API_URL` is used by the web dashboard to query bot state.

### Slash Command Registration

After your first deploy, register slash commands with Discord by running:

```bash
railway run node src/deploy-commands.js
```

Or execute it from the Railway service shell. This only needs to be done once (and again if you add new commands).

## 🐳 Local Development with Docker

Run the entire stack locally with a single command using Docker Compose.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (v2+)

### Quick Start

```bash
# 1. Copy the env template and fill in your values
cp .env.example .env

# 2. Start the bot + database
docker compose up

# Or run detached (background)
docker compose up -d
```

The bot connects to Discord via the token in your `.env` file. PostgreSQL is available at `localhost:5432`.

### Full Stack (with Web Dashboard)

The web dashboard requires `web/Dockerfile` from PR #60. Once merged, start all services:

```bash
# Start bot + db + web dashboard
docker compose --profile full up
```

The web dashboard will be available at `http://localhost:3000`.

### Managing the Stack

```bash
# View logs
docker compose logs -f bot        # bot logs only
docker compose logs -f db         # database logs only

# Stop all services
docker compose down

# Stop and remove database volume (fresh start)
docker compose down -v

# Rebuild after code changes
docker compose up --build
```

### Service Details

| Service | URL | Description |
|---------|-----|-------------|
| **bot** | `localhost:3001` | Discord bot with REST API server (`BOT_API_PORT`) |
| **db** | `localhost:5432` | PostgreSQL 17, user: `postgres`, password: `postgres`, database: `billsbot` |
| **web** | `localhost:3000` | Next.js web dashboard (requires `--profile full`) |

### Notes

- The `DATABASE_URL` is automatically overridden in `docker-compose.yml` to point to the `db` service — no manual DB config needed.
- The web service uses the `full` profile so `docker compose up` starts only the bot + database by default.
- Data is persisted in a Docker volume (`pgdata`). Use `docker compose down -v` to reset.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

[MIT](LICENSE) — Made with 💚 by [Volvox](https://volvox.dev)
