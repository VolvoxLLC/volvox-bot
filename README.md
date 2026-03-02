# 🤖 Volvox Bot

[![CI](https://github.com/VolvoxLLC/volvox-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/VolvoxLLC/volvox-bot/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/VolvoxLLC/volvox-bot/badge.svg?branch=main)](https://coveralls.io/github/VolvoxLLC/volvox-bot?branch=main)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org)

AI-powered Discord bot for the [Volvox](https://volvox.dev) developer community. Built with discord.js v14 and powered by Claude.

## ✨ Features

### AI & Chat
- **🧠 AI Chat** — Mention the bot to chat with Claude. Maintains per-channel conversation history with intelligent context management.
- **🎯 Smart Triage** — Two-step evaluation (fast classifier + responder) that drives chime-ins and community rule enforcement.
- **🤖 AI Auto-Moderation** — Intelligent automated moderation powered by Claude. Analyzes messages for toxicity, spam, and harassment with configurable thresholds and actions.
- **👍👎 AI Feedback** — Users can rate AI responses with thumbs up/down reactions. Feedback tracked in dashboard analytics.
- **🚫 AI Channel Blocklist** — Configure channels the bot ignores for AI responses. Supports thread inheritance.

### Community & Engagement
- **👋 Dynamic Welcome Messages** — Contextual onboarding with template variables (`{user}`, `{server}`, `{memberCount}`), multiple variants, and per-channel configs.
- **🎭 Reaction Roles** — Role menus where users get roles by reacting. Custom/Unicode emoji support, built-in templates.
- **⏰ Temporary Roles** — Assign roles that auto-expire after a duration.
- **🎤 Voice Activity Tracking** — Track voice channel activity for insights and leaderboards.
- **⭐ Starboard** — Highlight popular messages with star reactions.
- **📊 Reputation/XP System** — Track engagement and award XP/levels.
- **💤 AFK System** — Set AFK status; bot notifies mentioners and DMs ping summaries on return.

### Moderation
- **⚔️ Moderation Suite** — Full toolkit: warn, kick, ban, tempban, softban, timeout, purge, lock/unlock, slowmode.
- **🛡️ Protected Roles** — Admins/mods protected from moderation actions.
- **📋 Bulk Actions** — Perform actions on multiple users at once.
- **🔇 Channel Quiet Mode** — Temporarily silence the bot via `@bot quiet`.
- **📝 Scheduled Announcements** — Schedule one-time or recurring messages.

### Configuration & Management
- **⚙️ Runtime Config** — All settings in PostgreSQL with live `/config` command and web dashboard.
- **💾 Backup & Restore** — Export/import config with automatic scheduled backups.
- **🔄 Command Aliases** — Custom shortcuts for commands (e.g., `/w` → `/warn`).
- **📈 Performance Monitoring** — Real-time memory, CPU, response time tracking with alerting.
- **📡 Webhook Notifications** — Outbound webhooks for bot events (mod actions, errors, config changes).

### Dashboard & Analytics
- **🌐 Web Dashboard** — Next.js admin panel with Discord OAuth2, dark/light themes, mobile support.
- **📊 Analytics** — Message activity, command usage, voice time, AI feedback, engagement metrics with PDF export.
- **📜 Audit Log** — Complete action history with filtering, CSV/JSON export, WebSocket streaming.
- **🔍 Conversation Viewer** — Browse AI conversation history with search and filtering.

### Infrastructure
- **⚡ Redis Caching** — Distributed caching for config, Discord API, reputation, rate limiting.
- **🔒 Security** — HMAC webhooks, prototype pollution protection, input validation, secrets management.
- **📊 Health Monitoring** — Built-in health checks and status reporting.

## 🏗️ Architecture

```text
Discord User
     │
     ▼
┌─────────────┐     ┌──────────────┐
│  Volvox Bot  │────▶│   Claude API │
│  (Node.js)  │◀────│   (Anthropic)│
└──────┬──────┘     └──────────────┘
       │
       ├──────────────┬──────────────┐
       ▼              ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐
│  PostgreSQL  │ │  Redis   │ │  Web     │
│  (Config +   │ │  (Cache  │ │  Dashboard│
│   State)     │ │   + RL)  │ │           │
└──────────────┘ └──────────┘ └──────────┘
```

## 📋 Prerequisites

- [Node.js](https://nodejs.org) 22+
- [pnpm](https://pnpm.io) (`npm install -g pnpm`)
- [PostgreSQL](https://www.postgresql.org/) 17+
- [Redis](https://redis.io/) 7+ (recommended)
- [Anthropic API key](https://console.anthropic.com)
- [Discord application](https://discord.com/developers/applications) with bot token

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

### 3. Configure the bot

Edit `config.json` to match your Discord server.

### 4. Set up Discord bot

1. Create app at [discord.com/developers/applications](https://discord.com/developers/applications)
2. **Bot** → Add Bot → Copy token → `DISCORD_TOKEN`
3. Enable **Privileged Gateway Intents**:
   - ✅ Message Content Intent
   - ✅ Server Members Intent
   - ✅ Guild Voice States Intent
   - ✅ Guild Message Reactions Intent
4. **OAuth2** → URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Permissions: View Channels, Send Messages, Read Message History, Manage Messages, Add Reactions, Manage Roles
5. Invite bot to server

### 5. Run

```bash
pnpm start
```

## 🔑 Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Discord bot token |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `DATABASE_URL` | PostgreSQL connection string |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string (recommended) | — |
| `GUILD_ID` | Guild ID for dev command deployment | — |
| `BOT_API_SECRET` | Secret for web dashboard API | — |
| `WEBHOOK_SECRET` | Secret for webhook HMAC signing | `SESSION_SECRET` |
| `SENTRY_DSN` | Sentry error tracking DSN | — |
| `LOG_LEVEL` | Logging level | `info` |

### Web Dashboard

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_URL` | Dashboard canonical URL |
| `NEXTAUTH_SECRET` | JWT encryption secret |
| `DISCORD_CLIENT_ID` | Discord OAuth2 client ID (required for `pnpm deploy`) |
| `DISCORD_CLIENT_SECRET` | Discord OAuth2 client secret |

## ⚙️ Configuration

All configuration in `config.json`, editable via `/config` command or web dashboard.

### Key Sections

- **`ai`** — AI chat, feedback, channel blocklist
- **`aiAutoMod`** — Auto-moderation thresholds and actions
- **`triage`** — Message triage and daily budget
- **`welcome`** — Welcome messages with templates
- **`moderation`** — Mod features and protected roles
- **`backup`** — Auto-backup schedule and retention
- **`performance`** — Monitoring and alert thresholds

See `config.json` for complete options.

## 🧪 Testing

```bash
pnpm test              # Run tests
pnpm test:coverage     # With coverage (80% threshold)
pnpm lint              # Lint check
```

## 📚 Documentation

- **Dashboard Guide** — Coming soon
- **Backup Guide** — Coming soon
- **Troubleshooting** — Coming soon
- **API Reference** — Coming soon

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and conventions.

## 📄 License

MIT License — see [LICENSE](LICENSE).

---

Built with ❤️ by the Volvox team.
