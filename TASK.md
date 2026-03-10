# TASK: Fix PR #267 review comments — log-stream ticket auth

Branch: `codex/fix-log-stream-ticket-authorization-issue`
Work in: `/home/bill/worktrees/volvox-bot-pr-267`

## Thread 1 — sendFilter useCallback dependency array
File: `web/src/lib/log-ws.ts` line 272

`sendFilter` callback has `[guildId]` in its dependency array but `guildId` is NOT used inside the callback body (only `wsRef.current` and `filter` are used). Remove `guildId` from the dependency array.

## Thread 2 — clearLogs useCallback dependency array
File: `web/src/lib/log-ws.ts` line 276

`clearLogs` callback has `[guildId]` in its dependency array but `guildId` is NOT referenced inside (only `setLogs([])` is called). Remove `guildId` from the dependency array (should be `[]`).

## Thread 3 — Wrong log tag in test
File: `web/tests/api/log-stream-ws-ticket.test.ts` line 57

The test expects tag `'[api/logs/ws-ticket]'` but the route file is at `api/log-stream/ws-ticket`, so the actual tag should be `'[api/log-stream/ws-ticket]'`.

Fix: Read the actual route file to confirm which tag string it uses, then update the test assertion to match.

## Rules
- Run `pnpm --prefix web lint && pnpm --prefix web typecheck` before finishing
- Do NOT push
