# AGENTS.md — AI Coding Agent Guide

> This file provides context for AI coding agents (Claude Code, Copilot, Cursor, etc.) working on bills-bot.

## Project Overview

**Bill Bot** is a Discord bot for the Volvox developer community. It provides AI chat (via OpenClaw/Claude), dynamic welcome messages, spam detection, and runtime configuration management backed by PostgreSQL.

## Stack

- **Runtime:** Node.js 22 (ESM modules, `"type": "module"`)
- **Framework:** discord.js v14
- **Database:** PostgreSQL (via `pg` — raw SQL, no ORM)
- **Logging:** Winston with daily file rotation
- **AI:** Claude via OpenClaw chat completions API
- **Linting:** Biome
- **Testing:** Vitest
- **Hosting:** Railway

## Key Files

| File | Purpose |
|------|---------|
| `src/index.js` | Entry point — client setup, command loading, startup sequence |
| `src/db.js` | PostgreSQL pool management (init, query, close) |
| `src/logger.js` | Winston logger setup with file + console transports |
| `src/commands/*.js` | Slash commands (auto-loaded) |
| `src/modules/ai.js` | AI chat handler — conversation history, OpenClaw API calls |
| `src/modules/chimeIn.js` | Organic conversation joining logic |
| `src/modules/welcome.js` | Dynamic welcome message generation |
| `src/modules/spam.js` | Spam/scam pattern detection |
| `src/modules/moderation.js` | Moderation — case creation, DM notifications, mod log embeds, escalation, tempban scheduler |
| `src/modules/config.js` | Config loading/saving (DB + file), runtime updates |
| `src/modules/events.js` | Event handler registration (wires modules to Discord events) |
| `src/utils/errors.js` | Error classes and handling utilities |
| `src/utils/health.js` | Health monitoring singleton |
| `src/utils/permissions.js` | Permission checking for commands |
| `src/utils/retry.js` | Retry utility for flaky operations |
| `src/utils/registerCommands.js` | Discord REST API command registration |
| `src/utils/splitMessage.js` | Message splitting for Discord's 2000-char limit |
| `src/utils/duration.js` | Duration parsing — "1h", "7d" ↔ ms with human-readable formatting |
| `config.json` | Default configuration (seeded to DB on first run) |
| `.env.example` | Environment variable template |

## Code Conventions

### General

- **ESM only** — use `import`/`export`, never `require()`
- **No TypeScript** — plain JavaScript with JSDoc comments for documentation
- **Node.js builtins** — always use `node:` protocol (e.g. `import { readFileSync } from 'node:fs'`)
- **Semicolons** — always use them
- **Single quotes** — enforced by Biome
- **2-space indentation** — enforced by Biome

### Logging

- **Always use Winston** — `import { info, warn, error } from '../logger.js'`
- **NEVER use `console.log`, `console.warn`, `console.error`, or any `console.*` method** in src/ files — no exceptions
- If you see `console.*` in existing code, replace it with the Winston equivalent
- Pass structured metadata: `info('Message processed', { userId, channelId })`

### Error Handling

- Use custom error classes from `src/utils/errors.js`
- Always log errors with context before re-throwing
- Graceful shutdown is handled in `src/index.js`

### Config

- Config is loaded from PostgreSQL (falls back to `config.json`)
- Use `getConfig()` from `src/modules/config.js` to read config
- Use `setConfigValue(key, value)` to update at runtime
- Config is a live object reference — mutations propagate automatically

## How to Add a Slash Command

1. Create `src/commands/yourcommand.js`:

```js
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('yourcommand')
  .setDescription('What it does');

export async function execute(interaction) {
  await interaction.reply('Hello!');
}
```

2. Export `adminOnly = true` for mod-only commands
3. Commands are auto-discovered from `src/commands/` on startup
4. Run `pnpm run deploy` to register with Discord (or restart the bot)
5. Add permission in `config.json` under `permissions.allowedCommands`

### Moderation Command Pattern

Moderation commands follow a shared pattern via `src/modules/moderation.js`:

