# TASK: Issue #123 — Dashboard audit log

## Context
Branch: `feat/issue-123`, Repo: VolvoxLLC/volvox-bot
Work in: `/home/bill/worktrees/volvox-bot-123`

## What to implement

### 1. Database migration
- Create `migrations/013_audit_log.cjs` (next migration after 012 placeholder)
- Table: `audit_logs` with columns:
  - `id SERIAL PRIMARY KEY`
  - `guild_id VARCHAR(20) NOT NULL`
  - `user_id VARCHAR(20) NOT NULL` — Discord user who took the action
  - `user_tag VARCHAR(100)` — cached display name
  - `action VARCHAR(100) NOT NULL` — e.g. 'config.update', 'member.xp.adjust', 'warning.create'
  - `target_type VARCHAR(50)` — e.g. 'config', 'member', 'warning'
  - `target_id VARCHAR(100)` — e.g. guild ID, user ID, warning ID
  - `details JSONB` — before/after diff or action-specific data
  - `ip_address VARCHAR(45)` — client IP (optional)
  - `created_at TIMESTAMPTZ DEFAULT NOW()`
- Index: `(guild_id, created_at DESC)`, `(guild_id, user_id)`

### 2. Backend: audit logger module
- Create `src/modules/auditLogger.js`
- `logAuditEvent(guildId, userId, userTag, action, details, options?)` — inserts to audit_logs
- Graceful: if DB unavailable, log warning but don't throw

### 3. Express middleware
- Create `src/api/middleware/auditLog.js`
- Auto-logs all mutating requests (POST/PUT/PATCH/DELETE) that have authenticated sessions
- Captures: guild_id (from params), user_id + user_tag (from session), action (from method + path), IP
- Attach as middleware AFTER auth middleware on guild routes

### 4. Instrument key actions manually
- Config update in `src/api/routes/config.js` → log before/after diff in `details`
- XP adjust in `src/api/routes/members.js` → log amount + reason
- Warning create/remove/clear in `src/api/routes/warnings.js`

### 5. API route
- Create `src/api/routes/auditLog.js`
- `GET /api/v1/guilds/:guildId/audit-log` with:
  - Pagination: `?page=1&limit=50`
  - Filters: `?userId=`, `?action=`, `?from=`, `?to=`
- Register in `src/api/index.js`

### 6. Dashboard page
- Create `web/src/app/dashboard/[guildId]/audit-log/page.tsx`
- Table with columns: Time, Admin, Action, Target, Details
- Expandable rows showing full `details` JSONB
- Filter controls: date range, action type, user search
- Use existing patterns from moderation cases page

### 7. Next.js API proxy
- Create `web/src/app/api/guilds/[guildId]/audit-log/route.ts`
- Forward to bot API with auth

### 8. Sidebar nav entry
- Add "Audit Log" to dashboard sidebar navigation
- Check `web/src/components/layout/sidebar.tsx`

### 9. Tests
- Unit tests for `auditLogger.js`
- Integration tests for the API route

## Rules
- Commit each section separately
- Run `pnpm format && pnpm lint && pnpm test` and `pnpm --prefix web lint && pnpm --prefix web typecheck`
- Everything configurable through dashboard (retention days setting)
- Do NOT push

Closes #123
