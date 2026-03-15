# Database Migrations

Managed by [node-pg-migrate](https://github.com/salsita/node-pg-migrate).

## Commands

```bash
pnpm migrate          # Run all pending migrations
pnpm migrate:down     # Roll back the last migration
pnpm migrate:create   # Create a new migration file
```

## Numbering Convention

Migrations use sequential numeric prefixes: `001_`, `002_`, etc.

### Known Numbering Anomaly

Two migrations share the `004` prefix:

| File | Description |
|------|-------------|
| `004_performance_indexes.cjs` | Database performance indexes |
| `004_voice_sessions.cjs` | Voice session tracking table |

Both ran in production in alphabetical order. This is safe because node-pg-migrate
sorts migration files alphabetically, so `004_performance_indexes` always runs
before `004_voice_sessions`.

Four other files that originally had the `004` prefix were renumbered to `007`–`010`
to resolve an out-of-order conflict on production databases that had already applied
the two original `004_*` migrations.

Migration `012_placeholder.cjs` exists as a no-op to document this gap and ensure
the numbering sequence is monotonically increasing from slot 012 onward.

### Adding New Migrations

Always use the next available number:

```bash
# Check the highest-numbered migration
ls migrations/*.cjs | sort | tail -1
# Use the next number (e.g., if highest is 013, create 014)
```

## File Format

Migration files must use `.cjs` extension (CommonJS) because node-pg-migrate does
not support ESM. Use `exports.up` and `exports.down` syntax.
