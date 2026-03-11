# AGENTS.md - Volvox.Bot Workspace

Coding agent workspace for VolvoxLLC/volvox-bot Discord bot development.

## Prerequisites

- **Node.js >=22.0.0** (required by `engines` field)
- **pnpm** (package manager — `pnpm-workspace.yaml` monorepo)
- **PostgreSQL** — primary data store
- **Redis** — optional, falls back to in-memory

### Environment Setup

```bash
cp .env.example .env   # Fill in values — see .env.example for full docs
pnpm install
pnpm migrate           # Run database migrations
pnpm deploy            # Register slash commands with Discord
pnpm start             # Start the bot
```

**Required env vars:** `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL`
**Required for dashboard:** `DISCORD_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `BOT_API_SECRET`
**Required for AI features:** `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` (not both)

## Code Quality Standards

- **ESM only** — Use `import/export`, no CommonJS
- **Single quotes** — No double quotes except in JSON
- **Semicolons** — Always required
- **2-space indent** — Biome enforced
- **Winston logger** — Use `src/logger.js`, NEVER `console.*`
- **Safe Discord messages** — Use `safeReply()`/`safeSend()`/`safeEditReply()`
- **Parameterized SQL** — Never string interpolation in queries
- **Tests required** — 80% coverage threshold, never lower it

## Architecture Overview

```
src/
├── index.js              # Bot entry point, event handlers
├── logger.js             # Winston logger singleton
├── redis.js              # Redis client with graceful degradation
├── deploy-commands.js    # Slash command registration (pnpm deploy)
├── modules/
│   ├── ai.js             # AI chat + channel blocklist
│   ├── aiAutoMod.js      # Claude-powered auto-moderation
│   ├── aiFeedback.js     # 👍👎 reaction feedback tracking
│   ├── afkHandler.js     # AFK status management
│   ├── auditLogger.js    # Audit log recording
│   ├── backup.js         # Guild config backup/restore
│   ├── botStatus.js      # Bot presence/status management
│   ├── challengeScheduler.js # Scheduled community challenges
│   ├── cli-process.js    # Claude CLI subprocess management
│   ├── commandAliases.js # Command alias resolution
│   ├── config.js         # Config management (DB-backed)
│   ├── engagement.js     # User engagement tracking
│   ├── events.js         # Scheduled events
│   ├── githubFeed.js     # GitHub webhook → Discord feed
│   ├── linkFilter.js     # Link filtering/moderation
│   ├── memory.js         # User long-term memory (mem0)
│   ├── moderation.js     # Mod actions + case management
│   ├── optout.js         # User opt-out handling
│   ├── performanceMonitor.js  # Memory/CPU tracking
│   ├── pollHandler.js    # Poll creation/management
│   ├── quietMode.js      # Quiet hours/mode
│   ├── rateLimit.js      # Rate limiting logic
│   ├── reactionRoles.js  # Reaction-based role assignment
│   ├── reminderHandler.js # Scheduled reminders
│   ├── reputation.js     # Reputation/XP system
│   ├── reputationDefaults.js # Default reputation config
│   ├── reviewHandler.js  # Review/approval workflows
│   ├── roleMenuTemplates.js  # Role menu system
│   ├── scheduler.js      # Task scheduling
│   ├── spam.js           # Spam detection
│   ├── starboard.js      # Starboard feature
│   ├── tempRoleHandler.js # Temporary role assignment
│   ├── threading.js      # Thread management
│   ├── ticketHandler.js  # Support ticket system
│   ├── triage.js         # AI triage orchestrator
│   ├── triage-*.js       # Triage sub-modules (buffer, config, filter, parse, prompt, respond)
│   ├── voice.js          # Voice channel features
│   ├── warningEngine.js  # Warning/strike system
│   ├── webhookNotifier.js     # Outbound webhooks
│   ├── welcome.js        # Welcome messages
│   └── welcomeOnboarding.js   # New member onboarding flow
├── commands/             # Slash commands (~45 commands)
├── prompts/              # AI prompt templates
│   ├── index.js          # Prompt loader
│   ├── triage-*.md       # Triage system/user prompts
│   ├── anti-abuse.md     # Anti-abuse guardrails
│   ├── community-rules.md    # Community rule context
│   └── search-guardrails.md  # Search safety rules
├── api/                  # REST API (Express 5)
│   ├── server.js         # Express app setup + route mounting
│   ├── swagger.js        # OpenAPI/Swagger config
│   ├── routes/           # 19 route files (auth, config, moderation, etc.)
│   ├── middleware/       # Auth, rate limiting
│   │   └── redisRateLimit.js # Distributed rate limiting
│   └── utils/            # Helpers (configAllowlist, validation)
├── utils/
│   ├── cache.js          # Redis cache wrapper (Redis + in-memory fallback)
│   ├── discordCache.js   # Discord API response caching
│   ├── reputationCache.js # Leaderboard/rank caching
│   ├── safeSend.js       # Safe Discord message helpers
│   ├── permissions.js    # Permission checking
│   ├── errors.js         # Error types and handling
│   ├── modAction.js      # Mod action recording
│   ├── modExempt.js      # Mod exemption checks
│   ├── retry.js          # Retry with backoff
│   ├── loadCommands.js   # Command file loader
│   ├── registerCommands.js # Discord API command registration
│   ├── health.js         # Health check utilities
│   ├── timeParser.js     # Duration/time parsing
│   ├── cronParser.js     # Cron expression parsing
│   ├── sanitizeMentions.js # Mention sanitization
│   └── ...               # + splitMessage, logQuery, duration, etc.
└── transports/
    ├── sentry.js         # Sentry Winston transport
    ├── postgres.js        # PostgreSQL Winston transport
    └── websocket.js       # WebSocket log streaming

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
- `SAFE_CONFIG_KEYS` — writable via API
- `READABLE_CONFIG_KEYS` — read-only via API
- New config sections MUST be added to SAFE to enable saves

