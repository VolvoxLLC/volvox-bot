# AGENTS.md - Volvox.Bot Workspace

Coding agent workspace for VolvoxLLC/volvox-bot Discord bot development.

## Prerequisites

- **Node.js >=22.0.0** — required by `engines` field
- **pnpm** — monorepo via `pnpm-workspace.yaml`
- **PostgreSQL** — primary data store
- **Redis** — optional, falls back to in-memory

### Environment Setup

```bash
cp .env.example .env   # See .env.example for full docs
pnpm install
pnpm migrate           # Run database migrations
pnpm deploy            # Register slash commands with Discord
pnpm start             # Start the bot
```

**Required env vars:** `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL`
**Required for dashboard:** `DISCORD_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `BOT_API_SECRET`
**Required for AI features:** `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` (not both)

## Code Quality Standards

- **ESM only** — `import/export`, no CommonJS
- **Single quotes** — no double quotes except in JSON
- **Semicolons** — always required
- **2-space indent** — Biome enforced
- **Winston logger** — use `src/logger.js`, NEVER `console.*`
- **Safe Discord messages** — use `safeReply()`/`safeSend()`/`safeEditReply()`
- **Parameterized SQL** — never string interpolation in queries
- **Tests required** — 80% coverage threshold, never lower it

## Architecture Overview

```
src/
├── index.js              # Bot entry point, event handlers
├── logger.js             # Winston logger singleton
├── redis.js              # Redis client with graceful degradation
├── deploy-commands.js    # Slash command registration (pnpm deploy)
├── modules/              # ~46 feature modules
│   ├── ai.js, aiAutoMod.js, aiFeedback.js       # AI chat, moderation, feedback
│   ├── cli-process.js, triage.js, triage-*.js    # Claude CLI subprocess, AI triage pipeline
│   ├── config.js                                 # Config management (DB-backed)
│   ├── moderation.js, warningEngine.js           # Mod actions, case management, warnings
│   ├── reputation.js, engagement.js, starboard.js # XP/rep system, engagement, starboard
│   ├── welcome.js, welcomeOnboarding.js          # Welcome messages + onboarding
│   ├── ticketHandler.js, pollHandler.js          # Support tickets, polls
│   ├── roleMenuTemplates.js, reactionRoles.js    # Role assignment systems
│   ├── githubFeed.js, webhookNotifier.js         # Outbound integrations
│   ├── backup.js, scheduler.js, memory.js        # Backup, scheduling, mem0 memory
│   └── ...                                       # afk, voice, spam, linkFilter, etc.
├── commands/             # ~45 slash commands
├── prompts/              # AI prompt templates (triage, anti-abuse, guardrails)
├── api/                  # REST API (Express 5)
│   ├── server.js         # App setup + route mounting
│   ├── swagger.js        # OpenAPI/Swagger config
│   ├── routes/           # 19 route files (auth, config, moderation, etc.)
│   ├── middleware/       # Auth, rate limiting (redisRateLimit.js)
│   └── utils/            # configAllowlist, validation
├── utils/                # ~25 helpers
│   ├── cache.js, discordCache.js, reputationCache.js  # Caching (Redis + in-memory fallback)
│   ├── safeSend.js, sanitizeMentions.js               # Safe Discord messaging
│   ├── permissions.js, modAction.js, modExempt.js     # Auth + mod helpers
│   ├── errors.js, retry.js, health.js                 # Error handling, resilience
│   ├── loadCommands.js, registerCommands.js           # Command loading/registration
│   └── timeParser.js, cronParser.js, duration.js      # Time/scheduling utilities
└── transports/
    ├── sentry.js         # Sentry Winston transport
    ├── postgres.js       # PostgreSQL Winston transport
    └── websocket.js      # WebSocket log streaming

