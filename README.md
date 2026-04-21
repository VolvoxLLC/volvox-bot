# 🤖 Volvox.Bot

[![CI](https://github.com/VolvoxLLC/volvox-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/VolvoxLLC/volvox-bot/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/VolvoxLLC/volvox-bot/badge.svg?branch=main)](https://coveralls.io/github/VolvoxLLC/volvox-bot?branch=main)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10.33+-orange.svg)](https://pnpm.io)

AI-powered Discord bot for the [Volvox](https://volvox.dev) developer community — a pnpm monorepo containing the bot (Node.js, ESM JavaScript, discord.js v14) and a web dashboard (Next.js 16, TypeScript, React 19). Routes to any Anthropic-shape provider declared in `src/data/providers.json` — ships with MiniMax, Moonshot (Kimi), and OpenRouter.

---

## ⚡ Quick Start

### Docker Compose (recommended)

```bash
git clone https://github.com/VolvoxLLC/volvox-bot.git
cd volvox-bot
cp .env.example .env
# Edit .env — fill in DISCORD_TOKEN, MINIMAX_API_KEY, and DISCORD_CLIENT_ID at minimum
docker compose up --build
```

| Service | URL |
|---------|-----|
| Bot API | `http://localhost:6968` |
| Web Dashboard | `http://localhost:6969` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

### Local development (without Docker)

Requires PostgreSQL 17+ and (optionally) Redis 7+ running on your machine.

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

---

## ✨ Features

### AI & Chat

- **🧠 AI Chat** — Mention the bot to chat with the configured AI provider. Per-channel conversation history with context management.
- **🎯 Smart Triage** — Two-step evaluation (fast classifier + responder) for chime-ins and rule enforcement.
- **🤖 AI Auto-Moderation** — Automated toxicity, spam, and harassment detection with configurable thresholds.
- **👍👎 AI Feedback** — Thumbs up/down reactions on AI responses, tracked in dashboard analytics.
- **🧠 User Memory** — Long-term memory per user via [mem0](https://mem0.ai) for personalized interactions.

### Community & Engagement

- **👋 Dynamic Welcome Messages** — Template-based onboarding with DM sequences and role menus.
- **🎭 Reaction Roles** — Role menus with custom/Unicode emoji support.
- **📊 Reputation / XP System** — Engagement tracking with configurable levels and role rewards.
- **⭐ Starboard** — Highlight popular messages with star reactions.
- **🎤 Voice Activity Tracking** — Voice channel metrics and leaderboards.
- **🏆 Challenges** — Daily coding challenges with submissions and leaderboards.
- **🎫 Tickets** — Support ticket system with threads.
- **💬 Polls · ✂️ Snippets · ⏰ Reminders · 💤 AFK · 📌 Showcase · 👀 Code Review**

### Moderation

- **⚔️ Full Suite** — warn, kick, ban, tempban, softban, timeout, purge, lock/unlock, slowmode.
- **🛡️ Protected Roles** — Admins/mods protected from moderation actions.
- **📋 Case Management** — Moderation history with warn editing, removal, and escalation.
- **📝 Scheduled Announcements** — One-time or recurring messages.

### Dashboard & Infrastructure

- **🌐 Web Dashboard** — Next.js admin panel with Discord OAuth2, dark/light themes, mobile support.
- **📊 Analytics** — Message activity, command usage, voice time, AI feedback with PDF export.
- **📜 Audit Log** — Complete action history with filtering, export, and WebSocket streaming.
- **⚡ Redis Caching** — Distributed caching with graceful in-memory fallback.
- **⚙️ Runtime Config** — All settings editable via `/config` command or dashboard. Stored in PostgreSQL with live reload.
- **💾 Backup & Restore** — Export/import config with automatic scheduled backups.

---

## 🔑 Environment Variables

Copy [`.env.example`](.env.example) to `.env` — it contains full documentation for every variable.

**Required:** `DISCORD_TOKEN`, `MINIMAX_API_KEY`, `DATABASE_URL`, `DISCORD_CLIENT_ID`

**Optional:** `MOONSHOT_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` (reserved — see [#553](https://github.com/VolvoxLLC/volvox-bot/issues/553)), `REDIS_URL`, `SENTRY_DSN`, `BOT_API_SECRET`, `LOG_LEVEL`, and more — see the file.

> Provider metadata (base URLs, env keys, pricing) lives in [`src/data/providers.json`](src/data/providers.json). Add a provider by declaring it there and setting `<PROVIDER>_API_KEY` in `.env`.

---

## 🛠️ Development

```bash
pnpm test              # Run bot tests
pnpm test:coverage     # With 85% coverage enforcement
pnpm lint              # Biome lint + format check
pnpm lint:fix          # Auto-fix
pnpm mono:dev          # Dev mode (all workspaces)
pnpm mono:build        # Build all workspaces
pnpm mono:typecheck    # Typecheck all workspaces
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for workflow, conventions, and PR process. See [`AGENTS.md`](AGENTS.md) for codebase rules. See [`DESIGN.md`](DESIGN.md) for the dashboard design system.

---

## 📄 License

MIT — see [LICENSE](LICENSE).

Built with ❤️ by the [Volvox](https://volvox.dev) team.
