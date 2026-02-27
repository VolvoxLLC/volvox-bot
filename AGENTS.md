# AGENTS.md — AI Coding Agent Guide

> This file provides context for AI coding agents (Claude Code, Copilot, Cursor, etc.) working on volvox-bot.

## Project Overview

**Volvox Bot** is a Discord bot for the Volvox developer community. It provides AI chat (via Claude CLI in headless mode with split Haiku classifier + Sonnet responder triage), dynamic welcome messages, spam detection, and runtime configuration management backed by PostgreSQL.

## Stack

- **Runtime:** Node.js 22 (ESM modules, `"type": "module"`)
- **Framework:** discord.js v14
- **Database:** PostgreSQL (via `pg` — raw SQL, no ORM)
- **Logging:** Winston with daily file rotation
- **AI:** Claude via CLI (`claude` binary in headless mode, wrapped by `CLIProcess`)
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
| `src/modules/ai.js` | AI chat handler — conversation history, Claude CLI calls |
| `src/modules/triage.js` | Per-channel message triage — Haiku classifier + Sonnet responder via CLIProcess |
| `src/modules/cli-process.js` | Claude CLI subprocess manager with dual-mode (short-lived / long-lived) support and token-based recycling |
| `src/modules/welcome.js` | Dynamic welcome message generation |
| `src/modules/spam.js` | Spam/scam pattern detection |
| `src/modules/moderation.js` | Moderation — case creation, DM notifications, mod log embeds, escalation, tempban scheduler |
| `src/modules/config.js` | Config loading/saving (DB + file), runtime updates |
| `src/modules/events.js` | Event handler registration (wires modules to Discord events) |
| `src/api/server.js` | Express API server setup (createApp, startServer, stopServer) |
| `src/api/index.js` | API route mounting |
| `src/api/routes/guilds.js` | Guild REST API endpoints (info, channels, roles, config, stats, members, moderation, analytics, actions) |
| `web/src/components/dashboard/analytics-dashboard.tsx` | Analytics dashboard React component — charts, KPIs, date range controls |
| `web/src/types/analytics.ts` | Shared analytics TypeScript contracts used by dashboard UI and analytics API responses |
| `web/src/app/api/guilds/[guildId]/analytics/route.ts` | Next.js API route — proxies analytics requests to bot API with param allowlisting |
| `web/src/components/dashboard/channel-selector.tsx` | Channel picker component — single or multi-select Discord channel picker with Zustand store integration |
| `web/src/components/dashboard/role-selector.tsx` | Role picker component — single or multi-select Discord role picker with color dots |
| `web/src/components/dashboard/array-editor.tsx` | Tag-input component for editing string arrays (Enter to add, Backspace to remove) |
| `web/src/stores/discord-entities.ts` | Zustand store — caches Discord channels and roles per guild with fetch-on-demand |
| `web/src/app/api/guilds/[guildId]/channels/route.ts` | Next.js API route — proxies channel list requests to bot API |
| `web/src/app/api/guilds/[guildId]/roles/route.ts` | Next.js API route — proxies role list requests to bot API |
| `web/src/lib/guild-selection.ts` | Guild selection state — localStorage persistence (`SELECTED_GUILD_KEY`) and cross-tab broadcast (`broadcastSelectedGuild`) |
| `web/src/lib/bot-api.ts` | Bot API URL normalization — `getBotApiBaseUrl` for constructing stable v1 API endpoint |
| `src/api/middleware/auth.js` | API authentication middleware |
| `src/api/middleware/rateLimit.js` | Rate limiting middleware |
| `src/utils/errors.js` | Error classes and handling utilities |
| `src/utils/health.js` | Health monitoring singleton |
| `src/utils/permissions.js` | Permission checking for commands |
| `src/utils/retry.js` | Retry utility for flaky operations |
| `src/utils/safeSend.js` | Safe message-sending wrappers — sanitizes mentions and enforces allowedMentions on every outgoing message |
| `src/utils/sanitizeMentions.js` | Mention sanitization — strips @everyone/@here from outgoing text via zero-width space insertion |
| `src/utils/registerCommands.js` | Discord REST API command registration |
| `src/utils/splitMessage.js` | Message splitting for Discord's 2000-char limit |
| `src/utils/debugFooter.js` | Debug stats footer builder and Discord embed wrapper for AI responses |
| `src/utils/duration.js` | Duration parsing — "1h", "7d" ↔ ms with human-readable formatting |
| `src/commands/announce.js` | Scheduled message command — `/announce` with create/list/delete subcommands (moderator-only); stores schedules to `scheduled_messages` table |
| `src/commands/afk.js` | AFK command — `/afk set [reason]` and `/afk clear`; exports `buildPingSummary` used by the handler module |
| `src/modules/afkHandler.js` | AFK message handler — detects AFK mentions, sends inline notices (rate-limited), auto-clears AFK on return, DMs ping summary |
| `src/modules/scheduler.js` | Scheduled message poller — cron expression parser (`parseCron`, `getNextCronRun`), due-message dispatcher via `safeSend`, 60s interval started/stopped via `startScheduler`/`stopScheduler` |
| `migrations/002_scheduled-messages.cjs` | Migration — creates `scheduled_messages` table (id, guild_id, channel_id, content, cron_expression, next_run, is_one_time, created_by) |
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
- Use `getConfig(guildId?)` from `src/modules/config.js` to read config
- Use `setConfigValue(path, value, guildId?)` to update at runtime
- Return semantics are intentional: `getConfig()` / `getConfig('global')` returns a live global reference, while `getConfig(guildId)` returns a detached merged clone (`global + guild overrides`)

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
| `afk_status` | Active AFK records — one row per (guild_id, user_id); upserted on `/afk set`, deleted on return or `/afk clear` |
| `afk_pings` | Pings logged while a user is AFK — accumulated until the user returns, then DM-summarised and deleted |

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

