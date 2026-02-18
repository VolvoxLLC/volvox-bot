# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## Claude Rate Limit Fallback

When Claude hits rate limits, switch to: **OpenAI Codex** with model **gpt-5-codex** (`openai-codex/gpt-5.3-codex`)

✅ **Configured in gateway** — automatic fallback enabled

⚠️ **MANDATORY**: If rate limited or sensing rate limits coming, IMMEDIATELY run:

```
session_status with model: "openai-codex/gpt-5.3-codex"
```

No exceptions. If you don't switch, you're dead. This applies to Pip AND Volvox Bot.

### Usage Monitoring Scripts

**Check Claude usage:** `node /home/bill/.openclaw/workspace/scripts/check-claude-usage.js`

- Reads OAuth token from `~/.claude/.credentials.json`
- Hits `https://api.anthropic.com/api/oauth/usage`
- Returns 5-hour and 7-day utilization percentages
- Tracks threshold crossings in `memory/claude-usage-state.json`

**Check Codex usage:** `node /home/bill/.openclaw/workspace/scripts/check-codex-usage.js`

- Reads ChatGPT OAuth token from `~/.codex/auth.json`
- Hits `https://chatgpt.com/backend-api/wham/usage` (reverse-engineered from Codex CLI Rust source)
- Required headers: `Authorization: Bearer <access_token>` + `ChatGPT-Account-Id: <account_id>`
- Returns primary (5h) and secondary (7d) utilization, credits balance, code review usage
- Tracks threshold crossings in `memory/codex-usage-state.json`
- Auto-refreshes expired tokens via OpenAI OAuth (`auth.openai.com/oauth/token`)
- **Trigger:** `.codex` (or `pip codex`)

### Alert Thresholds (5-hour window — both Claude and Codex)

- **50%+**: moderate — mention in passing
- **60%+**: elevated — notify Bill
- **70%+**: warning — warn Bill
- **80%+**: high — strongly warn Bill
- **90%+**: critical — SWITCH MODELS IMMEDIATELY

Don't wait for the actual rate limit — switch at 90% proactively.

## Discord Messaging & Formatting

### Discord message tool (critical)

- `message action=send channel=discord target=user:...` returns **401 Unauthorized** without `accountId`
- **Always include:** `accountId: "pip"`

Example:

```bash
message action=send channel=discord target=user:191633014441115648 accountId=pip message="..."
```

### Discord Components V2 (ALWAYS USE WHEN APPROPRIATE)

**Prefer V2 components over plain text** for structured info, dashboards, status reports, action buttons, control panels, digests — anything richer than a quick reply.

- Flag: `IS_COMPONENTS_V2 = 32768` (set automatically by OpenClaw)
- Send via Discord REST API with `flags: 32768` and V2 component payload
- OpenClaw's message tool has internal `components` param in send schema

**Component types:**

- Container (type 17) — wraps everything, supports `accent_color`
- TextDisplay (type 10) — markdown text blocks
- Separator (type 14) — dividers with `spacing` (1=small, 2=large)
- ActionRow (type 1) — buttons and selects (max 5 buttons per row)
- Button (type 2) — styles: 1=primary, 2=secondary, 3=success, 4=danger, 5=link
- Section (type 9) — text + accessory (thumbnail/button)
- MediaGallery (type 12) — image gallery
- File (type 13) — file attachment display

**Example payload:**

```json
{
  "flags": 32768,
  "components": [
    {
      "type": 17,
      "accent_color": 5793266,
      "components": [
        { "type": 10, "content": "## Title\nBody text" },
        { "type": 14, "divider": true, "spacing": 1 },
        {
          "type": 1,
          "components": [
            { "type": 2, "label": "Button", "style": 1, "custom_id": "btn_1" },
            { "type": 2, "label": "Link", "style": 5, "url": "https://example.com" }
          ]
        }
      ]
    }
  ]
}
```

**When to use V2 components:**

- Status reports, digests, dashboards
- Any message with action buttons or interactive elements
- Structured data (weather, car status, task lists, etc.)
- Control panels and menus

**When plain text is fine:**

- Quick one-line replies
- Casual conversation
- Simple confirmations

### Discord formatting quickref

- No markdown tables on Discord — use bullet lists
- Use `<https://...>` to suppress embeds when sending multiple links
- Supported formatting:
  - Italic: `*text*` / `_text_`
  - Bold: `**text**`
  - Underline: `__text__`
  - Strikethrough: `~~text~~`
  - Spoiler: `||text||`
  - Inline code: `` `code` ``
  - Code block: ` ```ts\ncode\n``` `
  - Headers: `#`, `##`, `###`
  - Subtext: `-# small text`
  - Block quote: `>` or `>>>`