### Redis Caching
- `src/utils/cache.js` — generic cache with Redis + in-memory fallback
- `src/utils/discordCache.js` — channels, roles, members
- `src/utils/reputationCache.js` — leaderboard, rank, user data
- All caches auto-invalidate on config changes

### AI Integration
- Claude CLI in headless mode for AI chat
- Claude SDK for auto-moderation (toxicity/spam detection)
- Feedback tracking via 👍👎 reactions
- Channel blocklist for ignoring specific channels

### Database
- All queries use parameterized SQL — never string interpolation
- See "Database Migrations" section above for migration commands

### Web Dashboard
- Next.js 16 with App Router
- Discord OAuth2 authentication
- Dark/light theme support
- Mobile-responsive design
- Real-time updates via WebSocket

#### Dashboard Tab Titles
Browser tab titles are managed via two mechanisms:
- **SSR entry points** (`/dashboard`, `/dashboard/config`, `/dashboard/performance`): export `metadata` using `createPageMetadata()` from `web/src/lib/page-titles.ts`
- **Client-side navigations**: `DashboardTitleSync` component (mounted in the dashboard shell) syncs `document.title` using `getDashboardDocumentTitle()`

**When adding a new dashboard route**, you must add a matcher entry to `dashboardTitleMatchers` in `web/src/lib/page-titles.ts`. Use exact equality for leaf routes (`pathname === '/dashboard/my-route'`) plus a subtree check (`pathname.startsWith('/dashboard/my-route/')`) to avoid false-positive matches on future sibling routes. For SSR entry points, also export `metadata` from the page file using `createPageMetadata(title)`.

#### Visual Change Verification (MANDATORY)

**Every single visual change to the dashboard MUST be verified using the Chrome DevTools MCP server. This is non-negotiable and cannot be skipped.** After any UI modification (layout, styling, components, theming, responsive adjustments), you must:

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
8. If adding a new dashboard route, add a matcher entry to `dashboardTitleMatchers` in `web/src/lib/page-titles.ts` (see Web Dashboard section above)

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

## Running the Bot

```bash
pnpm start               # Start the bot (node src/index.js)
pnpm dev                 # Start with --watch (auto-restart on changes)
pnpm deploy              # Register slash commands with Discord
LOG_LEVEL=debug pnpm start  # Debug mode
```

## Database Migrations

```bash
pnpm migrate             # Run pending migrations
pnpm migrate:down        # Roll back last migration
pnpm migrate:create NAME # Create new migration file
```

Migrations live in `migrations/` as `.cjs` files (ESM conflict with node-pg-migrate). Sequential numbering (001, 002, ...).

## API Documentation

```bash
pnpm docs:generate       # Regenerate OpenAPI spec from JSDoc annotations
```

OpenAPI spec: `docs/openapi.json`. Swagger annotations in `src/api/swagger.js`.

## Monorepo Tooling

- `pnpm-workspace.yaml` includes the root bot package and `web/`
- Turborepo orchestrates cross-workspace tasks
- Changesets manages multi-package versioning/release notes

```bash
pnpm mono:dev          # Run dev scripts across workspaces
pnpm mono:build        # Build all buildable workspaces
pnpm mono:lint         # Lint all workspaces
pnpm mono:test         # Run tests across workspaces
pnpm mono:typecheck    # Typecheck workspaces with typecheck scripts
pnpm changeset         # Create a release note entry
pnpm version-packages  # Apply version bumps from changesets
```

## Testing

```bash
pnpm test              # Run all tests
pnpm test:coverage     # Run with coverage report
pnpm test:watch        # Watch mode
```

**Coverage threshold: 80% branches** — Never lower this.

## Linting & Formatting

```bash
pnpm lint              # Check for issues + formatting
pnpm lint:fix          # Auto-fix issues
pnpm format            # Format code
```

## Git Workflow

1. Create feature branch from `main`
2. Make changes with conventional commits
3. Push and create PR
4. Wait for CI + review bots (Claude, CodeRabbit, Greptile, Copilot)
5. Address review comments
6. Squash merge with `--admin` flag (branch protection)

## Review Bots

- **Claude Code Review** — GitHub Actions integration
- **CodeRabbit** — Can push doc commits directly (watch for breakage)
- **Greptile** — AI code review
- **Copilot** — GitHub's AI review

All bots re-review on every push. Fix real bugs, resolve stale threads in batches.

## Troubleshooting

### Common Issues

1. **Slash commands not appearing** — Run `pnpm deploy` to register commands
2. **Redis connection errors** — Check `REDIS_URL` env var, Redis must be running
3. **Tests failing** — Check if migration ran, verify test DB is clean
4. **Config not saving** — Verify key is in `SAFE_CONFIG_KEYS`
5. **CI failing** — Run `pnpm test:coverage` locally, check threshold

## Resources

- **Discord.js docs** — https://discord.js.org
- **Claude API docs** — https://docs.anthropic.com
- **PostgreSQL docs** — https://www.postgresql.org/docs
- **Next.js docs** — https://nextjs.org/docs

---

Update this file as patterns and conventions evolve.