1. `deferReply({ ephemeral: true })` — respond privately
2. Validate inputs (hierarchy check, target vs. moderator, etc.)
3. `sendDmNotification()` — DM the target (if enabled in config)
4. Execute the Discord action (ban, kick, timeout, etc.)
5. `createCase()` — record in `mod_cases` table
6. `sendModLogEmbed()` — post embed to the configured mod log channel
7. `checkEscalation()` — for warn commands, check auto-escalation thresholds

Duration-based commands (timeout, tempban, slowmode) use `parseDuration()` from `src/utils/duration.js`.

### Database Tables

| Table | Purpose |
|-------|---------|
| `mod_cases` | All moderation actions — warn, kick, ban, timeout, etc. One row per action per guild |
| `mod_scheduled_actions` | Scheduled operations (tempban expiry). Polled every 60s by the tempban scheduler |

## How to Add a Module

1. Create `src/modules/yourmodule.js` with handler functions
2. Register handlers in `src/modules/events.js`:

```js
import { yourHandler } from './yourmodule.js';
// In registerEventHandlers():
client.on('eventName', (args) => yourHandler(args, config));
```

3. Config for your module goes in `config.json` under a new key
4. Check `config.yourModule.enabled` before processing

## Testing

- **Framework:** Vitest (`pnpm test`)
- **Test directory:** `tests/`
- **Coverage:** `pnpm test:coverage` — **mandatory 80% threshold** on statements, branches, functions, and lines
- Coverage provider: `@vitest/coverage-v8`
- Tests are smoke/unit tests — the bot requires Discord credentials so we don't test live connections
- Test config structure, command exports, utility functions
- Run `pnpm test` before every commit
- **Any new code must include tests** — PRs that drop coverage below 80% will fail CI

## Documentation

**Keep docs up to date — this is non-negotiable.**

After every code change, check whether these files need updating:

- **`README.md`** — setup instructions, architecture overview, config reference, env vars
- **`AGENTS.md`** (this file) — key files table, code conventions, "how to add" guides, common pitfalls
- **`CONTRIBUTING.md`** — workflow, branching, commit conventions
- **`.env.example`** — if you add/remove/rename an environment variable, update this immediately
- **`config.json`** — if you add a new config section or key, document it in README.md's config reference

**When to update:**
- Added a new command → update Key Files table, add to README command list
- Added a new module → update Key Files table, document config section
- Changed env vars → update `.env.example` and README's environment section
- Changed architecture (new dependency, new pattern) → update Stack section and relevant guides
- Found a new pitfall → add to Common Pitfalls below

**Rule of thumb:** If a new contributor (human or AI) would be confused without the update, write it.

## Common Pitfalls

1. **Missing `node:` prefix** — Biome will catch this, but remember it for new imports
2. **Config is async** — `loadConfig()` returns a Promise; it must be awaited at startup
3. **Discord intents** — the bot needs MessageContent, GuildMembers, and GuildVoiceStates intents enabled
4. **DATABASE_URL optional** — the bot works without a database (uses config.json only), but config persistence requires PostgreSQL
5. **Undici override** — `pnpm.overrides` pins undici; this was originally added for Node 18 compatibility and may no longer be needed on Node 22. Verify before removing
6. **2000-char limit** — Discord messages can't exceed 2000 characters; use `splitMessage()` utility
7. **DM before action** — moderation commands DM the target *before* executing kicks/bans; once a user is kicked/banned they can't receive DMs from the bot
8. **Hierarchy checks** — `checkHierarchy(moderator, target)` prevents moderating users with equal or higher roles; always call this before executing mod actions
9. **Duration caps** — Discord timeouts max at 28 days; slowmode caps at 6 hours (21600s). Both are enforced in command logic
10. **Tempban scheduler** — runs on a 60s interval; started in `index.js` startup and stopped in graceful shutdown. Catches up on missed unbans after restart
11. **Case numbering** — per-guild sequential and assigned atomically inside `createCase()` using `COALESCE(MAX(case_number), 0) + 1` in a single INSERT
