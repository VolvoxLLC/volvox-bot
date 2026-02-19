# MEMORY.md — Pip Build Long-Term Memory

## Key Facts

- **Owner:** Bill — Founder & CEO of Volvox (<https://volvox.dev>)
- **Timezone:** EST (New Jersey)
- **Communication style:** Direct, snarky, witty humor, no fluff
- **Discord components v2:** Always use `components` (buttons, selects, modals) in messages whenever appropriate — status reports, PR updates, task prompts, confirmations, interactive choices. ⚠️ Rendering issue: `message` tool returns `ok: true` but components don't render in Discord. `agentComponents` capability was NOT real — don't invent config values. Still investigating.
- **Sibling agent:** Pip (personal assistant, agent ID: main)

## Active Projects

- **bills-bot** — Discord bot (`/home/bill/.openclaw/workspace-build/bills-bot/`)
  - Repo: `https://github.com/BillChirico/bills-bot`
  - Stack: Node.js ESM, discord.js v14, pnpm, Biome, vitest, Winston
  - Railway DB: `postgresql://postgres:kxYyAlScRsIWqlvdDPhjguLVyriwPxfV@postgres.railway.internal:5432/railway` (internal only)
  - **Task tracking: GitHub Issues** (source of truth — NOT the Veritas Kanban board)

## Current PR Status

| PR  | Branch                                 | Status    | Notes                                                              |
| --- | -------------------------------------- | --------- | ------------------------------------------------------------------ |
| #14 | feat/db-config                         | ✅ MERGED | 10 review rounds                                                   |
| #15 | feat/deep-autocomplete-dynamic-welcome | ✅ MERGED | 10 review rounds                                                   |
| #16 | feat/repo-infrastructure               | ✅ MERGED | All Round 2 review threads resolved (+1 extra bugbot thread)       |
| #18 | feat/conversation-persistence          | ✅ MERGED | Merged at 2026-02-11 14:15 EST                                     |
| #57 | feat/ai-conversation-threading         | ✅ MERGED | Issue #23, 2 review rounds, 9 threads fixed                        |
| #59 | feat/user-memory-mem0                  | ✅ MERGED | Issue #24, merged Feb 16                                           |
| #60 | feat/web-dashboard-shell               | ✅ MERGED | Merged Feb 17                                                      |
| #64 | feat/railway-config                    | ✅ MERGED | Merged Feb 16                                                      |
| #65 | feat/persistent-logging                | ✅ MERGED | Merged recently                                                    |
| #67 | feat/config-events                     | ✅ MERGED | Merged recently (Issue #66)                                        |
| #70 | feat/rest-api                          | 🔄 REVIEW | Issue #29, Batches A+C done (17/25), Batch B + patrol rate-limited |

## Feature Pipeline (Bill-approved order)

1. ✅ DB Config Persistence (PR #14 — merged)
2. ✅ Repo Infrastructure (PR #16 — merged)
3. ✅ Conversation Persistence (PR #18 — merged)
4. ✅ AI Conversation Threading (PR #57 — merged)
5. ✅ User Memory via mem0 (PR #59 — merged Feb 16)
6. ✅ Mention Gate (PR #62 — merged Feb 16)
7. ✅ Web Dashboard Shell (PR #60 — merged Feb 17)
8. ✅ Railway Config (PR #64 — merged Feb 16)
9. ✅ Persistent Logging (PR #65 — merged)
10. ✅ Config Change Event System (PR #67 — merged)
11. 🔄 Dashboard REST API (PR #70 — Issue #29, Batches A+C done, Batch B rate-limited)
12. ⬜ Analytics Dashboard (Issue #30 — blocked by #29)
13. ⬜ Per-Guild Configuration (Issue #71 — multi-tenancy refactor)
14. ⬜ Warning System (Issue #38 — next priority after current PRs)

## GitHub Issues Structure (bills-bot)

**ALWAYS use sub-issues** when creating or referencing bills-bot issues.

| Parent Issue | Title                   | Sub-issues         |
| ------------ | ----------------------- | ------------------ |
| #21          | 🧪 Testing Suite        | — (standalone)     |
| #22          | 🤖 AI Enhancement       | #23, #24, #25, #26 |
| #27          | 🖥️ Web Dashboard        | #28-#36            |
| #37          | 🛡️ Moderation           | #38, #39           |
| #40          | 🎯 Community Engagement | #41-#53            |
| #54          | ⚙️ Persistent Logging   | — (standalone)     |

**To add sub-issue via GraphQL:**

```bash
gh api graphql -f query='mutation { addSubIssue(input: {issueId: "<parent-node-id>", subIssueId: "<child-node-id>"}) { issue { number } subIssue { number } } }'
```

## mem0 — Shared Agent Memory (NON-NEGOTIABLE)

- **Access:** `mcporter call mem0.add_memory text="..."` / `mcporter call mem0.search_memory query="..."`
- Log after: every significant decision, completed task, config change, workflow discovery
- Search before acting when unsure about prior decisions

## Sub-Agent Workflow

### Rules (read `CODING.md` for full details)

- **Session model:** `anthropic/claude-opus-4-6`, thinking: `"high"` (orchestration)
- **Code writing:** Codex CLI (`codex exec`) — model `gpt-5.3-codex`, `full-auto` mode
- **One sub-agent per PR** — never batch. Parallel, not sequential.
- **Use `CODING.md`** — all mandatory rules are there (codesession, Codex CLI, git, board, tests)
- **Always fix nitpicks** — unless nonsensical, would break things, or redundant

### Spawn Templates

**Codesession v2.1.0+:** Sessions auto-resolve by CWD/git root. No `--session <id>` needed — just stay in the worktree dir.

**GitHub Issue Task:**

```
sessions_spawn(
  agentId: "build",
  model: "anthropic/claude-opus-4-6",
  thinking: "high",
  task: "
    Read and follow CODING.md for all workflow rules.
    USE GIT WORKTREE — do NOT checkout in the main repo. Create: git worktree add /tmp/bills-bot-<branch> -b <branch>
    CODEX CLI — use `codex exec '<task>'` for ALL programming (pty:true required). Do NOT hand-write code with edit/write tools. Default model is gpt-5.3-codex, full-auto mode. Use --yolo for max speed in isolated worktrees.
    CODESESSION — cd into worktree FIRST, then:
    - cs start FIRST (auto-resolves by git root — parallel-safe as long as each agent uses its own worktree)
    - cs log-ai after EVERY Codex call (extract token counts — 0 tokens = broken session). Use: cs log-ai -p openai -m gpt-5.3-codex --prompt-tokens <n> --completion-tokens <n> --json
    - cs note with DETAILED descriptions at every step (minimum 3-5, verbose)
    - cs end LAST with detailed summary
    - Final sanity check: cs status --json must show aiTokens > 0 and filesChanged > 0

    TASK: <title> (Issue #<N>)
    ISSUE: https://github.com/BillChirico/bills-bot/issues/<N>
    DESCRIPTION: <description>
    PRIORITY: <priority>
    REPO: /home/bill/.openclaw/workspace-build/bills-bot/

    ACCEPTANCE CRITERIA:
    <from the issue>

    DO THE WORK:
    <specific instructions>
  "
)
```

**PR Review:**

```
sessions_spawn(
  agentId: "build",
  model: "anthropic/claude-opus-4-6",
  thinking: "high",
  task: "
    Read and follow CODING.md for all workflow rules.
    USE GIT WORKTREE — do NOT checkout in the main repo. Create: git worktree add /tmp/bills-bot-<branch> <branch>
    CODEX CLI — use `codex exec '<task>'` for ALL programming (pty:true required). Do NOT hand-write code with edit/write tools. Default model is gpt-5.3-codex, full-auto mode. Use --yolo for max speed in isolated worktrees.
    CODESESSION — cd into worktree FIRST, then:
    - cs start FIRST (auto-resolves by git root — parallel-safe as long as each agent uses its own worktree)
    - cs log-ai after EVERY Codex call (extract token counts — 0 tokens = broken session). Use: cs log-ai -p openai -m gpt-5.3-codex --prompt-tokens <n> --completion-tokens <n> --json
    - cs note with DETAILED descriptions at every step (minimum 3-5, verbose)
    - cs end LAST with detailed summary
    - Final sanity check: cs status --json must show aiTokens > 0 and filesChanged > 0

    TASK: Address PR #<N> review comments — Round <R>
    PR: https://github.com/BillChirico/bills-bot/pull/<N>
    Branch: <branch>
    Repo: /home/bill/.openclaw/workspace-build/bills-bot/

    UNRESOLVED THREADS:
    <list threads with IDs, file paths, line numbers, descriptions>

    Fix all issues. One commit per fix. Resolve each thread. Report summary back to parent agent (do not post PR summary comment unless Bill explicitly asks).
  "
)
```

## Veritas Kanban (the board)

- **API:** `http://localhost:3001` · **CLI:** `vk <command>`
- **Projects:** `pip-build` (yellow), `bill-bot` (purple)
- **Sprint 1:** Feb 10–16 (ID: `sprint-1-foundation-E8UFrB`)
- **Sprint 2:** Feb 17–23 (ID: `sprint-2-YtRtwi`)
- **Restart:** `cd veritas-kanban/server && setsid node node_modules/tsx/dist/cli.mjs src/index.ts > /tmp/veritas-kanban.log 2>&1 &`
- **Quirks:** `vk done` needs `reviewComments` via API PATCH first · `verificationSteps` use `POST /api/v1/tasks/:id/verification` (PATCH strips them)

## Critical Rules

- **⚠️ Send periodic sub-agent updates to Bill** — proactively DM status. NON-NEGOTIABLE.
- **⚠️ Periodically monitor open PRs and fix review comments proactively** — Bill explicitly requested this.
- **⚠️ Use masked markdown links for PRs** in Discord updates (e.g. `[#17](<https://github.com/...>)`).
- **⚠️ PR Review Patrol cron** — `PR Review Patrol` every 15 min (job id: `041c005d-992e-440c-8521-c014a53ef7fb`) scans Bill's open PRs, spawns sub-agents (single or batched) to fix unresolved threads + top-level review summaries.
- **⚠️ Only review Bill's PRs (or my own)** — do NOT check, fix, or address PRs from anyone else unless Bill explicitly tells you to. This includes bot-authored PRs AND PRs from other contributors.
- **⚠️ bills-bot tasks: GitHub Issues is the source of truth** — not the Veritas Kanban board. Track work via issues, close them when done.
- **⚠️ PR comments rule** — sub-agents should NOT post GitHub PR summary comments unless Bill explicitly asks.
- **⚠️ PR review threads are PAGINATED (max 100/page)** — ALWAYS paginate when checking unresolved threads. GitHub GraphQL `reviewThreads(first:100)` returns max 100. If a PR has 100+ threads (PR #60 had 125), you WILL miss threads on page 2+. Use `pageInfo{hasNextPage endCursor}` and loop with `after:` cursor until `hasNextPage` is false. THIS IS NON-NEGOTIABLE — we missed 22 threads once because of this. Also applies to REST: use `gh api --paginate` for PR comments.
- **⚠️ Always check top-level/high-level PR review comments too** — not just inline threads. Review submissions (e.g., CHANGES_REQUESTED summary comments) can contain actionable feedback even when no unresolved thread remains.
- **⚠️ Merge conflict check** — sub-agents must check for and fix merge conflicts with the target branch at the end of every task.
- **⚠️ Never edit `openclaw.json` directly** — use `gateway config.patch` or `config.apply`
- **⚠️ `config.patch` array merge is SHALLOW** — include ALL fields when patching agent list items
- **⚠️ `main` agent must be explicit in `agents.list`** when any agents are listed
- **⚠️ Orchestration: Opus 4.6. Code writing: Codex CLI (gpt-5.3-codex)** — no Flash anywhere
- **⚠️ Bill needs to set `DATABASE_URL` in Railway** for bills-bot DB features
- **⚠️ Always use latest versions** — Next.js, Tailwind CSS, React, all dependencies. Bill's rule: latest stable versions of everything, no exceptions.
- **⚠️ Always use git worktrees for sub-agent work** — NEVER checkout branches in the main repo directory. Each sub-agent MUST create a worktree (`git worktree add /tmp/bills-bot-<branch> <branch>`) and work there. This keeps parallel work isolated. NON-NEGOTIABLE.
- **⚠️ Codex CLI for all sub-agent code work** — `codex exec '<task>'` on EVERY invocation (pty:true required). Default model is `gpt-5.3-codex`, approval mode `full-auto` (set in `~/.codex/config.toml`). Use `--yolo` for max speed in isolated worktrees. Sub-agents must NOT hand-write code with edit/write tools — use `codex` CLI for all programming.

## Infrastructure

See `TOOLS.md` for: MCP servers, endpoints, CLI tools, Tailscale IPs, codesession dashboard.

## Memory Rules

- Read `memory/YYYY-MM-DD.md` (today + yesterday) every session
- Update daily notes with what you worked on
- Push to mem0 after significant work
- Historical details live in `memory/` daily files — MEMORY.md is for active state only