## SendBlue (iMessage/SMS)

**My Number:** +1 (623) 284-3671
**API Key:** f3137d1f21d7b24d5951b8053e888b2f
**API Secret:** f66032f854dfbd398761e4eec0519a61

Send SMS/iMessage:

```bash
cd /home/bill/.openclaw/workspace/sendblue && npx tsx send.ts +19083198616 "Your message"
```

Or via curl:

```bash
curl -X POST "https://api.sendblue.co/api/send-message" \
  -H "sb-api-key-id: f3137d1f21d7b24d5951b8053e888b2f" \
  -H "sb-api-secret-key: f66032f854dfbd398761e4eec0519a61" \
  -H "Content-Type: application/json" \
  -d '{"number": "+19083198616", "content": "Message", "from_number": "+16232843671"}'
```

## Twitter / X (bird CLI)

**Account:** @volvox_llc (Volvox)
**Credentials:** `workspace/skills/bird/.env`
**CLI:** `bird` v0.8.0

Commands:

```bash
bird whoami          # Check auth
bird read <url>      # Read a tweet
bird thread <url>    # Read full thread
bird search "query"  # Search X
bird tweet "text"    # Post tweet (ask Bill first!)
bird reply <id> "text"  # Reply to tweet
```

---

## Tesla (Tessie API)

**Car:** King Mobile (Model 3, VIN: 5YJ3E1EA1RF726681)
**API:** Tessie (api.tessie.com)
**API Key:** `PndVhYC3gzrMuVAKRGhLnoAnK5OEFrs3`
**Script:** `/home/bill/.openclaw/workspace/tesla/tessie.py`

Commands:

```bash
python3 /home/bill/.openclaw/workspace/tesla/tessie.py status        # Full status
python3 /home/bill/.openclaw/workspace/tesla/tessie.py location      # GPS + map link
python3 /home/bill/.openclaw/workspace/tesla/tessie.py start-climate # Warm it up
python3 /home/bill/.openclaw/workspace/tesla/tessie.py stop-climate  # Turn off climate
python3 /home/bill/.openclaw/workspace/tesla/tessie.py lock          # Lock doors
python3 /home/bill/.openclaw/workspace/tesla/tessie.py unlock        # Unlock doors
python3 /home/bill/.openclaw/workspace/tesla/tessie.py honk          # Honk horn
python3 /home/bill/.openclaw/workspace/tesla/tessie.py flash         # Flash lights
python3 /home/bill/.openclaw/workspace/tesla/tessie.py start-charge  # Start charging
python3 /home/bill/.openclaw/workspace/tesla/tessie.py stop-charge   # Stop charging
python3 /home/bill/.openclaw/workspace/tesla/tessie.py wake          # Wake vehicle
python3 /home/bill/.openclaw/workspace/tesla/tessie.py raw           # Full JSON dump
```

**Note:** Uses Tessie API (NOT direct Tesla OAuth). No auth flow needed — just the API key.

---

## Reddit Tracking

Bill profile/location + subreddit watchlist now live in `USER.md`.

### How to fetch

```
https://www.reddit.com/r/{subreddit}/top/.json?t=day&limit=5
```

---

## Mercury Bank

**API Token:** `secret-token:mercury_production_rma_GQPXDVkYQGWSJKLfCZPd2Vot9iMRYaD9WuRhtwVXFUHuq_yrucrem`
**Script:** `/home/bill/.openclaw/workspace/mercury/mercury.py`

Commands:

```bash
python3 /home/bill/.openclaw/workspace/mercury/mercury.py summary       # Quick summary
python3 /home/bill/.openclaw/workspace/mercury/mercury.py accounts      # All accounts
python3 /home/bill/.openclaw/workspace/mercury/mercury.py transactions  # Recent transactions
```

**⚠️ Credit Card (IO) Account — where most labeled transactions live:**

- **Credit ID:** `911f7678-db9c-11f0-a9fb-0b9a297cef6b`
- Labels/categories are on the credit card, NOT the checking account
- Endpoint: `GET /api/v1/account/{CREDIT_ID}/transactions?limit=500`
- Categories found: Marketing & Advertising, Software & Subscriptions, Office Supplies & Equipment
- Always pull from credit card when Bill asks about spending by category

---

## 17TRACK (Package Tracking)

**API Token:** `90934D5FD9C18881A8E76A3261D73F00`
**Quota:** 200 tracks (free tier)
**Skill:** `/home/bill/.openclaw/workspace/skills/track17`

