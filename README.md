# 🤖 Volvox.Bot

[![CI](https://github.com/VolvoxLLC/volvox-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/VolvoxLLC/volvox-bot/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/VolvoxLLC/volvox-bot/badge.svg?branch=main)](https://coveralls.io/github/VolvoxLLC/volvox-bot?branch=main)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org)

AI-powered Discord bot and dashboard — built by the [Volvox](https://volvox.bot) team. Add Volvox.Bot to your server and get moderation, engagement tools, AI chat, and a full-featured web dashboard, all hosted for you.

**[Get started at volvox.bot](https://volvox.bot)** → [Add to Discord](https://volvox.bot)

---

## ✨ Features

### AI & Chat

- **🧠 AI Chat** — Mention the bot to chat with Claude. Per-channel conversation history with context management.
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

## 🏗️ Built With

- **Bot:** Node.js 22+, discord.js v14, PostgreSQL, Redis
- **Dashboard:** Next.js 16, React 19, TypeScript
- **AI:** Claude (Anthropic), mem0 for user memory
- **Code Style:** [Biome](https://biomejs.dev/)

---

## 📄 License

MIT — see [LICENSE](LICENSE).

Built with ❤️ by the [Volvox](https://volvox.bot) team.
