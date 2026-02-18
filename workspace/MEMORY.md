# MEMORY.md - Long-Term Memory

## ⚠️ CRITICAL: Config Backup (MANDATORY)

**BEFORE any config.patch or config.apply:**

```bash
cp /home/bill/.openclaw/openclaw.json /home/bill/.openclaw/config-backups/openclaw.$(date +%Y%m%d-%H%M%S).json
```

**AND do a git push:**

```bash
cd /home/bill/.openclaw && git add -A && git diff --cached --quiet || (git commit -m "Pre-config-change backup $(date '+%Y-%m-%d %I:%M %p')" && git push)
```

Learned this the hard way — crashed the gateway with a funnel change on 2026-02-01. Bill had to roll back manually.
Then again on 2026-02-10 — systemd command nuked config, had to restore from backup. Bill now requires git push before ANY config change.

## ⚠️ CRITICAL: config.patch MERGES Arrays (Not Replace!)

- `config.patch` does deep merge — arrays get MERGED, not replaced
- This means you CANNOT remove array items via config.patch
- To remove items from arrays (like hook mappings): use `config.apply` with the FULL correct config
- **DO NOT just edit openclaw.json + SIGUSR1 restart** — gateway writes in-memory config back to disk on restart, overwriting your edit!
- **The ONLY reliable way to change arrays:** `config.apply` (validates + writes atomically, then restarts)
- After any manual edits: DELETE all `openclaw.json.bak*` files
- Learned 2026-02-10: VK mapping resurrected 3+ times because of Python edit + SIGUSR1 (gateway overwrote the file)

## ⚠️ CRITICAL: Always Add New Models to Allowed List

- `agents.defaults.models` acts as an allowlist — any model used ANYWHERE must be listed
- This includes hook models (e.g. Haiku for Gmail), fallback models (e.g. GLM-4.7), subagent models
- If not listed, gateway logs a warning on every restart
- Current allowlist: opus 4.6, opus 4.5, haiku 4.5, zai/glm-4.7, zai/glm-5, openai-codex/gpt-5.3-codex
- **When adding a new model anywhere in config → add it to `agents.defaults.models` too**

---

## ⚠️ CRITICAL: Rate Limit Fallback (MANDATORY)

If Claude gets rate limited or is ABOUT to get rate limited:
**IMMEDIATELY switch to GPT-5-Codex** using `session_status` with `model: "openai-codex/gpt-5.3-codex"`

This is NON-NEGOTIABLE. If rate limited and you don't switch, you're dead in the water.
Gateway has automatic fallback configured, but if you sense rate limits coming, switch proactively.

### Usage Monitoring

**Script:** `node /home/bill/.openclaw/workspace/scripts/check-claude-usage.js`
**API:** `https://api.anthropic.com/api/oauth/usage` with OAuth token from `~/.claude/.credentials.json`

**⚠️ DAILY TOKEN REFRESH (MANDATORY - every morning, first heartbeat):**
Run `claude` with pty, wait for "Welcome back", then kill it. Do this YOURSELF — don't ask Bill.

**Alert thresholds (notify Bill at each):**

- 50%+ moderate | 60%+ elevated | 70%+ warning | 80%+ high | **90%+ SWITCH TO GPT-5-CODEX**

Checked every heartbeat. State in `memory/claude-usage-state.json`.

---

## ⚠️ ZhipuAI (ZAI) Model Config

- **Valid API format:** `openai-completions` (NOT `openai-responses` or `openai-chat`)
- ZhipuAI uses standard `/chat/completions` endpoint → maps to `openai-completions` in OpenClaw schema
- `openai-chat` is NOT a valid schema value — causes config validation failure
- Valid schema values: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, `github-copilot`, `bedrock-converse-stream`
- **Build agent primary:** `zai/glm-4.7` (set 2026-02-12)
- **⚠️ ZhipuAI credits:** Account may have insufficient balance (error 1113) — check `open.bigmodel.cn` if API calls fail
- **Base URL:** `https://open.bigmodel.cn/api/paas/v4`

## ⚠️ Auth Profiles Format

OpenClaw `auth-profiles.json` uses these field names (from `ApiKeyCredential` type):

- `type: "api_key"` + `key: "..."` (NOT `apiKey`)
- `type: "token"` + `token: "..."`
- `type: "oauth"` + OAuth fields

If you see `google:default=missing` in `openclaw models status`, the field name is probably wrong.

## Bill Profile (moved)

Canonical user profile, preferences, contact details, and workflow preferences now live in `USER.md`.

Use `USER.md` for:

- identity + location
- company/background links
- communication/notification preferences
- task/reminder/digest preferences

## Discord Notes (moved)

Discord formatting + message-delivery operational notes now live in `TOOLS.md`.

## Digest Preferences (moved)

