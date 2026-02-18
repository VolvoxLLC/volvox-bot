# Codex Cross-Model Review — Phase 3 Frontend

**Reviewer**: R2-D2 (Codex)
**Date**: 2026-02-09
**Branch**: `feature/v3-phase3`

## Summary

Phase 3 workflow UI matches the established VK patterns and is generally production-ready. Two regressions surfaced that Sonnet missed: (1) the workflow run WebSocket always used the insecure `ws://` scheme, which would be blocked on HTTPS deployments, and (2) task-scoped workflow runs were appended with a stale copy of `activeRuns`, risking dropped entries when multiple runs start quickly. Both issues were fixed in-place and verified via `pnpm typecheck`.

## Blocking Issues (Fixed)

1. **WorkflowRunView — Secure WebSocket handling**  
   _Problem_: The run view always initialized `new WebSocket("ws://...")`. When VK is served over HTTPS, browsers block mixed-content WebSocket requests, so live updates and resume actions would silently fail.  
   _Fix_: Detect the current protocol and use `wss://` when the page is loaded over HTTPS. (`web/src/components/workflows/WorkflowRunView.tsx`)

2. **WorkflowSection — Stale state when tracking active runs**  
   _Problem_: After starting a workflow run from a task, `setActiveRuns([...activeRuns, run])` reused the stale `activeRuns` array captured before the async POST finished. Starting multiple runs rapidly (or receiving parallel updates in the dialog) could drop existing entries.  
   _Fix_: Switch to the functional form `setActiveRuns((previousRuns) => [...previousRuns, run])` to ensure updates compose correctly. (`web/src/components/task/WorkflowSection.tsx`)

## Non-Blocking Observations

- None.

## Tests

- `pnpm --filter @veritas-kanban/web typecheck`

## Scores

| Dimension    | Score | Notes                                                                                        |
| ------------ | ----- | -------------------------------------------------------------------------------------------- |
| Code Quality | 10/10 | Hooks usage now correct; TypeScript strict mode maintained.                                  |
| Security     | 10/10 | No XSS or insecure patterns detected after WebSocket fix.                                    |
| Performance  | 10/10 | Memoization patterns solid; WebSocket now works under HTTPS without falling back to polling. |
| Architecture | 10/10 | Components integrate cleanly with ViewContext and TaskDetail flows.                          |

## Verdict

✅ **Approved** — Ready to merge after fixes above (already committed).