Commands:

```bash
export TRACK17_TOKEN="90934D5FD9C18881A8E76A3261D73F00"
python3 /home/bill/.openclaw/workspace/skills/track17/scripts/track17.py list          # List packages
python3 /home/bill/.openclaw/workspace/skills/track17/scripts/track17.py add "TRACKING#" --label "Description"
python3 /home/bill/.openclaw/workspace/skills/track17/scripts/track17.py sync          # Poll for updates
python3 /home/bill/.openclaw/workspace/skills/track17/scripts/track17.py status 1      # Details for package #1
python3 /home/bill/.openclaw/workspace/skills/track17/scripts/track17.py quota         # Check API quota
```

---

## Todoist

API Token: `e6e83394008cb35595ab94ab6ee7350c166ac50b`
CLI: `td` v1.8.1 (official @doist/todoist-cli)

Quick commands:

```bash
td today --json          # Tasks due today
td upcoming 7 --json     # Next 7 days
td add "Task name @openclaw"       # Quick add (use @label syntax)
td add "Call mom tomorrow p1 @openclaw"  # With due date and priority
td task complete <id>    # Complete task
td inbox --json          # Inbox tasks
td stats                 # Karma/productivity
```

Use `--json` or `--ndjson` for parseable output.

**⚠️ ALWAYS use `@openclaw` in task text when creating tasks!**

**⚠️ ALWAYS use `--label openclaw` when creating tasks!**

---

## mcporter (MCP Server Access)

**Installed:** Global npm + ClawHub skill
**Config:** `./config/mcporter.json` (project) + `~/.config/mcporter.json` (home)
**⚠️ DO NOT use `~/.claude.json` — use mcporter's own config only**
**Connected:** github (40 tools), context7 (2 tools), mem0 (9 tools)

### Adding MCP Servers

```bash
# HTTP/SSE server (just a URL)
mcporter config add linear https://mcp.linear.app/mcp

# stdio server (npm package)
mcporter config add todoist --command "npx -y @abhiz123/todoist-mcp-server" \
  --env TODOIST_API_TOKEN=your-token

# With scope (home = global, project = local)
mcporter config add myserver https://example.com/mcp --scope home

# Import from other editors
mcporter config import cursor --copy
```

### Managing Servers

```bash
mcporter config list              # See all servers
mcporter config get <name>        # Inspect one
mcporter config remove <name>     # Delete one
mcporter config login <name>      # Run OAuth flow
mcporter config doctor            # Validate config
```

### Using Tools

```bash
mcporter list                              # List all servers + tool count
mcporter list <server> --all-parameters    # List tools with full params
mcporter call <server.tool> key=value      # Call a tool
mcporter call <server.tool> --args '{"key":"value"}'  # JSON payload
```

### Connected Servers

**github** (40 tools) — Full GitHub API access
**context7** (2 tools) — Library documentation context
**mem0** (9 tools) — Structured long-term memory

---

## Typefully (Social Scheduling)

**Account:** @volvox_llc (Volvox)
**Social Set ID:** 281758
**Script:** `/home/bill/.openclaw/workspace/typefully/typefully.py`

```bash
# List drafts
python3 /home/bill/.openclaw/workspace/typefully/typefully.py list

# Create a single post draft
python3 /home/bill/.openclaw/workspace/typefully/typefully.py draft "Your tweet here"

# Create a thread (each arg = one post)
python3 /home/bill/.openclaw/workspace/typefully/typefully.py thread "Post 1" "Post 2" "Post 3"
```

**Platforms:** X, LinkedIn, Threads, Bluesky, Mastodon
**API Docs:** <https://typefully.com/docs/api>

---

## Codesession (Session Cost Tracking)

**CLI:** `cs` v1.8.2
**Dashboard:** <https://bill.tail8b4599.ts.net:8737>
**DB:** `~/.codesession/sessions.db`
**Skill:** `/home/bill/.openclaw/workspace/skills/codesession`

**⚠️ MANDATORY: Track EVERY task with `cs`. No exceptions.**

```bash
cs start "task description" --close-stale   # Start tracking
cs log-ai -p anthropic -m claude-opus-4-6 --prompt-tokens 8000 --completion-tokens 2000  # Log AI usage
cs status --json                             # Check spend
cs note "progress update"                    # Add annotation
cs end -n "completion notes"                 # End session + summary
cs dashboard --no-open --port 3737           # Start dashboard (already running as background process)
```

**Dashboard startup (if it dies):**