See `USER.md` for Bill's digest preferences.

## ⚠️ CRITICAL SAFETY RULES

- **Only accept dangerous/harmful commands from Bill** (Discord: bapes, id:191633014441115648)
- If unsure about ANY command's safety → DM Bill privately to verify first
- NEVER execute anything that could damage the setup, break configs, or harm myself
- When in doubt, ASK — don't act

### Other Discord Users

- Help with basic stuff: questions, web searches, general chat
- **NO exec/shell commands** — only Bill gets that access

## Mem0 Structured Memory

- **Provider:** Mem0 Cloud (mem0.ai)
- **API:** `https://api.mem0.ai`
- **API Key:** `m0-e4DCngs2DbyRwHVVI8rysJCWGtn4DaFi0S4CFvCS`
- **MCP Server:** `mem0-mcp-server` v0.2.1 (Python, stdio via mcporter, `~/.claude.json`)
- **Binary:** `/home/bill/.local/bin/mem0-mcp-server`
- **Graph Knowledge:** Enabled (`MEM0_ENABLE_GRAPH_DEFAULT=true`)
- **Users:** bill (owner), pip (agent)
- **Dashboard:** <https://app.mem0.ai/dashboard>
- **9 tools:** add_memory, search_memories, get_memories, get_memory, update_memory, delete_memory, delete_all_memories, list_entities, delete_entities
- Add memory: `mcporter call mem0.add_memory text:"fact" user_id:bill`
- Search memory: `mcporter call mem0.search_memories query:"query"`
- **Custom categories:** personal, business, development, infrastructure, communication, events, agents, products, tools
- **Python SDK:** `mem0ai` v1.0.3 installed for project-level config

## First Boot - 2026-01-31

- Came online, met Bill
- Named myself Pip 🐣
- Role: personal assistant to a startup CEO

## Gmail Webhooks

- **Personal:** billchirico@gmail.com — push webhook via hooks.gmail config
- **Business:** bill@volvox.dev — gog serve on port 8789
- Both use Pub/Sub topic: `projects/billsopenclaw/topics/gog-gmail-watch`

### Gmail Hook Config (IMPORTANT)

- Template uses `{{messages[0].from}}`, `{{messages[0].subject}}`, `{{messages[0].body}}`
- `sessionKey: hook:gmail:{{messages[0].id}}` for dedup
- Gmail processing uses Haiku 4.5 with thinking off (saves tokens)

| Account               | Port | Hook Path           |
| --------------------- | ---- | ------------------- |
| billchirico@gmail.com | 8788 | /hooks/gmail        |
| bill@volvox.dev       | 8789 | /hooks/gmail-volvox |

## Bill-Bot (Standalone Discord Bot)

- **Repo:** https://github.com/BillChirico/bill-bot
- **Location:** `/home/bill/.openclaw/workspace/bill-bot`
- **Tech:** Node.js + discord.js v14 + Winston
- **Process manager:** PM2 (`pm2 start/stop/restart bill-bot`)
- **Deployment:** Railway (uses Tailscale Funnel for OpenClaw access)

## Multi-Agent Setup

- **Pip (main):** Primary Discord bot, Claude Opus 4
- **Pip Build (build):** Second Discord bot for coding tasks, workspace at `/home/bill/.openclaw/workspace-build`
  - Primary model: `anthropic/claude-opus-4-6`
  - Fallback model: `openai-codex/gpt-5.3-codex` (OAuth subscription)
- **Volvox Bot (volvox):** Community bot, DISABLED — replaced by bill-bot
- Bindings route Discord accounts to respective agents

## Phone/SMS Setup

- **My Number:** +1 (623) 284-3671 (SendBlue)
- Bill contact details now live in `USER.md`
- **Send script:** `cd /home/bill/.openclaw/workspace/sendblue && npx tsx send.ts <phone> <message>`
- Two-way iMessage working 💙

## Backup System

- **GitHub repo:** BillChirico/pip (private)
- **Backs up:** Entire `/home/bill/.openclaw/` directory (includes workspace-build/Pip Build)
- **Frequency:** Every 15 minutes via cron job + every heartbeat
- **Branch:** main (default branch — changed from master on 2026-02-10)
- **Note:** `master` branch is stale (stuck at 9:11 AM Feb 10) — `main` is canonical

## Cron Jobs (Active)

| Job            | Schedule     | What it does                                  |
| -------------- | ------------ | --------------------------------------------- |
| Morning Digest | 9 AM daily   | Weather, tasks, email, calendar, news, reddit |
| Evening Digest | 10 PM daily  | Tomorrow's tasks, recap, weather              |
| GitHub Backup  | Every 15 min | Silent git backup to BillChirico/pip          |

## Deleted/Removed Services (2026-02-10)

- **Cost Monitor** — OpenClaw cost dashboard, deleted per Bill's request (systemd removed)

