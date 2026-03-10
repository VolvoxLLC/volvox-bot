# TASK: Fix remaining 21 review threads on PR #248

Branch: `refactor/triage-prompt-rewrite`
Work in: `/home/bill/worktrees/volvox-bot-248`

## Threads to fix

### maintain-docs.md
1. Add `# Maintain Docs` top-level heading (markdownlint)
2. Replace hardcoded date `2026-03-04` with `YYYY-MM-DD` placeholder + comment
3. Capitalize "Markdown" as proper noun
4. Line 20 — fix whatever workflow issue CodeRabbit flagged (read the file)
5. Line 61 — branch naming: CodeRabbit says `copilot/` prefix is required for GitHub Copilot coding agent branches — read the file and fix the branch naming if it uses a non-compliant format

### Backend
6. `tests/modules/triage-prompt.test.js` line 278 — add test that channel metadata with tag-like chars is escaped via `escapePromptDelimiters()`
7. `src/prompts/community-rules.md` line 15 — change `mute` to `timeout` in the moderation ladder (classifier only supports `warn`, `timeout`, `kick`, `ban`, `delete`)
8. `src/prompts/triage-classify.md` line 26 — update stale example `Rule 4: No spam/shilling` to match current rule `Rule 4: No spam or drive-by promotion`

### Frontend — config-sections
9. `web/src/components/dashboard/config-sections/AiAutoModSection.tsx` line 16 — import `inputClasses` from the shared module (`config-sections/shared.ts`) instead of defining it locally
10. `web/src/components/dashboard/config-sections/ChallengesSection.tsx` line 73 — constrain `postTime` to a real clock value (use `type="time"` input or validate `HH:MM` format before saving)
11. `web/src/components/dashboard/config-sections/ModerationSection.tsx` line 259 — `blockedDomains` currently only updates `draftConfig` on `onBlur`. Change to update on `onChange` (or both) so saves don't miss in-progress edits
12. `web/src/components/dashboard/config-sections/TicketsSection.tsx` line 139 — read the file and fix whatever issue CodeRabbit found
13. `web/src/components/dashboard/config-sections/TriageSection.tsx` line 225 — `moderationLogChannel` was regressed to a plain text input; restore it to use a `ChannelSelector` component
14. `web/src/components/dashboard/config-sections/StarboardSection.tsx` — fix whatever major issue was flagged (read file)
15. `web/src/components/dashboard/config-sections/GitHubSection.tsx` line 43 — read and fix
16. `web/src/components/dashboard/config-sections/ChallengesSection.tsx` — read and fix the major issue
17. `web/src/components/dashboard/config-sections/CommunityFeaturesSection.tsx` line 76 — use stricter type for feature config entries instead of `as { enabled?: boolean } | undefined`

### Frontend — lib
18. `web/src/lib/config-updates.ts` — restrict `section` type to object-valued config sections (not `keyof GuildConfig` which includes scalars)
19. `web/src/lib/config-normalization.ts` line 80 — clamp `decimalToPercent` to [0, 100] for symmetry with `percentToDecimal`

### Frontend — config-editor
20. `web/src/components/dashboard/config-editor.tsx` line 451 — Ctrl+S silently fails and blocks browser save when there are validation errors. Fix: only call `e.preventDefault()` when we're actually handling the save (i.e., `hasChanges && !hasValidationErrors`), otherwise let the browser default fire

## Rules
- Commit each logical group separately with conventional commits  
- Run `pnpm format && pnpm lint` and `pnpm --prefix web lint && pnpm --prefix web typecheck`
- Do NOT push