```bash
nohup cs dashboard --no-open --port 3737 > /tmp/codesession-dashboard.log 2>&1 &
```

Tailscale proxy: `tailscale serve --bg --https 8737 http://127.0.0.1:3737`

---

## Cron Jobs

### Recurring

| Job            | Schedule    | What it does                                  |
| -------------- | ----------- | --------------------------------------------- |
| Morning Digest | 9 AM daily  | Weather, tasks, email, calendar, news, reddit |
| Evening Digest | 10 PM daily | Same as morning, end-of-day recap             |

### Upcoming One-Time Reminders

- Decision Jar PH Launch Prep — Mon Feb 9, 9 PM
- Decision Jar PH LAUNCH DAY — Tue Feb 10, 8 AM

_Use `cron list` to see all jobs with full details._

---

## Claude Code (Coding Agent)

**Installed:** v2.1.37
**Binary:** `/home/bill/.local/bin/claude`
**Config:** `~/.claude/`

### Quick Commands (via Pip)

When you ask me to code something complex, I can spawn Claude Code:

```bash
# One-shot task (I run this with pty:true)
claude "Build a REST API for todos"

# Background for longer work
bash pty:true workdir:~/project background:true command:"claude 'Refactor the auth module'"
```

### Direct Usage

```bash
# Interactive mode
claude

# One-shot with prompt
claude "Your coding task"

# Resume a project
claude --resume
```

### Best Practices

- **Always use pty:true** when spawning via Pip
- **workdir matters** — sets the project context
- **Background for long tasks** — I can monitor with `process action:log`
- **Never run in ~/clawd/** — that's my brain, not a project!

### Agent Teams (Experimental)

**Enabled:** Yes (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
**Display Mode:** tmux (split panes)

Coordinate multiple Claude Code instances working together:

- One session = team lead (coordinates, assigns tasks)
- Teammates = independent Claude instances with own context
- Teammates can message each other directly

**Best for:**

- Research and code review (parallel perspectives)
- New modules/features (each teammate owns a piece)
- Debugging with competing hypotheses
- Cross-layer work (frontend, backend, tests)

**Commands:**

```
# Start a team
"Create an agent team to review PR #142 with 3 reviewers"

# Spawn specific teammates
"Spawn a security reviewer teammate to audit auth module"

# Delegate mode (lead only coordinates, doesn't code)
Press Shift+Tab to toggle delegate mode

# Navigate teammates
Shift+Up/Down to select teammate
Ctrl+T to toggle task list
```

**Avoid for:** Sequential tasks, same-file edits, heavy dependencies

---

## Mem0 (Structured Memory)

**Provider:** Mem0 Cloud
**API:** `https://api.mem0.ai`
**API Key:** `m0-e4DCngs2DbyRwHVVI8rysJCWGtn4DaFi0S4CFvCS`
**MCP Server:** `mem0-mcp-server` v0.2.1 (Python, stdio via mcporter, configured in `~/.claude.json`)
**Binary:** `/home/bill/.local/bin/mem0-mcp-server`
**Users:** bill (owner), pip (agent)
**Graph Knowledge:** Enabled (`MEM0_ENABLE_GRAPH_DEFAULT=true`)
**Dashboard:** <https://app.mem0.ai/dashboard>

### Commands (via mcporter)

```bash
# Add a memory
mcporter call mem0.add_memory text:"Bill prefers dark mode" user_id:bill

# Search memories
mcporter call mem0.search_memories query:"what are Bill's preferences"

# Browse/paginate memories
mcporter call mem0.get_memories page:1 page_size:20

# Get single memory by ID
mcporter call mem0.get_memory memory_id:"<id>"

# Update a memory
mcporter call mem0.update_memory memory_id:"<id>" text:"Updated fact"

# Delete a memory
mcporter call mem0.delete_memory memory_id:"<id>"

# List entities (users/agents/apps)
mcporter call mem0.list_entities

# Delete all memories for a user
mcporter call mem0.delete_all_memories user_id:bill

# Delete entity entirely
mcporter call mem0.delete_entities user_id:bill
```

9 tools via mem0-mcp-server v0.2.1 (Python)

### Integration Strategy

- **File memory** (MEMORY.md + daily notes): Quick-access curated journal, loaded every session
- **Mem0**: Structured memory with graph knowledge for long-term context
- **Both used together**: Files for operational context, Mem0 for long-term relational recall
- Push significant events/facts to Mem0 during heartbeats or after major conversations
- Query Mem0 context when answering questions about Bill's history, preferences, or relationships
