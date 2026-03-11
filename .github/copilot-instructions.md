# Copilot Coding Agent Instructions — Volvox Bot

## Quick Start

This is a **pnpm monorepo** containing a Discord bot (Node.js ESM JavaScript) and a Next.js web dashboard (TypeScript). Always use **pnpm** as the package manager.

```bash
pnpm install --frozen-lockfile   # Install all dependencies
pnpm lint                        # Biome lint + format check (bot + web)
pnpm test                        # Run bot tests (Vitest)
pnpm test:coverage               # Run bot tests with coverage enforcement
pnpm --prefix web test           # Run web dashboard tests
pnpm --prefix web build          # Build the Next.js dashboard
```

### First Steps in Every Session

1. Read this file for project conventions and patterns.
2. Run `pnpm lint` and `pnpm test` before making changes to see existing state.
3. After making changes, run `pnpm lint` and `pnpm test:coverage` to verify nothing breaks.

---

## Project Overview

**Volvox Bot** is a Discord bot with AI chat (Claude), moderation, engagement tracking, and a web dashboard. Key technologies:

| Component | Tech |
|-----------|------|
| Bot runtime | Node.js 22+, ESM JavaScript, discord.js v14 |
| AI features | Anthropic Claude SDK (`@anthropic-ai/sdk`, `@anthropic-ai/claude-code`) |
| Database | PostgreSQL 17+ with node-pg-migrate |
| Caching | Redis 7+ (ioredis) with in-memory fallback |
| API | Express 5 REST API |
| Logging | Winston (never use `console.*`) |
| Web dashboard | Next.js 16, TypeScript, React 19, Tailwind CSS 4, Radix UI |
| Testing | Vitest 4 with v8 coverage |
| Linting | Biome 2 (linter + formatter) |
| Monorepo | pnpm workspaces + Turborepo |
| Versioning | Changesets |

---

## Code Style (Biome-Enforced)

- **ESM only** — `import`/`export`, never `require()`/`module.exports`
- **Single quotes** — No double quotes (except in JSON files)
- **Semicolons** — Always required
- **2-space indentation** — Spaces, not tabs
- **Trailing commas** — Always (`trailingCommas: "all"`)
- **100-character line width**
- **No `console.*`** — This is a Biome **error**. Use `import logger from '../logger.js';` and call `logger.info()`, `logger.warn()`, `logger.error()`, etc.

Run `pnpm lint:fix` to auto-fix formatting and lint issues.

---

## Repository Layout

```
├── src/                    # Bot source (ESM JavaScript)
│   ├── index.js            # Entry point — event handlers, bot startup
│   ├── logger.js           # Winston logger singleton
│   ├── redis.js            # Redis client with graceful degradation
│   ├── modules/            # Feature modules (ai, config, moderation, etc.)
│   ├── commands/           # Slash command definitions
│   ├── api/                # Express REST API
│   │   ├── routes/         # API route handlers
│   │   ├── middleware/     # Auth, rate limiting, validation
│   │   └── utils/          # configAllowlist.js, validation helpers
│   ├── utils/              # Shared utilities (cache, discordCache, etc.)
│   └── transports/         # Winston transports (Sentry)
├── web/                    # Next.js dashboard (TypeScript)
│   ├── src/app/            # App Router pages
│   ├── src/components/     # React components
│   └── src/lib/            # Utilities, page-titles, types
├── tests/                  # Bot test suite (Vitest, JavaScript)
│   ├── api/                # API endpoint tests
│   ├── commands/           # Command handler tests
│   ├── modules/            # Module tests
│   └── utils/              # Utility tests
├── migrations/             # PostgreSQL migrations (.cjs files)
├── docs/                   # Documentation site
├── config.json             # Runtime bot configuration
├── biome.json              # Biome linter/formatter config
├── vitest.config.js        # Bot test config
├── turbo.json              # Turborepo task config
├── docker-compose.yml      # Local dev: PostgreSQL, Redis, bot, web
├── Dockerfile              # Bot production image
└── .env.example            # Environment variable template
```

---

## Testing

### Bot Tests

```bash
pnpm test                  # Run all bot tests
pnpm test:coverage         # Run with coverage thresholds enforced
```