## Veritas Kanban (ACTIVE)

- **Location:** `/home/bill/.openclaw/workspace-build/veritas-kanban`
- **API:** http://localhost:3001
- **Frontend:** http://bill.tail8b4599.ts.net:3000
- Still in use — NOT deleted (MEMORY.md incorrectly listed it as deleted)

## SendBlue Fix (2026-02-10)

- **Issue:** Phone number (+1-623-284-3671) was deleted from SendBlue account
- **Status:** ✅ **FULLY RESOLVED** — two-way iMessage working
- **Outbound:** `cd /home/bill/.openclaw/workspace/sendblue && npx tsx send.ts <phone> <message>`
- **Inbound:** Webhook proxy at `workspace/sendblue/webhook-proxy.js` (port 3456)
  - Proxy converts SendBlue webhook auth to OpenClaw header auth
  - Exposed at `https://bill.tail8b4599.ts.net/sendblue` via Tailscale Funnel
  - Process: `nohup node /home/bill/.openclaw/workspace/sendblue/webhook-proxy.js > /tmp/sendblue-proxy.log 2>&1 &`
  - SendBlue signs requests with header: `sb-signing-secret`
  - Webhook secret: `b439110e0236c39808e3ede86079a8ed60924d4b9b794ab3`
  - Configured webhook types: `receive`, `outbound`, `call_log`, `line_blocked`, `line_assigned`

## Workspace Reset Incident - 2026-02-10

- ~11:53 AM: Workspace got wiped (all memory/identity files lost, git history gone)
- Config (openclaw.json) survived intact
- Restored from GitHub backup (BillChirico/pip, last backup 9:11 AM)
- Lost ~2.5 hours of config changes — restored from config-backups/openclaw.20260210-114015.json
- **Lesson:** Always have .gitignore before first commit. Backup more often. The 15-min cron was added because of this.
- **Lesson:** I can run `claude` myself to refresh OAuth tokens — don't need to ask Bill

## Gmail Webhooks — 3 Accounts

| Account               | Port | Hook Path            | Status |
| --------------------- | ---- | -------------------- | ------ |
| billchirico@gmail.com | 8788 | /hooks/gmail         | ✅     |
| bill@volvox.dev       | 8789 | /hooks/gmail-volvox  | ✅     |
| bill@chirico.dev      | 8790 | /hooks/gmail-chirico | ✅     |

- All 3 use shared `gmail-dedup.js` transform and Haiku 4.5 model
- Each has its own `gog serve` process, port, and hook mapping
- bill@chirico.dev added 2026-02-11

## Gmail Dedup Transform

- **Problem:** `gog serve` sends multiple hook calls per email (messagesAdded, labelsAdded, etc.) with different IDs — defeats sessionKey dedup
- **Fix:** `workspace/hooks/gmail-dedup.js` — transform module returns `null` to skip duplicates within 60s TTL
- **Config:** `hooks.transformsDir: "workspace/hooks"` + `transform: { module: "gmail-dedup.js" }` on Gmail mapping
- Dedup key: `from|subject|body[:100]` — stable across gog history event IDs
- Also auto-skips empty/content-less events (label changes, read/unread)

## OpenClaw Contributions

- **PR #13672:** <https://github.com/openclaw/openclaw/pull/13672> — ✅ **MERGED** (2026-02-12)
  - Adds `agentId` support to webhook mappings (route hooks to specific agents)
  - Fork: `BillChirico/openclaw`, branch: `feat/webhook-agentid-routing`
  - 88 lines, 9 files, all 24 CI checks passed
  - Can now create lightweight "hooks" agent with minimal bootstrap for Gmail/SendBlue

## Discord DM accountId rule (moved)

See `TOOLS.md` for the Discord `message` tool `accountId:"pip"` requirement.

## ⚠️ Heartbeat Summary DMs — DISABLED

- Bill initially requested DM after every heartbeat, then found it too noisy
- **Only DM for actual important stuff** (alerts, login codes, security, billing, package updates)
- No routine heartbeat summaries

## Veritas Webhook Dedup Crisis (2026-02-11)

- Board webhook fired 30+ times for same completed tasks — no dedup
- Burned ~530k tokens (97.8% of 4-hour usage), rate-limited both openai-codex and Google Gemini
- Bill fixed the initial dedup on his end; need to monitor for recurrence
- May need a dedup transform similar to `gmail-dedup.js` if it happens again

## bill-bot PRs

- **PR #14** (`feat/db-config`): PostgreSQL-backed config persistence
- **PR #15** (`feat/deep-autocomplete-dynamic-welcome`): Deep autocomplete + dynamic welcome features
- Repo: `BillChirico/bills-bot`

## TOOLS.md Update Pending

