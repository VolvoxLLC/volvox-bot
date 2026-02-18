# CODING.md — Sub-Agent Playbook

> **If you're a sub-agent:** This is your rulebook. Follow it exactly.
> **If you're Pip Build main session:** This documents what sub-agents must do.

## 1. Codesession Tracking (MANDATORY — DO NOT SKIP)

Track the ENTIRE session — no exceptions. Always use `--json` on every `cs` command.
**If you skip any of these steps, the session is incomplete and Bill will notice.**

### How It Works (v2.1.0+)

Codesession resolves sessions by **CWD / git root**. As long as each sub-agent runs from its own worktree, parallel sessions just work — no `--session <id>` needed. All commands (`start`, `log-ai`, `note`, `status`, `end`) auto-resolve to the correct session based on your working directory.

### Step-by-step (EVERY sub-agent session):

**FIRST THING — start session FROM THE WORKTREE DIRECTORY:**

```bash
cd /tmp/bills-bot-<branch>   # MUST be in worktree dir so cs tracks the right git root
cs start "task description" --json
```

⚠️ If you run `cs start` from the wrong directory, file changes and commits won't be tracked.
⚠️ `cs start` only blocks if there's already an active session for the same directory/git root.

**After EVERY Codex CLI invocation**, log the AI call:

```bash
cs log-ai -p openai -m gpt-5.3-codex --prompt-tokens <n> --completion-tokens <n> --json
```

⚠️ **THIS IS THE MOST IMPORTANT STEP.** If you skip `cs log-ai`, the session shows 0 tokens and 0 cost — making it look like nothing happened. Extract token counts from Codex output. If you can't get exact numbers, estimate. **NEVER skip this.**

**At every meaningful step** (starting work, reading code, found an issue, making changes, tests passing, pushing, etc.):

```bash
cs note "detailed description of what you're doing and why" --json
```

**Be verbose** — don't write "working on memory module", write "adding opt-out toggle to /memory command — storing state in Set + JSON persistence, wiring into extractAndStoreMemories skip logic". Minimum 3-5 notes per session. We need full visibility.

**Before expensive operations** (large refactors, multiple Codex calls):

```bash
cs status --json   # check aiCost field, warn if > $5
```

**LAST THING you do (after all work is done, pushed, threads resolved):**

```bash
cs end -n "detailed summary: files changed, tests added/modified, coverage numbers, commit SHAs, what was done" --json
```

### Checklist — verify you did ALL of these:

- [ ] `cd` into worktree BEFORE `cs start`
- [ ] `cs start` at the very beginning
- [ ] Stay in the worktree dir for ALL `cs` commands (auto-resolves to correct session)
- [ ] `cs log-ai` after EVERY AI/Codex call (non-negotiable — 0 tokens = broken session)
- [ ] `cs note` with detailed descriptions at meaningful steps (minimum 3-5 per session)
- [ ] `cs status` before expensive ops
- [ ] `cs end` with detailed summary at the very end
- [ ] Final check: `cs status --json` — verify aiTokens > 0 and filesChanged > 0

Read `skills/codesession/SKILL.md` for full details.

## 2. Codex CLI (MANDATORY — NON-NEGOTIABLE)

Use `codex` CLI for ALL programming work. Do NOT hand-write code patches using edit/write tools.
Default model is `gpt-5.3-codex` (set in `~/.codex/config.toml`). Approval mode is `full-auto`.

```bash
exec pty:true workdir:<project-dir> command:"codex exec '<task description>'"
```

- **`codex exec` is REQUIRED for all code writing** — this is non-negotiable
- `full-auto` is the default — auto-approves changes in workspace
- Use `--yolo` for maximum speed (no sandbox, no approvals) since sub-agents work in isolated worktrees
- Monitor with `process:log`, don't hand-code patches
- After Codex finishes, log token usage with `cs log-ai`
- If you write code directly with edit/write tools instead of using `codex` CLI, the session is invalid

## 3. Git Workflow

