## Architecture

This is a Discord bot (discord.js) with an Express API server and a Next.js web dashboard.

- **Backend:** Node.js ESM, Express, PostgreSQL (via pg), Winston logging
- **Frontend:** Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui
- **Database:** Migrations via node-pg-migrate (migrations/ directory)

## Code Style

- ESM only — no CommonJS except migration files (.cjs)
- Single quotes, semicolons, 2-space indent (Biome enforced)
- Explicit return types on public TypeScript APIs
- Functions should be focused and small

## Security

- All API endpoints must validate the x-api-secret header via isValidSecret()
- WebSocket connections require HMAC ticket authentication
- Never log secrets, tokens, or sensitive user data
- SQL queries must always be parameterized

## Testing

- Tests use Vitest with vi.mock() for dependencies
- New functionality must include tests
- Tests should cover both happy path and error cases

## Database

- Schema changes go through node-pg-migrate migrations, never inline DDL
- Use getPool() from src/db.js for database access
- Always handle pool.query errors gracefully
