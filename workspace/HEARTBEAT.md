# HEARTBEAT.md

## ⚠️ CRITICAL: Heartbeat Replies Are NOT Visible to Bill

**For important stuff, ALWAYS notify via BOTH channels:**

1. **Discord DM:**

   ```
   message action=send channel=discord target=user:191633014441115648 accountId=pip message="..."
   ```

2. **iMessage via SendBlue:**
   ```bash
   cd /home/bill/.openclaw/workspace/sendblue && npx tsx send.ts +19083198616 "your message"
   ```

**What counts as important (send BOTH Discord + iMessage):**

- 🚨 **ONE-TIME PASSCODES / LOGIN CODES — SEND IMMEDIATELY** (these expire fast!)
- 💰 **TRIAL ENDINGS / SUBSCRIPTION RENEWALS / BILLING CHANGES — SEND IMMEDIATELY** (these cost money!)
- Login codes, security alerts
- Package deliveries or tracking updates
- Replies to job applications, support tickets
- Failed posts/services (PostSyncer, etc.)
- Anything actionable

**What to skip (just log internally):**

- Marketing/promo emails
- Newsletters
- Routine notifications (statements ready, etc.)
- Heartbeat check-ins (just return HEARTBEAT_OK silently)

After DMing important stuff, still end with HEARTBEAT_OK.

---

## 📋 Sync Log — `memory/heartbeat-state.json`

**This is the canonical tracking file for ALL periodic tasks.** Every task below MUST update its entry in `heartbeat-state.json` with ISO 8601 UTC timestamp after running.

Before running any periodic task, check its `lastRun` — skip if too recent. After running, update `lastRun` + any status fields.

**Tracked tasks and their cadence:**

| Task                  | Key in JSON          | Cadence              |
| --------------------- | -------------------- | -------------------- |
| Mem0 sync             | `mem0Sync`           | EVERY heartbeat      |
| Claude usage check    | `claudeUsage`        | EVERY heartbeat      |
| GitHub backup         | `githubBackup`       | EVERY heartbeat      |
| Claude token refresh  | `claudeTokenRefresh` | Once daily (morning) |
| Morning update checks | `morningUpdates`     | Once daily (morning) |
| Todoist sync          | `todoistSync`        | Every 2-3 hours      |
| Gmail webhook health  | `gmailWebhooks`      | Every 3-4 hours      |
| SendBlue proxy health | `sendblueProxy`      | Every 3-4 hours      |
| OpenClaw update check | `openclawUpdate`     | Every 3-4 hours      |
| OpenClaw PR monitor   | `openclawPR`         | 2-3 times per day    |
| Package tracking      | `packageTracking`    | Every 4-6 hours      |
| Email check           | `emailCheck`         | Every 3-4 hours      |
| Calendar check        | `calendarCheck`      | Every 3-4 hours      |
| Weather check         | `weatherCheck`       | Every 3-4 hours      |

---

## Check Claude Usage (ALWAYS FIRST)

- **EVERY MORNING (first heartbeat of the day):** Run `claude` with pty, wait for "Welcome back", then kill it. This refreshes the OAuth token for the day. Non-negotiable. Update `claudeTokenRefresh.lastRun`.
- Run: `node /home/bill/.openclaw/workspace/scripts/check-claude-usage.cjs`
- If script fails with "Token refresh failed": Run `claude` with pty yourself to refresh the token — don't ask Bill
- If `crossed_threshold` is true OR `alert_level` is not "none": Alert Bill immediately
- Alert thresholds: 50%, 60%, 70%, 80%, 90% (5-hour window)
- If >= 90%: Switch to fallback model with `session_status model: "openai-codex/gpt-5.3-codex"`
- Update `claudeUsage` in sync log with fiveHour, sevenDay, alertLevel

## Mem0 Sync (EVERY HEARTBEAT — MANDATORY, TWO-WAY)

**This is NON-NEGOTIABLE. No excuses. No skipping. MUST be two-way.**

