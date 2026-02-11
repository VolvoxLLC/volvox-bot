# 🤖 Bill Bot — Volvox Discord Bot

[![CI](https://github.com/BillChirico/bills-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/BillChirico/bills-bot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org)

AI-powered Discord bot for the [Volvox](https://volvox.dev) developer community. Built with discord.js v14 and powered by Claude via [OpenClaw](https://openclaw.com).

## ✨ Features

- **🧠 AI Chat** — Mention the bot to chat with Claude. Maintains per-channel conversation history with intelligent context management.
- **🎯 Chime-In** — Bot can organically join conversations when it has something relevant to add (configurable per-channel).
- **👋 Dynamic Welcome Messages** — Contextual onboarding with time-of-day greetings, community activity snapshots, member milestones, and highlight channels.
- **🛡️ Spam Detection** — Pattern-based scam/spam detection with mod alerts and optional auto-delete.
- **⚙️ Config Management** — All settings stored in PostgreSQL with live `/config` slash command for runtime changes.
- **📊 Health Monitoring** — Built-in health checks and `/status` command for uptime, memory, and latency stats.
- **🎤 Voice Activity Tracking** — Tracks voice channel activity for community insights.

## 🏗️ Architecture

```text
Discord User
     │
     ▼
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│  Bill Bot    │────▶│  OpenClaw    │────▶│  Claude  │
│  (Node.js)  │◀────│  Gateway    │◀────│  (AI)    │
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
- [OpenClaw](https://openclaw.com) gateway (for AI chat features)
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
| `OPENCLAW_API_URL` | ✅ | OpenClaw chat completions endpoint |
| `OPENCLAW_API_KEY` | ✅ | OpenClaw gateway authentication token |
| `DATABASE_URL` | ✅** | PostgreSQL connection string for persistent config/state |
| `LOG_LEVEL` | ❌ | Logging level: `debug`, `info`, `warn`, `error` (default: `info`) |

\* Legacy alias supported: `CLIENT_ID`  
\** Bot can run without DB, but persistent config is strongly recommended in production.

Legacy OpenClaw aliases are also supported for backwards compatibility: `OPENCLAW_URL`, `OPENCLAW_TOKEN`.

## ⚙️ Configuration

All configuration lives in `config.json` and can be updated at runtime via the `/config` slash command. When `DATABASE_URL` is set, config is persisted to PostgreSQL.

### AI Chat (`ai`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable/disable AI responses |
| `model` | string | Claude model to use (e.g. `claude-sonnet-4-20250514`) |
| `maxTokens` | number | Max tokens per AI response |
| `systemPrompt` | string | System prompt defining bot personality |
| `channels` | string[] | Channel IDs to respond in (empty = all channels) |

### Chime-In (`chimeIn`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable organic conversation joining |
| `evaluateEvery` | number | Evaluate every N messages |
| `model` | string | Model for evaluation (e.g. `claude-haiku-4-5`) |
| `channels` | string[] | Channels to monitor (empty = all) |
| `excludeChannels` | string[] | Channels to never chime into |

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
| `enabled` | boolean | Enable spam detection |
| `alertChannelId` | string | Channel for mod alerts |
| `autoDelete` | boolean | Auto-delete detected spam |

### Permissions (`permissions`)

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable permission checks |
| `adminRoleId` | string | Role ID for admin commands |
| `allowedCommands` | object | Per-command permission levels |

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

Bill Bot is deployed on [Railway](https://railway.app).

1. Connect your GitHub repo to Railway
2. Set all environment variables in Railway dashboard
3. Railway auto-deploys on push to `main`

The bot uses the `start` script (`node src/index.js`) for production.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

[MIT](LICENSE) — Made with 💚 by [Volvox](https://volvox.dev)
