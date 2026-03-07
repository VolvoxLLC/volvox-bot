# Task: Comprehensive Warning System (#250)

## Branch: `feat/issue-250-warning-system`
## Closes: #250

## Context
There's already a basic `/warn` command (`src/commands/warn.js`) that creates `mod_cases` entries and has auto-escalation in `src/modules/moderation.js`. We need to build out the full warning lifecycle.

## What Exists
- `/warn` command → creates a mod_case with action='warn'
- `mod_cases` table (guild_id, target_id, moderator_id, action, reason, case_number, created_at)
- `checkEscalation()` in moderation.js — checks warn count against thresholds
- `executeModAction()` utility in `src/utils/modAction.js`
- Audit log integration (`src/api/routes/auditLog.js`)
- Members API already queries warning counts

## Deliverables

### 1. Database Migration
Create migration `007_warnings.cjs`:
- Add `expires_at TIMESTAMPTZ` column to `mod_cases` (nullable, for decay/expiry)
- Add `expired BOOLEAN DEFAULT false` column to `mod_cases`
- Add `edited_at TIMESTAMPTZ` column to `mod_cases`
- Add `edited_by VARCHAR(20)` column to `mod_cases`
- Add `original_reason TEXT` column to `mod_cases` (stores original before edit)
- Add `removed BOOLEAN DEFAULT false` column to `mod_cases`
- Add `removed_by VARCHAR(20)` column to `mod_cases`
- Add `removed_at TIMESTAMPTZ` column to `mod_cases`
- Add index on `(guild_id, target_id, action, expired, removed)` for active warning queries

### 2. New Commands

#### `/warnings <user>` — View warning history
- Shows paginated warning list for a user (embed with fields)
- Shows active (non-expired, non-removed) count prominently
- Each warning: case #, reason, moderator, date, status (active/expired/removed)
- Mod or admin

#### `/editwarn <case_number> <new_reason>` — Edit a warning reason
- Updates reason, stores original in `original_reason`, sets `edited_at` and `edited_by`
- Creates audit log entry
- Mod or admin

#### `/removewarn <case_number> [reason]` — Remove/void a warning
- Soft-deletes: sets `removed=true`, `removed_by`, `removed_at`
- Does NOT delete the record (audit trail)
- Creates audit log entry
- Mod or admin

#### `/clearwarnings <user> [reason]` — Clear all active warnings for a user
- Bulk soft-delete all active warnings
- Creates audit log entry
- Mod or admin, requires confirmation

**IMPORTANT:** Also update `src/commands/warn.js` to change `adminOnly = true` to `adminOnly = false` (or use moderator permission check). All warning commands should be usable by moderators, not just admins.

### 3. Warning Decay/Expiry Engine
In `src/modules/moderation.js` or new `src/modules/warningDecay.js`:
- On bot startup and on a configurable interval (default: every hour), scan for expired warnings
- Mark `expired=true` where `expires_at < NOW()` and `expired=false` and `removed=false`
- `checkEscalation()` should only count active warnings (not expired/removed)
- Config: `moderation.warnings.decayDays` (default: null = never expire)
- When a new `/warn` is issued, set `expires_at = NOW() + decayDays` if configured

### 4. Escalation Improvements
Update `checkEscalation()` in `src/modules/moderation.js`:
- Only count active warnings (`expired=false AND removed=false`)
- Support configurable escalation actions: `timeout`, `kick`, `ban`
- Config schema: `moderation.escalation.thresholds[].action` (currently hardcoded)

### 5. DM Notification
When a warning is issued:
- If `moderation.warnings.dmNotification` is true (default: true), DM the user
- Message: "You have been warned in {server} for: {reason}. You now have {count} active warning(s)."
- Gracefully handle blocked DMs (log warning, don't fail)

### 6. API Routes
Create `src/api/routes/warnings.js`:
- `GET /api/v1/guilds/:guildId/warnings` — list warnings (paginated, filterable by user)
- `GET /api/v1/guilds/:guildId/warnings/:caseNumber` — single warning detail
- `PATCH /api/v1/guilds/:guildId/warnings/:caseNumber` — edit reason
- `DELETE /api/v1/guilds/:guildId/warnings/:caseNumber` — soft-remove
- `DELETE /api/v1/guilds/:guildId/users/:userId/warnings` — clear all for user
- All routes require auth + admin permission check

### 7. Config Schema
Add to config defaults:
```json
{
  "moderation": {
    "warnings": {
      "dmNotification": true,
      "decayDays": null,
      "maxPerPage": 10
    }
  }
}
```

### 8. Tests
Create `tests/commands/warnings.test.js`:
- Test `/warn` creates case with correct fields
- Test `/warnings` shows history
- Test `/editwarn` updates reason + audit trail
- Test `/removewarn` soft-deletes + audit trail
- Test `/clearwarnings` bulk removes
- Test escalation only counts active warnings
- Test decay engine marks expired warnings
- Test DM notification (success + blocked DM)
- Test API routes (CRUD + auth)
- Test pagination

## Important Notes
- Follow existing patterns in `src/commands/` and `src/utils/modAction.js`
- Use Winston logger from `src/logger.js`, NEVER `console.*`
- Use existing `checkPermissions` patterns for admin checks
- Keep the migration backward-compatible (all new columns nullable/default)
- Run `pnpm lint && pnpm test` before committing
- Commit progressively (migration first, then commands, then tests)
