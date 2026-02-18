# HEARTBEAT.md - Pip Build

> **Sub-agents: skip this file entirely.** This is only for Pip Build's main session heartbeat.

## Rules

- Heartbeat replies are NOT visible to Bill — DM him directly if something needs attention
- Keep it light — don't burn tokens on stuff that doesn't matter

## Every Heartbeat (~30 min)

- **Git backup** (silent): `cd /home/bill/.openclaw && git add -A && git diff --cached --quiet || (git commit -m "Auto-backup $(date '+%Y-%m-%d %I:%M %p')" && git push)`
  - Only notify Bill on failure

## Morning Update Checks (once daily, first heartbeat after 8 AM)

Track last check in `memory/heartbeat-state.json` under `buildMorningUpdates`

### Python Packages

```bash
pip3 list --user --outdated
# Update: pip3 install --user --break-system-packages --upgrade <package>
```

Key packages: mem0ai, mem0-mcp-server, pip

### npm Global Packages

```bash
npm outdated -g 2>/dev/null
# Update: npm update -g <package>
```

Key packages: @doist/todoist-cli, clawhub, codesession-cli, pnpm

### ClawHub Skills

```bash
clawhub list
clawhub update <skill-name>
```

### bill-bot

```bash
cd /home/bill/.openclaw/workspace/bill-bot && git fetch origin && git log HEAD..origin/main --oneline
# If updates: git pull origin main && npm install && pm2 restart bill-bot
```

### Claude Code

```bash
claude --version
# Self-updates — just note the version
```

### ccusage

```bash
npm outdated -g ccusage 2>/dev/null
# If outdated: npm update -g ccusage
```

**After ANY update:**

- DM Bill with what was updated and what changed (version numbers, changelogs if available)
- Don't just say "updated X" — include old version → new version
- If a changelog/release notes URL exists, include the link

## Veritas Kanban Health

- Check if the board API is responsive: `curl -s http://localhost:3001/api/v1/summary`
- If down, restart: `cd /home/bill/.openclaw/workspace-build/veritas-kanban/server && setsid node node_modules/tsx/dist/cli.mjs src/index.ts > /tmp/veritas-kanban.log 2>&1 &`
- Location: `/home/bill/.openclaw/workspace-build/veritas-kanban`

## Codesession Dashboard Health

Managed by systemd user services — auto-restarts, survives reboots. **Do NOT restart via heartbeat.**

- `cs-dashboard.service` → localhost:3738 (no auth)
- `tailscale-proxy.service` → 0.0.0.0:3737 (Tailscale IPs only)
- Access URL: `http://100.86.34.31:3737`
- If issues: `systemctl --user restart cs-dashboard tailscale-proxy`

## bills-bot PR Review Check

Every heartbeat, check open PRs on `BillChirico/bills-bot` for unresolved review threads.

⚠️ **Only review Bill's PRs (author: `BillChirico`).** Do **not** check, fix, or address PRs from anyone else — other contributors, bots (`coderabbitai`, `dependabot[bot]`, `renovate[bot]`), or any other author. Unless Bill explicitly tells you to.

```bash
cd /home/bill/.openclaw/workspace-build/bills-bot
# Get only Bill's open PRs and their unresolved thread counts
# ⚠️ MUST PAGINATE — GitHub API returns max 100 threads per page. Always fetch ALL pages.
gh pr list --state open --author BillChirico --json number,title,headRefName --jq '.[]' | while read pr; do
  PR_NUM=$(echo "$pr" | jq -r '.number')

  # Paginate through ALL review threads (100 per page max)
  CURSOR=""
  TOTAL_UNRESOLVED=0
  while true; do
    if [ -z "$CURSOR" ]; then
      RESULT=$(gh api graphql -f query="{repository(owner:\"BillChirico\",name:\"bills-bot\"){pullRequest(number:$PR_NUM){reviewThreads(first:100){pageInfo{hasNextPage endCursor} nodes{isResolved}}}}}")
    else
      RESULT=$(gh api graphql -f query="{repository(owner:\"BillChirico\",name:\"bills-bot\"){pullRequest(number:$PR_NUM){reviewThreads(first:100,after:\"$CURSOR\"){pageInfo{hasNextPage endCursor} nodes{isResolved}}}}}")
    fi
    PAGE_UNRESOLVED=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([n for n in d['data']['repository']['pullRequest']['reviewThreads']['nodes'] if not n['isResolved']]))")
    TOTAL_UNRESOLVED=$((TOTAL_UNRESOLVED + PAGE_UNRESOLVED))
    HAS_NEXT=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['repository']['pullRequest']['reviewThreads']['pageInfo']['hasNextPage'])")
    if [ "$HAS_NEXT" = "True" ]; then
      CURSOR=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['repository']['pullRequest']['reviewThreads']['pageInfo']['endCursor'])")
    else
      break
    fi
  done
  echo "PR #$PR_NUM: $TOTAL_UNRESOLVED unresolved"
done
```

**If any PR has unresolved threads:**

1. **One sub-agent per PR** — NEVER batch. Parallel, not sequential.
2. Spawn with full workflow:
   - `agentId: "build"`, `model: "anthropic/claude-opus-4-6"`, `thinking: "high"`
   - Codesession tracking (`cs start`/`cs end`, `--json` always — v2.1.0+ auto-resolves by CWD, no `--session <id>` needed)
   - Codex CLI for all programming (`codex exec`, `exec pty:true`) — default model `gpt-5.3-codex`, `full-auto` mode
   - One commit per review comment, conventional commits
   - Resolve each GitHub thread via GraphQL mutation
   - Report completion summary back to parent agent (do not post PR summary comment unless Bill explicitly requests it)
3. Include the full list of unresolved thread IDs, file paths, line numbers, and issue descriptions in the spawn task.
4. Use the spawn template from MEMORY.md.

**If no unresolved threads:** Do nothing — don't waste tokens.

## DO NOT Handle (Main Agent's Job)

- ❌ OpenClaw updates
- ❌ Claude usage monitoring / rate limit switching
- ❌ Gmail webhook health
- ❌ Todoist sync
- ❌ Package tracking (17TRACK)
- ❌ Check-ins on Bill
- ❌ Morning/evening digests