### 🔽 PULL from Mem0 (read what's there)

1. Run: `mcporter call mem0.search_memories query:"recent context"` to check what's stored
2. Look for memories added by other sources or sessions that you haven't seen
3. If there are new memories you don't have locally, incorporate them into your context
4. Check for any corrections or updates to existing knowledge

### 🔼 PUSH to Mem0 (write what's new)

1. Check `mem0Sync.lastRun` — note how long it's been
2. Review what happened since last sync: decisions, preferences, new facts, config changes, lessons
3. Push new memories: `mcporter call mem0.add_memory text:"<fact>" user_id:bill`
4. If nothing new to sync, still update `mem0Sync.lastRun` with current time + note "no new memories"
5. Keep memories atomic — one fact per memory, not giant dumps

### After Every Conversation with Bill (not just heartbeats)

- When Bill stops talking and the session goes quiet, sync to Mem0 immediately
- Don't wait for a heartbeat — do it right then
- If Bill said something worth remembering, it goes to Mem0 right then

### What to Sync

- ✅ Decisions Bill made, preferences expressed
- ✅ New tools/services set up, config changes
- ✅ Project updates, people/contacts mentioned
- ✅ Lessons learned, mistakes to avoid
- ❌ Routine heartbeat results, transient state
- ❌ Things already in daily memory files with no long-term value

## Backup to GitHub (every heartbeat, silent unless failure)

- Run: `cd /home/bill/.openclaw && git add -A && git diff --cached --quiet || (git commit -m "Auto-backup $(date '+%Y-%m-%d %I:%M %p')" && git push)`
- **Only notify Bill if it fails** — otherwise stay silent
- Update `githubBackup.lastRun` in sync log

## Check for OpenClaw Updates (every 3-4 hours)

- Check `openclawUpdate.lastRun` — only if 3+ hours since last
- If update is available: auto-install (`npm update -g openclaw`) and restart gateway
- After updating, DM Bill with:
  - previous version → new version
  - key changelog summary (what changed)
  - whether restart succeeded
- If update/install fails, DM Bill immediately with the error
- Update `openclawUpdate.lastRun` in sync log

## Morning Update Checks (once daily, with morning digest ~9 AM)

Check `morningUpdates.lastRun` — skip if already done today.

### ClawHub Skills

```bash
clawhub list  # Check installed skills
clawhub update <skill-name>
```

### ccusage (Claude Usage Dashboard)

```bash
npm outdated -g ccusage 2>/dev/null
# If outdated: npm update -g ccusage
```

### bill-bot

```bash
cd /home/bill/.openclaw/workspace/bill-bot && git fetch origin && git log HEAD..origin/main --oneline
# If updates: git pull origin main && npm install && pm2 restart bill-bot
```

### Claude Code

```bash
claude --version  # Check current version
# Claude Code self-updates — just note the version
```

### Python Packages (pip)

```bash
pip3 list --user --outdated
# Update: pip3 install --user --break-system-packages --upgrade <package>
```

Key packages: mem0ai, mem0-mcp-server, pip

### npm Global Packages

```bash
npm outdated -g
# Update: npm update -g <package>
```

Key packages: @doist/todoist-cli, clawhub, codesession-cli, pnpm

If any updates found, notify Bill in the morning digest. Update `morningUpdates.lastRun`.

---

## Todoist Sync (every 2-3 hours)

- Check `todoistSync.lastRun` — skip if < 2 hours
- Run: `TODOIST_API_TOKEN="e6e83394008cb35595ab94ab6ee7350c166ac50b" td today --json`
- If there are overdue tasks: Alert Bill
- If there are high priority (p1/p2) tasks due today: Mention them
- If tasks were completed since last check: Acknowledge progress
- Update `todoistSync` in sync log with counts

## Gmail Webhook Health (every 3-4 hours)

