# Task 002: Adopt node-pg-migrate for Database Migrations

## Status
- **ID:** task-002
- **Created:** 2026-02-25
- **Branch:** feat/database-migrations
- **PR:** TBD
- **Issue:** #78
- **State:** 🔄 In Progress

## Context

Schema changes are currently applied inline during `initDb()` in `src/db.js`, with additional DDL in `src/transports/postgres.js` and `src/utils/restartTracker.js`. This makes schema evolution error-prone and prevents rollback of failed migrations.

**Current DDL locations:**

### 1. `src/db.js` — `initDb()` (main schema)
Tables:
- `config` (guild_id TEXT, key TEXT, value JSONB, updated_at TIMESTAMPTZ) — PK(guild_id, key)
- `conversations` (id SERIAL PK, channel_id TEXT, guild_id TEXT, role TEXT CHECK, content TEXT, username TEXT, created_at TIMESTAMPTZ)
- `mod_cases` (id SERIAL PK, guild_id TEXT, case_number INT, action TEXT, target_id TEXT, target_tag TEXT, moderator_id TEXT, moderator_tag TEXT, reason TEXT, duration TEXT, expires_at TIMESTAMPTZ, log_message_id TEXT, created_at TIMESTAMPTZ) — UNIQUE(guild_id, case_number)
- `mod_scheduled_actions` (id SERIAL PK, guild_id TEXT, action TEXT, target_id TEXT, case_id INT FK→mod_cases, execute_at TIMESTAMPTZ, executed BOOL, created_at TIMESTAMPTZ)
- `memory_optouts` (user_id TEXT PK, created_at TIMESTAMPTZ)
- `ai_usage` (id SERIAL PK, guild_id TEXT, channel_id TEXT, type TEXT CHECK, model TEXT, input_tokens INT, output_tokens INT, cache_creation_tokens INT, cache_read_tokens INT, cost_usd NUMERIC(10,6), duration_ms INT, user_id TEXT, search_count INT, created_at TIMESTAMPTZ)

Indexes:
- idx_conversations_guild_id ON conversations(guild_id)
- idx_conversations_channel_created ON conversations(channel_id, created_at)
- idx_conversations_created_at ON conversations(created_at)
- idx_mod_cases_guild_target ON mod_cases(guild_id, target_id, created_at)
- idx_mod_scheduled_actions_pending ON mod_scheduled_actions(executed, execute_at)
- idx_ai_usage_guild_created ON ai_usage(guild_id, created_at)
- idx_ai_usage_created_at ON ai_usage(created_at)
- idx_ai_usage_user_created ON ai_usage(user_id, created_at)

Inline migrations (already applied to production):
- ADD COLUMN guild_id to config + drop old PK + add composite PK
- ADD COLUMN guild_id to conversations
- ADD COLUMN user_id to ai_usage
- ADD COLUMN search_count to ai_usage

### 2. `src/transports/postgres.js` — `initLogsTable()`
- `logs` (id SERIAL PK, level VARCHAR(10), message TEXT, metadata JSONB, timestamp TIMESTAMPTZ)
- idx_logs_timestamp ON logs(timestamp)
- idx_logs_level ON logs(level)

### 3. `src/utils/restartTracker.js` — `ensureTable()`
- `bot_restarts` (id SERIAL PK, timestamp TIMESTAMPTZ, reason TEXT, version TEXT, uptime_seconds NUMERIC)

## Spec

### 1. Install node-pg-migrate
```bash
pnpm add node-pg-migrate
```

### 2. Create migration config
Create `migrations/.pgmigraterc` or configure in `package.json`. Use `DATABASE_URL` env var for connection.

### 3. Create initial migration
File: `migrations/001_initial-schema.js` (or .cjs — check ESM compat)

The initial migration must capture ALL existing tables/indexes in the correct order (respecting FK constraints):
1. config
2. conversations
3. mod_cases
4. mod_scheduled_actions (FK → mod_cases)
5. memory_optouts
6. ai_usage
7. logs
8. bot_restarts

**CRITICAL:** The initial migration must be idempotent for existing databases. Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` so it's safe to run against a database that already has these tables.

The `down` migration should drop tables in reverse FK order.

### 4. Refactor `src/db.js`
- Remove ALL inline DDL from `initDb()`
- Keep: pool creation, connection test, pool error handler
- Add: run migrations via node-pg-migrate programmatic API after connection test
- The `initDb()` function should: connect → test → run pending migrations → return pool
- Keep `getPool()` and `closeDb()` as-is

### 5. Refactor `src/transports/postgres.js`
- Remove `initLogsTable()` function (table now created by migration)
- Remove the export
- Update any callers (db.js calls `initLogsTable(pool)`)

### 6. Refactor `src/utils/restartTracker.js`
- Remove `ensureTable()` function
- Remove the self-healing auto-create in `getRestarts()` catch block
- The table will always exist after migrations run

### 7. Add package.json scripts
```json
{
  "migrate": "node-pg-migrate up",
  "migrate:up": "node-pg-migrate up",
  "migrate:down": "node-pg-migrate down",
  "migrate:create": "node-pg-migrate create"
}
```

### 8. Update tests
- Update db.test.js to mock/skip migration runs
- Update any tests that depend on `initLogsTable`
- Add migration-specific tests if appropriate
- Ensure all existing tests still pass

### 9. Docker consideration
If a Dockerfile exists, update entrypoint to run `pnpm migrate:up` before `pnpm start`.
If no Dockerfile, document the migration step in README or a MIGRATIONS.md.

## IMPORTANT: Progressive Commits
- **Commit after EACH major step** — do NOT batch everything
- Expected duration: ~25 minutes
- Use conventional commits: `feat(migrations):`, `refactor(db):`, etc.

## Acceptance Criteria
- [ ] `node-pg-migrate` installed as dependency
- [ ] Initial migration captures all 9 tables + all indexes
- [ ] Initial migration is idempotent (safe on existing DBs)
- [ ] `src/db.js` — no inline DDL, runs migrations programmatically
- [ ] `src/transports/postgres.js` — `initLogsTable` removed
- [ ] `src/utils/restartTracker.js` — `ensureTable` removed, no self-healing DDL
- [ ] `package.json` has migrate scripts
- [ ] All existing tests pass
- [ ] New migration tests added
- [ ] Down migration drops tables in correct FK order

## Constraints
- ESM only (`"type": "module"`), single quotes, semicolons, 2-space indent
- Use Winston for logging, NEVER console.*
- node-pg-migrate must work with ESM — check compatibility, may need .cjs migration files
- `DATABASE_URL` is the connection string env var

## Results
_[Fill in after completing work]_