## Config Hot-Reload Behavior

Runtime config changes (via `/config set`) are handled in two ways:

- **Per-request modules (AI, spam, moderation):** These modules call `getConfig(interaction.guildId)` on every invocation, so config changes take effect automatically on the next request. The `onConfigChange` listeners for these modules provide **observability only** (logging).
- **Stateful objects (logging transport):** The PostgreSQL logging transport is a long-lived Winston transport. It requires **reactive wiring** — `onConfigChange` listeners that add/remove/recreate the transport when `logging.database.*` settings change at runtime. This is implemented in `src/index.js` startup. `onConfigChange` callbacks receive `(newValue, oldValue, fullPath, guildId)`.

When adding new modules, prefer the per-request `getConfig()` pattern. Only add reactive `onConfigChange` wiring for stateful resources that can't re-read config on each use.

## Secret Scanning

**gitleaks** runs automatically to prevent accidental secret commits.

### How It Works

- **Pre-commit hook** (`.hooks/pre-commit`) — scans staged changes before every commit. Installed automatically when you run `pnpm install` (via the `prepare` script which sets `core.hooksPath`).
- **CI check** (`.github/workflows/gitleaks.yml`) — runs on every push to `main` and on all PRs as a safety net. This is the hard gate — even if the local hook is bypassed, CI will catch it.
- **Config** (`.gitleaks.toml`) — extends gitleaks defaults with custom rules for Discord bot tokens, Anthropic API keys, Anthropic OAuth tokens, and mem0 API keys. Allowlists `.env.example`, test directories, and `node_modules/`.

### Installing gitleaks Locally

```sh
# macOS
brew install gitleaks

# Go
go install github.com/gitleaks/gitleaks/v8@latest
```

If gitleaks is not installed, the pre-commit hook prints install instructions and exits cleanly (non-blocking). CI is the true gate.

### Allowlisting False Positives

Edit `.gitleaks.toml` — add paths to `[allowlist].paths` or add inline `# gitleaks:allow` comments on specific lines.

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
12. **Triage budget limits** — `classifyBudget` caps Haiku classifier spend; `respondBudget` caps Sonnet responder spend per call. If exceeded, the CLI returns an error result (`is_error: true`), which the code catches and logs. Monitor `total_cost_usd` in logs
13. **Triage timeout behavior** — `timeout` controls the deadline for evaluation calls. On timeout the call is aborted and no response is sent
14. **Channel buffer eviction** — triage tracks at most 100 channels; channels inactive for 30 minutes are evicted. If a channel is evicted mid-conversation, the buffer is lost and evaluation restarts from scratch
15. **Split triage evaluation** — two-step flow: Haiku classifies (cheap, ~80% are "ignore" and stop here), then Sonnet responds only when needed. CLIProcess wraps the `claude` CLI binary with token-based recycling (default 20k accumulated tokens) to bound context growth. Both processes use JSON schema structured output
16. **Token recycling** — each CLIProcess tracks accumulated input+output tokens. When `tokenRecycleLimit` is exceeded, the process is transparently replaced. Recycling is non-blocking — the current caller gets their result, the next caller waits for the fresh process
