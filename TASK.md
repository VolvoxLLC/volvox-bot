# TASK: Issue #249 — Only show manageable servers for mod/admin

## Context
PR for VolvoxLLC/volvox-bot, branch `feat/issue-249`
Issue: https://github.com/VolvoxLLC/volvox-bot/issues/249

## Problem
Dashboard server list shows ALL servers the user is in. Should only show servers where user has mod/admin privileges as "manageable". Other servers should show a public link/CTA instead.

## What to implement

### Backend: Role check endpoint
- There's already a `GET /api/v1/guilds/:id/role` endpoint (check `src/api/routes/guilds.js`)
- Check `src/api/utils/dashboardRoles.js` for role hierarchy: viewer, moderator, admin, owner
- May need a batch endpoint or modify the guilds list endpoint to include role info

### Frontend: Server selector filtering
- File: `web/src/components/layout/server-selector.tsx` — this is the guild picker
- File: `web/src/hooks/use-guild-role.ts` — hook for fetching user role per guild  
- File: `web/src/lib/discord.ts` — Discord API utilities
- Modify the server list to categorize servers:
  - **Manageable** (mod/admin/owner): show "Manage" button → opens dashboard
  - **Member-only** (viewer): show "View Public Page" button → links to `/community/:guildId`
- Add visual distinction (badge, opacity, section divider)

### Key files to check
- `web/src/components/layout/sidebar.tsx` — may have navigation filtering by role
- `web/src/hooks/use-guild-role.ts` — existing role hook
- `web/src/app/api/guilds/[guildId]/role/route.ts` — Next.js role proxy

## Rules
- **Everything in config.json must be configurable through the dashboard**
- Commit after EVERY file change with conventional commit format
- Run `pnpm --prefix web lint && pnpm --prefix web typecheck` before final commit
- Do NOT push — just commit locally

Closes #249
