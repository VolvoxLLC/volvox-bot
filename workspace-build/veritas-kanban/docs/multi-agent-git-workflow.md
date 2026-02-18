# Multi-Agent Git Workflow Guide

> Lessons learned from the VK v2.0 sprint where multiple AI agents worked on the same repository simultaneously.

## The Problem: Branch Collisions

When you spawn multiple sub-agents (via `sessions_spawn` or similar) and they all work on the same git repository, they share a **single working directory**. This causes:

1. **Branch stomping**: Agent A creates `feat/task-a`, Agent B creates `feat/task-b`, but `git checkout` in Agent B switches the entire working directory — Agent A's uncommitted changes are now on the wrong branch or lost.
2. **Mixed commits**: Both agents stage and commit files. Pre-commit hooks run against ALL staged files, including the other agent's work. Lint/typecheck failures from incomplete work block commits.
3. **Merge confusion**: Changes from different features end up interleaved in the same branch history.

### Real Example

During the v2.0 sprint, two Sonnet sub-agents were spawned in parallel:
- **Sonnet-1**: `feat/markdown-rendering-63` (frontend React work)
- **Sonnet-2**: `feat/cli-usage-reporting-50` (CLI TypeScript work)

Both worked in `~/Projects/veritas-kanban`. Sonnet-2's CLI changes ended up staged alongside Sonnet-1's React changes. The pre-commit hook tried to lint `MarkdownText.tsx` (Sonnet-1's file) during Sonnet-2's commit and failed because the file wasn't complete yet.

## Solutions

### Option 1: Sequential Execution (Simplest)

Run sub-agents one at a time on the same repo. Each agent:
1. Creates a feature branch
2. Does its work
3. Commits and merges to main
4. Main agent spawns the next sub-agent

**Pros**: No conflicts, no complexity
**Cons**: Slower (no parallelism)

**Best for**: Small teams, tasks that touch overlapping files

### Option 2: Git Worktrees (Recommended for Parallel)

Git worktrees let you have multiple working directories for the same repo, each on a different branch:

```bash
# Create worktrees for each agent
git worktree add ../vk-agent-1 -b feat/task-a
git worktree add ../vk-agent-2 -b feat/task-b

# Each sub-agent works in its own directory
# Agent 1 → ~/Projects/vk-agent-1/
# Agent 2 → ~/Projects/vk-agent-2/

# After work is done, merge from the main repo
cd ~/Projects/veritas-kanban
git merge feat/task-a
git merge feat/task-b

# Clean up
git worktree remove ../vk-agent-1
git worktree remove ../vk-agent-2
```

**Pros**: True parallelism, no branch conflicts, each agent has isolated workspace
**Cons**: More setup, disk space, orchestrator must manage worktree lifecycle

**Best for**: Large sprints, independent features, CI/CD parallel builds

### Option 3: Orchestrator Does Heavy Lifting, Delegates Light Tasks

The orchestrator (main agent) works directly on the repo for complex tasks. Sub-agents handle:
- Independent research (no git needed)
- Documentation writing (separate files)
- Code review (read-only)
- Tasks in different repos

**Pros**: Minimal coordination overhead
**Cons**: Limited parallelism on same repo

**Best for**: Mixed workloads where some tasks don't need the repo

## Sub-Agent Task Template

When spawning a sub-agent that touches a git repo, include these instructions:

```
## Git Rules
1. Create your feature branch: `git checkout -b feat/your-branch`
2. Work ONLY in your branch
3. Before committing: run secret scan on ALL changed files
4. Use `--no-verify` if pre-commit hooks fail on other agents' files
5. After committing, switch back to main: `git checkout main`
6. Do NOT modify files outside your feature scope
```

## Pre-Commit Hook Handling

VK uses `lint-staged` which runs ESLint on all staged files. When multiple agents stage files:

- **Problem**: Agent A's half-written file fails Agent B's lint check
- **Fix**: Use `git commit --no-verify` when you've verified your own files are clean
- **Better fix**: Use worktrees so each agent has its own staging area

## Secret Scanning

**MANDATORY before every commit**, regardless of agent:

```bash
grep -rn "password\|secret\|token\|apiKey\|appPassword\|sk-\|pplx-\|xai-" <changed-files>
```

Filter out false positives (variable names like `tokenProvider`, `inputTokens`, etc.) but NEVER skip the scan.

## Orchestrator Checklist

When managing a multi-agent sprint:

- [ ] Decide: sequential or parallel?
- [ ] If parallel: set up worktrees before spawning
- [ ] Give each agent a clear branch name convention
- [ ] Include git rules in every sub-agent task prompt
- [ ] After each agent finishes: review, secret scan, merge to main
- [ ] Clean up feature branches and worktrees
- [ ] Run full test suite after all merges

## Lessons Learned

1. **"Mental notes" don't work for stateless agents** — write everything to files
2. **Pre-commit hooks are global** — they see ALL staged files, not just yours
3. **Branch names must be unique** — two agents creating `feat/my-feature` = disaster
4. **Orchestrator must verify merges** — sub-agents can't see each other's work
5. **Sequential is faster than fixing parallel mistakes** — when in doubt, go serial
6. **Secret scans are non-negotiable** — one leaked key = delete git history (expensive)