- **Framework:** Vitest 4 with `node` environment
- **Test files:** `tests/**/*.test.js` (JavaScript, ESM)
- **Coverage thresholds:** statements 85%, branches 82%, functions 85%, lines 85%
- **Never lower coverage thresholds** — add tests instead

### Web Dashboard Tests

```bash
pnpm --prefix web test             # Run web tests
pnpm --prefix web test:coverage    # Run with coverage
```

- **Framework:** Vitest 4 with `jsdom` environment and React Testing Library
- **Test files:** `web/tests/**/*.test.{ts,tsx}` (TypeScript)
- **Coverage thresholds:** 85% across all metrics

### Writing Tests

- Place bot tests in `tests/` mirroring the `src/` structure
- Place web tests in `web/tests/` mirroring `web/src/`
- Mock external dependencies (Discord.js, database, Redis, Claude SDK)
- Use `vi.mock()` for module mocking; use `vi.fn()` for function stubs
- Test timeout is 10 seconds

---

## CI Pipeline (GitHub Actions)

The CI workflow (`.github/workflows/ci.yml`) runs on every PR and push to `main`:

1. **Lint** — `pnpm lint` (Biome check on bot + web)
2. **Test** — `pnpm test:coverage` (Vitest with coverage thresholds)
3. **Web** — `pnpm --prefix web typecheck && lint && build`
4. **Docker** — Validates Docker images build on PRs

All four checks must pass. The `lint-and-test` gate job aggregates lint + test results.

---

## Key Patterns

### Config System

- `src/modules/config.js` manages bot configuration (DB-backed with in-memory cache)
- `getConfig(guildId)` returns merged global + guild-level config
- All community features are gated behind `config.<feature>.enabled`
- Moderation commands are always available regardless of config settings
- Config changes can be made via the `/config` slash command or the web dashboard

### Config Allowlist (Important for API)

- `src/api/utils/configAllowlist.js` defines two key sets:
  - `SAFE_CONFIG_KEYS` — Keys writable through the API
  - `READABLE_CONFIG_KEYS` — Keys readable through the API
- **When adding a new config section**, you MUST add it to `SAFE_CONFIG_KEYS` to enable saves via the API/dashboard

### Safe Discord Messaging

- Always use `safeReply()`, `safeSend()`, or `safeEditReply()` instead of raw Discord.js methods
- These wrappers handle errors gracefully (e.g., deleted channels, missing permissions)

### Database

- **Migrations:** node-pg-migrate with `.cjs` file extension (required for ESM compatibility)
- **Numbering:** Sequential prefixes: `001_`, `002_`, etc.
- **SQL:** Always use parameterized queries — never string interpolation
- **Commands:** `pnpm migrate` (up), `pnpm migrate:down` (rollback), `pnpm migrate:create` (new)

### Redis Caching

- `src/utils/cache.js` — Generic cache with Redis primary + in-memory fallback
- `src/utils/discordCache.js` — Discord API response caching (channels, roles, members)
- `src/utils/reputationCache.js` — Leaderboard and user reputation data
- All caches auto-invalidate when config changes

### Logging

- Import the Winston logger: `import logger from '../logger.js';` (adjust path as needed)
- Use `logger.info()`, `logger.warn()`, `logger.error()`, `logger.debug()`
- Never use `console.log`, `console.error`, etc. — Biome will flag this as an error

---

## Common Tasks

### Adding a New Bot Feature

1. Create module in `src/modules/`
2. Add config section to `config.json`
3. Update `SAFE_CONFIG_KEYS` in `src/api/utils/configAllowlist.js`
4. Add slash command in `src/commands/` if needed
5. Create database migration if needed (`pnpm migrate:create`)
6. Write tests in `tests/` (maintain 82%+ branch coverage)
7. Update dashboard UI in `web/` if the feature is configurable

### Adding a New Slash Command

1. Create file in `src/commands/` exporting a slash command builder + `execute` function
2. Add tests in `tests/commands/`

### Adding a New API Endpoint

1. Create route handler in `src/api/routes/`
2. Mount the route in `src/api/server.js`
3. Add auth middleware if the endpoint requires authentication
4. Add tests in `tests/api/`

### Adding a Dashboard Route