- Check `gmailWebhooks.lastRun` — skip if < 3 hours
- Check all 3 gog serve processes are running:

  ```bash
  ps aux | grep "gog gmail watch serve" | grep -v grep
  ```

- If personal (port 8788) is missing, restart:

  ```bash
  nohup env GOG_KEYRING_PASSWORD="6856" gog gmail watch serve --account billchirico@gmail.com --bind 127.0.0.1 --port 8788 --path / \
    --token "959bdc4e768e63a0d0a5200a2b2424061c6f5b1d6c6770d7" \
    --hook-url "http://127.0.0.1:18789/hooks/gmail" --hook-token "4ce5b842be9623a0db514b7d7cae85b974eaed0b4fe44c22" \
    --include-body --max-bytes 20000 > /tmp/gog-serve-personal.log 2>&1 &
  ```

- If volvox (port 8789) is missing, restart:

  ```bash
  nohup env GOG_KEYRING_PASSWORD="6856" gog gmail watch serve --account bill@volvox.dev --bind 127.0.0.1 --port 8789 --path / \
    --token "959bdc4e768e63a0d0a5200a2b2424061c6f5b1d6c6770d7" \
    --hook-url "http://127.0.0.1:18789/hooks/gmail-volvox" --hook-token "4ce5b842be9623a0db514b7d7cae85b974eaed0b4fe44c22" \
    --include-body --max-bytes 20000 > /tmp/gog-serve-volvox.log 2>&1 &
  ```

- If chirico (port 8790) is missing, restart:

  ```bash
  nohup env GOG_KEYRING_PASSWORD="6856" gog gmail watch serve --account bill@chirico.dev --bind 127.0.0.1 --port 8790 --path / \
    --token "959bdc4e768e63a0d0a5200a2b2424061c6f5b1d6c6770d7" \
    --hook-url "http://127.0.0.1:18789/hooks/gmail-chirico" --hook-token "4ce5b842be9623a0db514b7d7cae85b974eaed0b4fe44c22" \
    --include-body --max-bytes 20000 > /tmp/gog-serve-chirico.log 2>&1 &
  ```

- **⚠️ CRITICAL:** Always include `GOG_KEYRING_PASSWORD="6856"` — without it, gog can't decrypt credentials and silently fails
- If OAuth is expired (check with `gog gmail watch status --account <email>`), alert Bill to re-auth
- Update `gmailWebhooks` in sync log with per-account status

## SendBlue Webhook Proxy Health (every 3-4 hours)

- Check `sendblueProxy.lastRun` — skip if < 3 hours
- Check proxy process:

  ```bash
  ps aux | grep "sendblue/webhook-proxy.js" | grep -v grep
  ```

- Check listener on port 3456:

  ```bash
  ss -ltnp | grep ":3456"
  ```

- If down, restart:

  ```bash
  nohup node /home/bill/.openclaw/workspace/sendblue/webhook-proxy.js > /tmp/sendblue-proxy.log 2>&1 &
  ```

- If restart fails, DM Bill immediately
- Update `sendblueProxy` in sync log

## OpenClaw PR Monitor (2-3 times per day)

- Check `openclawPR.lastRun` — skip if < 6 hours
- Monitor PR #13672 status:

  ```bash
  gh pr view 13672 --repo openclaw/openclaw --json state,mergeStateStatus,reviewDecision,statusCheckRollup,url
  ```

- DM Bill if anything changes:
  - New review/comment
  - CI failing/passing transition
  - Merged/closed state
- Update `openclawPR.lastRun` in sync log

## Package Tracking (every 4-6 hours)

- Check `packageTracking.lastRun` — skip if < 4 hours
- Run: `TRACK17_TOKEN="90934D5FD9C18881A8E76A3261D73F00" python3 /home/bill/.openclaw/workspace/skills/track17/scripts/track17.py sync`
- Only if there are active packages being tracked
- **Notify Bill about EVERY update** — he likes to stay informed on all tracking events
- Update `packageTracking` in sync log
