# TASK: Fix PR #268 review comments — notification routes guild admin auth

Branch: `codex/fix-missing-guild-admin-checks-on-webhooks`
Work in: `/home/bill/worktrees/volvox-bot-pr-268`

## Thread 1 — Add JSDoc to normalizeGuildParam middleware
File: `src/api/routes/notifications.js` line 22

Add a JSDoc comment explaining what `normalizeGuildParam` does (sets `req.params.id` from the guild query param), following the pattern in `src/api/routes/warnings.js` (`adaptGuildIdParam`).

## Thread 2 — Add test coverage for new guild admin auth enforcement
File: `tests/api/routes/notifications.test.js` (or wherever notifications tests live)

Add tests covering:
- OAuth non-admin user → 403
- OAuth admin user → 200
- Missing guildId → 400 (if applicable)

Read the existing test file to understand the pattern, then add the missing cases.

## Rules
- Run `pnpm format && pnpm lint && pnpm test` before finishing
- Do NOT push