- **Git worktrees MANDATORY** — NEVER checkout branches in the main repo directory. Always create a worktree:
  ```bash
  cd /home/bill/.openclaw/workspace-build/bills-bot
  git worktree add /tmp/bills-bot-<branch-name> -b <branch-name>
  cd /tmp/bills-bot-<branch-name>
  # Do all work here. Clean up when done:
  git worktree remove /tmp/bills-bot-<branch-name>
  ```
  This keeps parallel sub-agents isolated. NON-NEGOTIABLE.
- **Feature branches only** — never commit directly to main
- **Conventional commits** — `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`
- **PRs mandatory** for shared repos
- **One commit per review comment** on PR review tasks
- **Check for outdated packages** before every PR (`pnpm outdated`)
- **80% test coverage mandatory** — statements, branches, functions, lines
- **Always fix nitpick comments** — unless they don't make sense, would break things, or are redundant

## 4. Board Comments (when task has a board ID)

```bash
# Start timer BEFORE working:
vk begin <taskId>

# Comment at EVERY meaningful step (not just start/end):
vk comment <taskId> "Starting work — reading codebase" --author "Pip Code"
vk comment <taskId> "Found issue in X — applying fix" --author "Pip Code"
vk comment <taskId> "Tests passing, committing" --author "Pip Code"

# When done:
vk done <taskId> "summary of work" --author "Pip Code"
```

Do NOT mark a task done until ALL `verificationSteps` are met.

- While executing a board task, keep **subtasks** updated in real time (mark completed ones as checked/done).
- Keep **done criteria / verificationSteps** updated in real time (check each item as it is verified).
- Final `vk done` only after subtasks and verificationSteps are accurately checked off.
- **End-of-task requirement:** before closing, explicitly verify every done-criteria item is both (a) actually completed in the work and (b) marked completed in the board.
- **Merge Conflict Check:** before finishing, check for merge conflicts with the target branch and fix them if they exist.

## 5. PR Review Thread Resolution

After fixing each review comment, resolve the thread on GitHub:

```bash
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "THREAD_ID"}) { thread { isResolved } } }'
```

**⚠️ PAGINATION IS MANDATORY when fetching threads.** GitHub GraphQL `reviewThreads(first:100)` returns max 100 per page. If a PR has 100+ threads, you MUST paginate using `pageInfo{hasNextPage endCursor}` and loop with `after:` cursor. We once missed 22 threads because we only fetched page 1. Use this pattern:

```bash
# Fetch ALL unresolved threads across all pages
CURSOR=""
while true; do
  if [ -z "$CURSOR" ]; then
    QUERY="reviewThreads(first:100)"
  else
    QUERY="reviewThreads(first:100,after:\"$CURSOR\")"
  fi
  # ... fetch, collect unresolved threads, check hasNextPage, update CURSOR
  # Break when hasNextPage is false
done
```

Do **not** post a summary comment on the GitHub PR unless Bill explicitly asks.

Instead, report completion details back to the parent agent (what was fixed, commits, tests, thread resolution), and let the parent agent report to Bill.

- **Merge Conflict Check:** before finishing, check for merge conflicts with the target branch and fix them if they exist.

This does **not** change board behavior: for board-linked tasks, continue posting verbose board comments (`vk comment ... --author "Pip Code"`) and keeping subtasks/done-criteria updated.

## 6. Testing

- Run `pnpm test` — all tests must pass
- Coverage must stay above 80% on all metrics
- New code must include tests
- Use `vitest` — project is already configured

## 7. Code Standards

- **Winston logger only** — NEVER use `console.*` in src/ files (Biome `noConsole: error`)
- **Keep docs up to date** — README.md, AGENTS.md, CONTRIBUTING.md, .env.example
- **bills-bot stack:** Node.js ESM, discord.js v14, pnpm, Biome, vitest

## Key Paths

- **bills-bot repo:** `/home/bill/.openclaw/workspace-build/bills-bot/`
- **Board API:** `http://localhost:3001`
- **Board CLI:** `vk <command>`