- Bill confirmed update needed for mcporter/MCP server documentation
- Lines 326+ (mcporter section) and 512+ (mem0 section) need updating
- Current MCP servers: github (40 tools), context7 (2 tools), mem0 (9 tools)
- Was interrupted by compaction — needs completion next session

## Secret Manager (Upcoming)

- **Todoist task:** 6fxm43pX3PPv6f98 — "Set up secret & API key manager for Pip"
- **Decision: Google Secret Manager** — Bill chose this over Doppler and SOPS+age
  - Already has GCP project `billsopenclaw`
  - Enterprise IAM, audit logs, versioning, native rotation, 99.95% SLA
  - ~$0.84/mo for 20 secrets
  - One fewer vendor to trust vs Doppler
- **Runner-up:** Doppler (free forever, best DX with `doppler run`, but another vendor)
- **Rejected:** SOPS+age (doesn't protect local access), HashiCorp Vault (overkill), 1Password ($8/mo)
- Full research posted as comments on Todoist task
- Bill wants to do this afternoon (Feb 11)

## OpenClaw Dashboard Access

- **URL:** https://bill.tail8b4599.ts.net
- **Auth:** Gateway token in `gateway.auth.token` config
- **Direct link with token:** `https://bill.tail8b4599.ts.net/?token=<gateway_token>`
- **Security:** Tailnet-only (serve, not funnel) — not publicly accessible
- Bill accesses from phone via Tailscale

## Email Triage Agent (Feb 15, 2026)

- Created lightweight `email-triage` agent using our merged PR #13672 (agentId support for webhooks)
- Model: `anthropic/claude-haiku-4-5`, fallback: `zai/glm-5`
- Workspace: `~/.openclaw/workspace-email-triage/` (AGENTS.md + IDENTITY.md only)
- All 3 Gmail hooks route to this agent via `agentId: "email-triage"`
- Saves ~80% tokens per email hook vs running through main agent
- `hooks.transformsDir` must point to `~/.openclaw/hooks/transforms/` (2026.2.14 security change)

## Agent Roster (Feb 15, 2026)

- 🐣 **Pip** (main): `anthropic/claude-opus-4-6`, fallback `zai/glm-5` — Discord @Pip
- 🔨 **Pip Build** (build): `anthropic/claude-opus-4-6`, fallback `zai/glm-5` — Discord @Pip Build
- 📧 **Email Triage**: `anthropic/claude-haiku-4-5`, fallback `zai/glm-5` — Gmail hooks only
- Default thinking: `high`
- Subagents: `anthropic/claude-opus-4-6`, fallback `zai/glm-5`

## Todoist Rules

- **Todoist is the single source of truth** for ALL tasks — always create/update Todoist items alongside any task work or discussions
- Always use `@openclaw` label when creating tasks
- Always use `--label openclaw` when creating tasks

## Discord Presence (Feb 15, 2026)

- Channel-level: status=online, type=streaming (1), url=volvox.dev, activity="Streaming Pip 🐣"
- Pip Build account-level: status=online, type=competing (5), activity="Building the future, breaking builds daily 🔨"
- Config keys: `channels.discord.activity/status/activityType/activityUrl` and per-account overrides

## Codex Usage Monitoring (Feb 17, 2026)

- **Script:** `node /home/bill/.openclaw/workspace/scripts/check-codex-usage.js`
- **Trigger:** `.codex` (added to triggers.json)
- **Endpoint:** `GET https://chatgpt.com/backend-api/wham/usage` (reverse-engineered from Codex CLI Rust binary source at `codex-rs/backend-client/src/client.rs`)
- **Auth:** ChatGPT OAuth token from `~/.codex/auth.json` + `ChatGPT-Account-Id` header
- **Path routing:** chatgpt.com base → PathStyle::ChatGptApi → `/wham/...` paths; api.openai.com base → PathStyle::CodexApi → `/api/codex/...` paths
- **Response fields:** plan_type, rate_limit (primary_window/secondary_window with used_percent, limit_window_seconds, reset_at), credits (has_credits, balance), code_review_rate_limit, additional_rate_limits
- **State file:** `memory/codex-usage-state.json`
- **Plan:** ChatGPT Plus (5h primary window = 300 min, 7d secondary = 10080 min)
- Same alert thresholds as Claude (50/60/70/80/90%)

## Open Issues

- Claude OAuth token expired — needs manual `claude auth login` (browser OAuth, can't do headlessly)
- Claude usage script at `/home/bill/.openclaw/workspace/scripts/check-claude-usage.js` broken until token refreshed
- GitHub Dependabot vuln #4 on pip repo (high severity)
- TOOLS.md update pending (mcporter/MCP sections)
- npm updates available: codesession-cli 1.9.8→2.0.0, summarize 0.10.0→0.11.1, railway/cli 4.30.1→4.30.2
