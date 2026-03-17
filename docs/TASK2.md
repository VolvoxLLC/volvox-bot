# TASK2: Remaining Issue #144 Items

Already done (skip these):
- Loading skeletons ✅
- Error boundaries ✅  
- Toast notifications ✅
- XP proxy validation ✅
- Rate limit stale cleanup ✅

## Items to implement now

### 1. Zustand store for member page
- File: `web/src/app/dashboard/[guildId]/members/page.tsx` (or similar)
- Find all useState/useEffect hooks managing member state
- Create `web/src/stores/members-store.ts` with Zustand
- Migrate: member list, loading state, search query, selected member, pagination
- Keep component using the store hooks

### 2. Zustand store for moderation page
- File: `web/src/app/dashboard/[guildId]/moderation/page.tsx` (or similar)
- Same pattern — create `web/src/stores/moderation-store.ts`
- Migrate: cases list, filters, loading, pagination

### 3. console.error cleanup in browser code
- `rg -rn "console\.error" web/src/` — find all occurrences in client components
- Replace with: use the dashboard logger (`web/src/lib/logger.ts`) for diagnostic logging and toast (`sonner`) for user-facing errors
- For bot/server code, use Winston (`src/logger.js`) — never use `console.*` directly
- Do NOT replace server-side console.error (only client components)

### 4. events.js function extraction
- File: `src/modules/events/` — check if there's a monolithic events file or inline handlers in interactionCreate.js
- Run: `wc -l src/modules/events/interactionCreate.js` to check size
- If handlers are inline (ticket_open, ticket_close, poll, etc.), extract each to separate files in `src/modules/handlers/`
- Update interactionCreate.js to import from handlers

### 5. Mobile responsiveness — critical fixes only
- `rg -rn "grid-cols-2\|grid-cols-3\|table\b" web/src/components/dashboard/ --include="*.tsx" | head -30`
- Add `sm:grid-cols-2` fallbacks where fixed grid-cols are used
- Add `overflow-x-auto` wrapper around data tables
- Focus on: member table, moderation cases table, config sections with grids

### 6. Migration gap — add placeholder comment
- Create `migrations/012_placeholder.cjs` with a comment explaining the gap
- Content: migration that logs a warning about the gap, does nothing (no-op)

### 7. Fix totalMessagesSent stat accuracy
- File: find where community page stats are calculated
- `rg -rn "totalMessagesSent\|messages_sent" web/src/ src/`
- Add a comment explaining the known limitation, or filter to last 30 days
- If it's a simple query change, fix it; if architectural, add a TODO comment

### 8. Review bot consolidation (GitHub config)
- Disable Copilot and Greptile PR reviewers — keep Claude (coderabbitai style) + CodeRabbit
- Check `.github/` for reviewer config files
- Check `CODEOWNERS` or `.github/pull_request_review_protection.yml`
- If via GitHub API: `gh api repos/VolvoxLLC/volvox-bot/automated-security-fixes`
- Note: Greptile may be configured in `.greptile.yaml` or via webhook — find and disable

## Architectural items (document only, don't implement)
These need separate planning — just add TODO comments:
- Server-side member search (needs Discord member cache or DB index)
- Conversation search pagination (needs full-text search index)
- Config patch deep validation (needs schema per config key)
- Logger browser shim (nice-to-have, low impact)

## Rules
- Commit each fix separately with conventional commits
- Run `pnpm format && pnpm lint && pnpm test`
- Run `pnpm --prefix web lint && pnpm --prefix web typecheck`
- Do NOT push