web/                      # Next.js 16 dashboard
├── src/
│   ├── app/              # App router pages
│   ├── components/       # React components
│   └── lib/              # Utilities (page-titles.ts, etc.)
```

## Key Patterns

### Config System

- `getConfig(guildId)` returns merged global + guild config
- All community features gated behind `config.<feature>.enabled`
- Mod commands always available regardless of config
- Config changes via `/config` command or web dashboard

### Config Allowlist

- `src/api/utils/configAllowlist.js`
- `SAFE_CONFIG_KEYS` — writable via API; `READABLE_CONFIG_KEYS` — read-only via API
- New config sections MUST be added to SAFE to enable saves

### Redis Caching

- `cache.js` — generic cache with Redis + in-memory fallback
- `discordCache.js` — channels, roles, members
- `reputationCache.js` — leaderboard, rank, user data
- All caches auto-invalidate on config changes

### AI Integration

- Claude CLI in headless mode for AI chat
- Claude SDK for auto-moderation (toxicity/spam detection)
- Feedback tracking via thumbs up/down reactions
- Channel blocklist for ignoring specific channels

### Web Dashboard

- Next.js 16 with App Router, Discord OAuth2 auth
- Dark/light theme, mobile-responsive, real-time WebSocket updates

#### Dashboard Tab Titles

- **SSR entry points**: export `metadata` using `createPageMetadata()` from `web/src/lib/page-titles.ts`
- **Client-side navigations**: `DashboardTitleSync` syncs `document.title` using `getDashboardDocumentTitle()`
- **New routes** require a matcher entry in `dashboardTitleMatchers` in `web/src/lib/page-titles.ts` — use exact equality for leaf routes plus a `startsWith` subtree check

#### Visual Change Verification (MANDATORY)

**Every visual change to the dashboard MUST be verified using the Chrome DevTools MCP server. This is non-negotiable and cannot be skipped.** After any UI modification:

1. Use `mcp__chrome-devtools__take_screenshot` to capture the result
2. Visually confirm the change renders correctly
3. Check both dark and light themes if the change affects colors/theming
4. Verify responsive behavior if the change affects layout

Do NOT mark dashboard UI work as complete without visual verification. If the dashboard is not running or the MCP server is unavailable, flag it — do not silently skip verification.

## Common Tasks

### Adding a New Feature

1. Create module in `src/modules/`
2. Add config section to `config.json`
3. Update `SAFE_CONFIG_KEYS` in `src/api/utils/configAllowlist.js`
4. Add slash command in `src/commands/` if needed
5. Create database migration if needed
6. Write tests in `tests/`
7. Update dashboard UI if configurable
8. New dashboard routes need a matcher in `dashboardTitleMatchers` (see above)

### Adding a New Command

1. Create file in `src/commands/`
2. Export slash command builder + execute function
3. Add tests in `tests/commands/`

### Adding a New API Endpoint

1. Create route in `src/api/routes/`
2. Mount in `src/api/server.js`
3. Add auth middleware if needed
4. Document in OpenAPI spec
5. Add tests in `tests/api/`

## Commands

```bash
# Monorepo (preferred — runs across all workspaces via Turbo)
pnpm mono:dev              # Dev servers (bot + web) in parallel
pnpm mono:lint             # Lint all workspaces
pnpm mono:test             # Test all workspaces
pnpm mono:test:coverage    # Test with coverage (80% branch threshold)
pnpm mono:typecheck        # Typecheck all workspaces
pnpm mono:build            # Build all workspaces

# Bot (root workspace only)
pnpm start               # Start bot
pnpm dev                 # Start with --watch
pnpm deploy              # Register slash commands
LOG_LEVEL=debug pnpm start  # Debug mode

# Database
pnpm migrate             # Run pending migrations
pnpm migrate:down        # Roll back last migration
pnpm migrate:create NAME # Create new migration (.cjs files, sequential numbering)

# Linting (single workspace)
pnpm lint:fix            # Auto-fix lint issues in root
pnpm format              # Format code in root

# API Docs
pnpm docs:generate       # Regenerate OpenAPI spec (docs/openapi.json)

# Releases
pnpm changeset           # Create release note entry
pnpm version-packages    # Apply version bumps
```

## Git Workflow

1. Create feature branch from `main`
2. Make changes with conventional commits
3. Push and create PR
4. CI + review bots run (Claude, CodeRabbit, Greptile, Copilot) — all re-review on every push
5. Address review comments; fix real bugs, resolve stale threads in batches
6. Squash merge with `--admin` flag (branch protection)

## Troubleshooting

1. **Slash commands not appearing** — Run `pnpm deploy`
2. **Redis connection errors** — Check `REDIS_URL`, Redis must be running
3. **Tests failing** — Check if migration ran, verify test DB is clean
4. **Config not saving** — Verify key is in `SAFE_CONFIG_KEYS`
5. **CI failing** — Run `pnpm mono:test:coverage` locally, check threshold

