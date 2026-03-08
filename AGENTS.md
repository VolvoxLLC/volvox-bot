# AGENTS.md - Volvox Bot Workspace

Coding agent workspace for VolvoxLLC/volvox-bot Discord bot development.

## Every Session

Before doing anything else:

1. Read `CLAUDE.md` — coding standards and persona

## Before Ending Session

After completing infrastructure work:

- Update **CLAUDE.md** with technical decisions and session notes
- **Self-check:** "Did I document the important stuff?"

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
├── modules/
│   ├── ai.js             # AI chat + channel blocklist
│   ├── aiAutoMod.js      # Claude-powered auto-moderation
│   ├── config.js         # Config management (DB-backed)
│   ├── moderation.js     # Mod actions + case management
│   ├── performanceMonitor.js  # Memory/CPU tracking
│   ├── webhookNotifier.js     # Outbound webhooks
│   ├── roleMenuTemplates.js   # Role menu system
│   └── ...               # Other modules
├── commands/             # Slash commands
├── api/                  # REST API (Express)
│   ├── routes/           # API endpoints
│   ├── middleware/       # Auth, rate limiting
│   │   └── redisRateLimit.js # Distributed rate limiting
│   └── utils/            # Helpers (configAllowlist, validation)
├── utils/
│   ├── cache.js          # Redis cache wrapper
│   └── discordCache.js   # Discord API response caching
└── transports/
    └── sentry.js         # Sentry Winston transport

web/                      # Next.js dashboard
├── src/
│   ├── app/              # App router pages
│   ├── components/       # React components
│   └── lib/              # Utilities
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
- node-pg-migrate for migrations (`.cjs` files, ESM conflict)
- Sequential migration numbering (001, 002, ...)
- All queries use parameterized SQL

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

### Debug Mode

```bash
LOG_LEVEL=debug pnpm start
```

## Resources

- **Discord.js docs** — https://discord.js.org
- **Claude API docs** — https://docs.anthropic.com
- **PostgreSQL docs** — https://www.postgresql.org/docs
- **Next.js docs** — https://nextjs.org/docs

---

Update this file as patterns and conventions evolve.
