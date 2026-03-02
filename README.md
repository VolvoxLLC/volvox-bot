# 🤖 Volvox Bot

[![CI](https://github.com/VolvoxLLC/volvox-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/VolvoxLLC/volvox-bot/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/VolvoxLLC/volvox-bot/badge.svg?branch=main)](https://coveralls.io/github/VolvoxLLC/volvox-bot?branch=main)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org)

AI-powered Discord bot for the [Volvox](https://volvox.dev) developer community. Built with discord.js v14 and powered by Claude via the Anthropic API.

## ✨ Features

- **🧠 AI Chat** — Mention the bot to chat with Claude. Maintains per-channel conversation history with intelligent context management. Block specific channels with `ai.blockedChannelIds`.
- **👍 AI Feedback** — Users can react with 👍/👎 to AI responses. Feedback is stored and surfaced via the dashboard and API. Enable with `ai.feedback.enabled`.
- **🎯 Smart Triage** — Two-step evaluation (fast classifier + responder) that drives chime-ins and community rule enforcement.
- **👋 Dynamic Welcome Messages** — Contextual onboarding with time-of-day greetings, community activity snapshots, member milestones, and highlight channels.
- **🛡️ Spam Detection** — Pattern-based scam/spam detection with mod alerts and optional auto-delete. Includes phishing domain blocklist and link filtering.
- **⚔️ Moderation Suite** — Full-featured mod toolkit: warn, kick, ban, tempban, softban, timeout, purge, lock/unlock, slowmode. Includes case management, mod log routing, DM notifications, auto-escalation, and tempban scheduling. Admins, mods, and the server owner are protected from accidental moderation actions.
- **⚙️ Config Management** — All settings stored in PostgreSQL with live `/config` slash command for runtime changes.
- **💾 Config Backup & Restore** — Export, import, and manage server configuration snapshots via API. Sensitive fields are automatically redacted on export.
- **📊 Health Monitoring** — Built-in health checks and `/status` command for uptime, memory, and latency stats.
- **💤 AFK System** — Members can set an AFK status with `/afk set [reason]`; the bot notifies mentioners inline and DMs a ping summary on return.
- **⭐ Starboard** — Automatically reposts popular messages to a designated channel when they hit a reaction threshold.
- **🏆 Reputation & XP** — Tracks user engagement with XP rewards, levels, and optional role rewards on level-up.
- **📣 Announcements** — Schedule and post guild announcements with cron-based scheduling.
- **🎟️ Tickets** — Support ticket system with thread-based conversations.
- **🎤 Voice Activity Tracking** — Tracks voice channel activity for community insights.
- **🌐 Web Dashboard** — Next.js-based admin dashboard with Discord OAuth2 login, dark mode, server selector, role/channel pickers, and full guild management UI.
- **🔴 Redis Caching** — Optional Redis integration for session caching and distributed features. Gracefully degrades when `REDIS_URL` is not set.
- **📋 Audit Log** — Tracks all mutating API actions (config changes, moderations, etc.) with configurable retention.

## 🏗️ Architecture

```text
Discord User
     │
     ▼
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│  Volvox Bot  │────▶│  Anthropic   │────▶│  Claude  │
│  (Node.js)  │◀────│     API      │◀────│  (AI)    │
└──────┬──────┘     └──────────────┘     └─────────┘
       │
       ├──────────────────────┐
       ▼                      ▼
┌──────────────┐      ┌──────────────┐
│  PostgreSQL  │      │    Redis     │
│  (primary)   │      │  (optional)  │
└──────────────┘      └──────────────┘
       │
       ▼
┌──────────────┐
│  REST API    │  Powers the web dashboard
│  (Express)   │
└──────────────┘
       │
       ▼
┌──────────────┐
│  Next.js     │  Admin dashboard (web/)
│  Dashboard   │
└──────────────┘
```

## 📋 Prerequisites

- [Node.js](https://nodejs.org) 22+
- [pnpm](https://pnpm.io) (`npm install -g pnpm`)
- [PostgreSQL](https://www.postgresql.org/) database
- An [Anthropic API key](https://console.anthropic.com) (for AI chat features)
- A [Discord application](https://discord.com/developers/applications) with bot token
- _(Optional)_ [Redis](https://redis.io) for session caching

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

Edit `.env` with your values (see [Environment Variables](#-environment-variables) below).

### 3. Configure the bot

Edit `config.json` to match your Discord server (see [Configuration](#️-configuration) below).

### 4. Set up Discord bot

1. Create an app at [discord.com/developers/applications](https://discord.com/developers/applications)
2. **Bot** → Add Bot → Copy token → paste as `DISCORD_TOKEN`
3. Enable **Privileged Gateway Intents**:
   - ✅ Message Content Intent
   - ✅ Server Members Intent
   - ✅ Guild Members Intent (required for welcome and role rewards)
4. **OAuth2** → URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Permissions: View Channels, Send Messages, Read Message History, Manage Messages, Add Reactions, Manage Roles
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
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key for Claude AI |
| `CLAUDE_CODE_OAUTH_TOKEN` | ❌ | Required when using OAuth access tokens (`sk-ant-oat01-*`). Leave `ANTHROPIC_API_KEY` blank when using this. |
| `DATABASE_URL` | ✅** | PostgreSQL connection string for persistent config/state |
| `REDIS_URL` | ❌ | Redis connection string (e.g. `redis://localhost:6379`). Enables session caching. Bot runs fine without it. |
| `MEM0_API_KEY` | ❌ | Mem0 API key for long-term memory |
| `BOT_API_SECRET` | ✅*** | Shared secret for web dashboard API authentication |
| `BOT_API_PORT` | ❌ | Port for the bot's REST API server (default: `3001`) |
| `LOG_LEVEL` | ❌ | Logging level: `debug`, `info`, `warn`, `error` (default: `info`) |
| `SENTRY_DSN` | ❌ | Sentry DSN for error monitoring |

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

All configuration lives in `config.json` and can be updated at runtime via the `/config` slash command or the web dashboard. When `DATABASE_URL` is set, config is persisted to PostgreSQL.

### AI Chat (`ai`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable/disable AI responses |
| `systemPrompt` | string | System prompt defining bot personality |
| `channels` | string[] | Channel IDs to respond in (empty = all channels) |
| `blockedChannelIds` | string[] | Channel IDs where AI will **never** respond, regardless of other settings |
| `historyLength` | number | Max conversation history entries per channel (default: 20) |
| `historyTTLDays` | number | Days before old history is cleaned up (default: 30) |
| `threadMode.enabled` | boolean | Enable threaded responses (default: false) |
| `threadMode.autoArchiveMinutes` | number | Thread auto-archive timeout (default: 60) |
| `threadMode.reuseWindowMinutes` | number | Window for reusing existing threads (default: 30) |
| `feedback.enabled` | boolean | Enable 👍/👎 reaction feedback on AI responses (default: false) |

### Triage (`triage`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable triage-based message evaluation |
| `defaultInterval` | number | Base evaluation interval in ms (default: 5000) |
| `maxBufferSize` | number | Max messages per channel buffer (default: 30) |
| `triggerWords` | string[] | Words that force instant evaluation (default: `["volvox"]`) |
| `moderationKeywords` | string[] | Words that flag for moderation |
| `classifyModel` | string | Model for classification step (default: `claude-haiku-4-5`) |
| `respondModel` | string | Model for response step (default: `claude-sonnet-4-6`) |
| `classifyBudget` | number | Max USD per classify call (default: 0.05) |
| `respondBudget` | number | Max USD per respond call (default: 0.20) |
| `thinkingTokens` | number | Thinking token budget for responder (default: 4096) |
| `contextMessages` | number | Channel history messages fetched for context (default: 10) |
| `streaming` | boolean | Enable streaming responses (default: false) |
| `tokenRecycleLimit` | number | Token threshold before recycling CLI process (default: 20000) |
| `timeout` | number | Evaluation timeout in ms (default: 30000) |
| `classifyBaseUrl` | string | Custom API base URL for classifier (default: null) |
| `respondBaseUrl` | string | Custom API base URL for responder (default: null) |
| `classifyApiKey` | string | Custom API key for classifier (default: null) |
| `respondApiKey` | string | Custom API key for responder (default: null) |
| `moderationResponse` | boolean | Send moderation nudge messages (default: true) |
| `channels` | string[] | Channels to monitor (empty = all) |
| `excludeChannels` | string[] | Channels to never triage |
| `debugFooter` | boolean | Show debug stats footer on AI responses (default: false) |
| `debugFooterLevel` | string | Footer density: `"verbose"`, `"compact"`, or `"split"` (default: `"verbose"`) |

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
| `protectRoles.enabled` | boolean | Enable role protection (prevents moderating admins/mods/owner) |
| `protectRoles.includeServerOwner` | boolean | Include server owner in protection (default: true) |
| `protectRoles.includeAdmins` | boolean | Include admin role in protection (default: true) |
| `protectRoles.includeModerators` | boolean | Include moderator role in protection (default: true) |
| `protectRoles.roleIds` | string[] | Additional role IDs to protect from moderation |

**Escalation thresholds** are objects with: `warns` (count), `withinDays` (window), `action` ("timeout" or "ban"), `duration` (for timeout, e.g. "1h").

### Audit Log (`auditLog`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable/disable audit logging for mutating authenticated API requests |
| `retentionDays` | number | Data retention window in days for scheduled cleanup (default: 90, `<= 0` disables purge) |

### Starboard (`starboard`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable the starboard feature |
| `channelId` | string | Channel ID where starred messages are reposted |
| `threshold` | number | Reaction count required to star a message (default: 3) |
| `emoji` | string | Emoji to watch for stars (default: `⭐`) |
| `selfStarAllowed` | boolean | Allow users to star their own messages |
| `ignoredChannels` | string[] | Channel IDs excluded from starboard tracking |

### Reputation (`reputation`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable the XP / leveling system |
| `xpPerMessage` | [number, number] | Random XP range awarded per message `[min, max]` (default: `[5, 15]`) |
| `xpCooldownSeconds` | number | Minimum seconds between XP awards per user (default: `60`) |
| `announceChannelId` | string\|null | Channel ID for level-up announcements (null = DM user) |
| `levelThresholds` | number[] | Cumulative XP required for each level (L1, L2, …). Must be strictly ascending. (default: `[100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000]`) |
| `roleRewards` | object | Map of level number → role ID to auto-assign on level-up (e.g. `{ "5": "123456789" }`) |

**Commands:** `/rank [user]` — show XP, level, and progress bar. `/leaderboard` — top 10 users by XP.

### Permissions (`permissions`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable permission checks |
| `adminRoleId` | string | Role ID for admin commands |
| `moderatorRoleId` | string | Role ID for moderator commands |
| `modRoles` | string[] | Additional role IDs or names that count as moderators (legacy/`modExempt` checks) |
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

> **Note:** Server owner, admins, and moderators are protected from these actions by default. See `moderation.protectRoles` to configure.

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

The `web/` directory contains a Next.js admin dashboard for managing Volvox Bot through a browser.

### Features

- **Discord OAuth2 Login** — Sign in with your Discord account via NextAuth.js
- **Dark Mode** — Full dark/light theme support with system preference detection
- **Server Selector** — Choose from mutual guilds (servers where both you and the bot are present)
- **Token Refresh** — Automatic Discord token refresh with graceful error handling
- **Config Editor** — Live configuration editing with role and channel pickers (dropdowns sourced from Discord)
- **Analytics Dashboard** — KPI cards, message/AI usage charts, channel activity filtering, and activity heatmaps
- **Moderation Panel** — View and manage mod cases, warnings, bans directly from the browser
- **AI Conversations Viewer** — Browse, search, and flag AI conversation history
- **Members Management** — View member list, XP, and mod history
- **Audit Log** — View history of all configuration and moderation changes made via the API
- **Tickets** — Manage support tickets
- **Responsive UI** — Mobile-friendly layout with sidebar navigation

### Dashboard Usage Guide

#### Getting Started

1. Navigate to the dashboard URL (default: `http://localhost:3000`)
2. Click **Sign in with Discord** and authorize the OAuth2 app
3. Select your server from the server picker
4. You'll land on the **Overview** page with KPI cards and activity charts

#### Config Editor

- Navigate to **Config** in the sidebar
- Each section (AI, Triage, Moderation, etc.) has its own tab
- Role and channel fields use Discord-synced dropdown selectors — no manual ID copy-paste required
- Changes take effect immediately and are persisted to the database

#### Analytics

The analytics dashboard shows:
- **Message volume** — Total messages over time, filterable by channel
- **AI usage** — Response counts, token usage, and model breakdown
- **Activity heatmap** — Hour/day activity grid showing peak times
- **KPI cards** — Member count, active users, messages today

#### AI Feedback

When `ai.feedback.enabled` is `true`, users can react with 👍 or 👎 to AI responses. The dashboard surfaces this data under the AI section:
- **Aggregate stats** — Total positive/negative counts and approval ratio
- **Daily trend** — Chart showing feedback sentiment over time
- **Recent feedback** — List of recent reactions with message context

#### Audit Log

The audit log records all mutating API actions (config edits, member kicks, etc.). Access via **Audit Log** in the sidebar:
- Filter by action type, user, or date range
- Retention is configured via `auditLog.retentionDays` (default: 90 days)

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

### Dashboard Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm test` | Run tests with Vitest |
| `pnpm typecheck` | Type-check with TypeScript compiler |

## 💾 Config Backup & Restore

Volvox Bot includes a backup system for exporting and restoring server configuration. Useful for:
- Migrating configuration between environments (dev → prod)
- Versioned snapshots before major config changes
- Disaster recovery

### How It Works

- Backups are stored as JSON files in `data/backups/`
- Sensitive fields (API keys, tokens) are **automatically redacted** on export — they appear as `[REDACTED]` and must be re-entered after restore
- Backup files include a timestamp and sequential counter for uniqueness

### Backup API Endpoints

All backup endpoints require **bot owner** authentication (API secret or bot-owner OAuth).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/backups/export` | GET | Download current config as JSON |
| `/api/v1/backups/import` | POST | Import and validate a config JSON |
| `/api/v1/backups` | POST | Create a named backup snapshot |
| `/api/v1/backups` | GET | List all available backups |
| `/api/v1/backups/:filename` | GET | Read a specific backup file |
| `/api/v1/backups/:filename/restore` | POST | Restore config from a backup |
| `/api/v1/backups/:filename` | DELETE | Delete a specific backup |
| `/api/v1/backups/prune` | POST | Prune old backups by retention policy |

**Export current config:**

```bash
curl -H "x-api-secret: YOUR_SECRET" \
  https://your-domain.com/api/v1/backups/export \
  -o config-backup.json
```

**Restore from file:**

```bash
curl -X POST \
  -H "x-api-secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d @config-backup.json \
  https://your-domain.com/api/v1/backups/import
```

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

### Full Stack (with Web Dashboard)

```bash
# Start bot + db + web dashboard
docker compose --profile full up
```

The web dashboard will be available at `http://localhost:3000`.

### Managing the Stack

```bash
docker compose logs -f bot        # bot logs only
docker compose logs -f db         # database logs only
docker compose down               # stop all services
docker compose down -v            # stop and wipe database
docker compose up --build         # rebuild after code changes
```

### Service Details

| Service | URL | Description |
|---------|-----|-------------|
| **bot** | `localhost:3001` | Discord bot with REST API server (`BOT_API_PORT`) |
| **db** | `localhost:5432` | PostgreSQL 17, user: `postgres`, password: `postgres`, database: `billsbot` |
| **web** | `localhost:3000` | Next.js web dashboard (requires `--profile full`) |

> The `DATABASE_URL` is automatically overridden in `docker-compose.yml` to point to the `db` service. Data is persisted in a Docker volume (`pgdata`). Use `docker compose down -v` to reset.

## 🔧 Troubleshooting

### Bot doesn't respond to messages

1. **Check intents** — Ensure `Message Content Intent` and `Server Members Intent` are enabled in the Discord Developer Portal
2. **Check `ai.channels`** — If non-empty, the bot only responds in listed channel IDs. Also check `ai.blockedChannelIds` isn't blocking the channel.
3. **Check `ai.enabled`** — Must be `true` in config
4. **Check API key** — Verify `ANTHROPIC_API_KEY` is set and valid

### Slash commands not appearing

1. Run `pnpm deploy` to register commands with Discord
2. For guild-specific deployment, ensure `GUILD_ID` is set in `.env`
3. Global commands can take up to 1 hour to propagate

### Database connection errors

1. Verify `DATABASE_URL` is set and accessible
2. Run migrations: the bot runs them automatically on startup via `initDb()`
3. Check PostgreSQL is running: `docker compose ps` (if using Docker)

### Redis connection warnings

If you see `Redis not configured` in logs, that's expected when `REDIS_URL` is not set — the bot runs fine without Redis. To enable caching, set `REDIS_URL=redis://localhost:6379` in `.env`.

### Dashboard can't see my server

1. Ensure the bot is in the server (check `BOT_API_URL` and `BOT_API_SECRET` env vars in the web dashboard `.env.local`)
2. The dashboard filters to mutual guilds — the bot and the logged-in user must both be in the server
3. Verify the bot's REST API is running on `BOT_API_PORT` (default 3001)

### Config changes not saving

1. Check `DATABASE_URL` is set — without it, config changes are in-memory only and lost on restart
2. Verify the config key is in `SAFE_CONFIG_KEYS` (`src/api/utils/configAllowlist.js`) — new config sections must be added here to be writable via the API
3. Check the audit log for rejected requests

### AI feedback not working

1. Set `ai.feedback.enabled: true` in config (disabled by default)
2. Ensure the bot has **Add Reactions** permission in the relevant channels
3. The bot tracks the last 2000 AI message IDs in memory — feedback only registers on recent messages

### Moderation commands failing silently

1. Check `moderation.protectRoles.enabled` — if the target user is an admin/mod/server owner, moderation actions are blocked by design
2. Check bot role hierarchy — the bot's role must be above the target user's highest role
3. Verify the executing user has the required permission level (`permissions.adminRoleId`)

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

[MIT](LICENSE)

— Made with 💚 by [Volvox](https://volvox.dev)