1. Create the page in `web/src/app/dashboard/<route>/page.tsx`
2. Add a matcher entry to `dashboardTitleMatchers` in `web/src/lib/page-titles.ts`
   - Use exact equality for leaf routes: `pathname === '/dashboard/my-route'`
   - Plus subtree check: `pathname.startsWith('/dashboard/my-route/')`
3. For SSR entry points, export `metadata` using `createPageMetadata(title)` from `web/src/lib/page-titles.ts`

### Creating a Database Migration

```bash
pnpm migrate:create -- my-migration-name
```

- Migration files use `.cjs` extension (CommonJS) because node-pg-migrate conflicts with ESM
- Follow sequential numbering: check the latest migration number and increment

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Key variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `ANTHROPIC_API_KEY` | Yes | Claude AI features |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DISCORD_CLIENT_ID` | Yes | Slash command deployment |
| `REDIS_URL` | No | Redis caching (falls back to in-memory) |
| `BOT_API_SECRET` | No | Bot API authentication |
| `SENTRY_DSN` | No | Error tracking |
| `LOG_LEVEL` | No | Logging verbosity (debug/info/warn/error) |

For Docker-based local development: `docker compose up` starts PostgreSQL, Redis, bot, and web dashboard.

---

## Monorepo Commands

```bash
pnpm mono:dev          # Run dev scripts across all workspaces
pnpm mono:build        # Build all workspaces
pnpm mono:lint         # Lint all workspaces
pnpm mono:test         # Test all workspaces
pnpm mono:typecheck    # Typecheck all workspaces
```

The web dashboard has its own `pnpm-lock.yaml` and dependencies. Use `pnpm --prefix web <command>` for web-specific operations.

---

## Known Workarounds and Gotchas

1. **Migration file extension:** Database migrations must use `.cjs` (CommonJS) because node-pg-migrate does not support ESM. The rest of the project is ESM (`.js` with `"type": "module"`).

2. **No `console.*`:** Biome treats `console.log`, `console.error`, etc. as errors via the `noConsole` rule. Always use the Winston logger from `src/logger.js`.

3. **Coverage thresholds are strict:** Bot tests require 82%+ branch coverage; web tests require 85%. If your changes reduce coverage below these thresholds, the CI will fail. Write tests for new code.

4. **`pnpm` only:** The project uses `engine-strict=true` in `.npmrc` and requires pnpm 10.30.3+. Do not use npm or yarn.

5. **Node.js 22+ required:** The `engines` field in `package.json` enforces this. Older Node.js versions will fail.

6. **Web dashboard is a separate workspace:** The `web/` directory has its own `package.json`, `pnpm-lock.yaml`, and `node_modules`. Install web dependencies with `pnpm --prefix web install`.

7. **Biome scopes:** The biome config includes both `src/**/*.js` and `web/src/**/*.{ts,tsx}`. Running `pnpm lint` from root checks both the bot and web code.

8. **Pre-commit hook:** If `gitleaks` is installed, a pre-commit hook scans staged changes for secrets. The hook is optional (warns if gitleaks is missing) — CI catches secrets regardless.

9. **Docker Compose overrides env vars:** When using `docker compose up`, `DATABASE_URL`, `REDIS_URL`, and `NEXTAUTH_URL` are set by docker-compose.yml and override `.env` values.

---

## Git Conventions

- **Branch naming:** `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `style/`, `test/`, `ci/`
- **Commit messages:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`, `test:`, `ci:`
- **PR target:** Always `main`
- **Changesets:** Use `pnpm changeset` to create release notes for user-facing changes

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Slash commands not appearing | Run `pnpm deploy` to register commands with Discord |
| Redis connection errors | Check `REDIS_URL` env var; bot degrades gracefully without Redis |
| Tests failing on CI | Run `pnpm test:coverage` locally; check coverage thresholds |
| Config not saving via API | Ensure the key is in `SAFE_CONFIG_KEYS` in `src/api/utils/configAllowlist.js` |
| Lint errors on `console.*` | Replace with Winston logger: `import logger from '../logger.js'` |
| Web build fails | Run `pnpm --prefix web install` then `pnpm --prefix web build` |
| Migration ESM errors | Ensure migration files use `.cjs` extension, not `.js` |
