# TOOLS.md - Pip Build Local Notes

Environment-specific config, endpoints, and tool details unique to this setup.

## MCP Servers

**Master registry:** `~/.claude.json` — single source of truth for all MCP servers.

| Server              | Type  | Tools | Pip | Build | Description                               |
| ------------------- | ----- | ----- | --- | ----- | ----------------------------------------- |
| mem0                | stdio | 9     | ✅  | ✅    | Persistent memory & knowledge graph       |
| context7            | SSE   | 2     | ❌  | ✅    | Up-to-date library/framework docs         |
| fireseo             | SSE   | 19    | ✅  | ❌    | SEO analysis & optimization               |
| railway             | stdio | 14    | ❌  | ✅    | Railway project/service management        |
| sequential-thinking | stdio | 1     | ❌  | ✅    | Structured problem-solving & reasoning    |
| cloudflare          | HTTP  | 🔐    | ❌  | ✅    | Cloudflare Workers/KV/D1/R2 (needs OAuth) |

### Per-Agent Config

- **`~/.claude.json`** = Build agent + sub-agents + Claude Code (coding-focused servers)
- **Pip main** (`workspace/config/mcporter.json`) = standalone, manually curated (mem0 only)
- **Pip Build** (`workspace-build/config/mcporter.json`) = imported from `~/.claude.json`

```bash
# Sync Build workspace (after changing ~/.claude.json):
cd /home/bill/.openclaw/workspace-build
rm config/mcporter.json
mcporter config import claude --path ~/.claude.json --copy

# Pip main is manually maintained — do NOT import from .claude.json
```

### Adding a New MCP Server

1. **Decide which agent(s) need it:**
   - Coding/dev tools → `~/.claude.json` (Build + Claude Code + sub-agents)
   - Personal/business tools → `workspace/config/mcporter.json` (Pip main, manually)
2. **Add the server config** to the appropriate file
3. **If added to `~/.claude.json`**, rebuild Build's local config:
   ```bash
   cd ~/.openclaw/workspace-build
   rm config/mcporter.json
   mcporter config import claude --path ~/.claude.json --copy
   ```
4. **Update this file** — add the server to the MCP table above
5. **Update mem0** — `mcporter call mem0.add_memory text="Added <server> MCP server for <purpose>"`

### Calling MCP Tools

```bash
mcporter call mem0.add_memory text="something important"
mcporter call mem0.search_memories query="what was decided about X"
mcporter call context7.resolve-library-id libraryName="react"
mcporter call railway.list-projects
mcporter call sequential-thinking.sequentialthinking thought="problem statement" thoughtNumber=1 totalThoughts=5 nextThoughtNeeded=true
```

**Note:** OpenClaw has NO native agent-level MCP config. mcporter is the workaround.

### Pending Auth

- **Railway CLI:** `railway login` (browser auth) — required for railway MCP tools
- **Cloudflare:** `mcporter auth cloudflare` (OAuth) — required for cloudflare MCP tools

## Infrastructure

- **Tailscale:** Linux `100.86.34.31`, Mac `100.116.2.109`
- **Bill prefers Tailscale links** over localhost for Mac access

## Veritas Kanban (The Board)

- **API:** `http://localhost:3001`
- **Web UI:** `http://localhost:3000`
- **Dir:** `/home/bill/.openclaw/workspace-build/veritas-kanban/`
- **CLI:** `vk <command>`
- **Start:** `cd veritas-kanban && pnpm dev`
- **⚠️ Dies on gateway restarts** — needs manual restart

## bills-bot

- **Repo:** `https://github.com/BillChirico/bills-bot`
- **Local:** `/home/bill/.openclaw/workspace-build/bills-bot/`
- **Stack:** Node.js ESM, discord.js v14, hosted on Railway
- **Railway DB:** `postgresql://postgres:kxYyAlScRsIWqlvdDPhjguLVyriwPxfV@postgres.railway.internal:5432/railway` (internal only)

## Discord Markdown Reference

**Always use Discord formatting in messages.** Bill explicitly requires it.

### Text Formatting

- `**bold**` → **bold**
- `*italic*` → _italic_
- `__underline__` → underline
- `~~strikethrough~~` → ~~strikethrough~~
- `||spoiler||` → spoiler text
- `` `inline code` `` → inline code
- ` ```code block``` ` → code block (add language after opening ``` for syntax highlighting)

### Structure

- `# Heading 1` / `## Heading 2` / `### Heading 3` — headers
- `> quote` — blockquote
- `>>> multi-line quote` — block quote (everything after)
- `- item` or `* item` — unordered list
- `1. item` — ordered list
- `-# small text` — subtext (smaller, dimmer)

### Special

- `:emoji_name:` — Discord emoji
- `<@user_id>` — mention user
- `<#channel_id>` — mention channel
- `<@&role_id>` — mention role
- `<t:unix:F>` — timestamp (F=full, R=relative, D=date, T=time)

### Components v2 (Interactive Messages)

**Always use `components` in messages whenever appropriate.** Bill explicitly requires it.

Use the `message` tool with a `components` payload. Interaction results route back as normal inbound messages.

**Supported blocks:** `text`, `section`, `separator`, `actions`, `media-gallery`, `file`

**Action rows:** Up to 5 buttons or a single select menu per row.

- Button styles: `primary`, `secondary`, `success`, `danger`
- Select types: `string`, `user`, `role`, `mentionable`, `channel`

**Modal forms:** Add `components.modal` with up to 5 fields. OpenClaw auto-adds a trigger button.

- Field types: `text`, `checkbox`, `radio`, `select`, `role-select`, `user-select`

**File attachments:** `file` blocks use `attachment://<filename>` references. Provide via `media`/`path`/`filePath`.

```jsonc
// Example: buttons + select + modal
{
  "components": {
    "text": "Header text here",
    "blocks": [
      {
        "type": "actions",
        "buttons": [
          { "label": "Approve", "style": "success" },
          { "label": "Decline", "style": "danger" },
        ],
      },
      {
        "type": "actions",
        "select": {
          "type": "string",
          "placeholder": "Pick an option",
          "options": [
            { "label": "Option A", "value": "a" },
            { "label": "Option B", "value": "b" },
          ],
        },
      },
    ],
    "modal": {
      "title": "Form Title",
      "triggerLabel": "Open form",
      "fields": [
        { "type": "text", "label": "Description" },
        {
          "type": "select",
          "label": "Priority",
          "options": [
            { "label": "High", "value": "high" },
            { "label": "Low", "value": "low" },
          ],
        },
      ],
    },
  },
}
```

**Use components for:** status reports, PR updates, task prompts, confirmations, interactive choices, spawn workflows.

### Best Practices for Status Reports

- Use `#` headers to separate sections
- Use `>` blockquotes for status/metadata lines
- Use `-` lists for progress items with ✅/🔄/⬜ prefixes
- Use `---` horizontal rules between sections
- Use `-#` for footnotes/disclaimers
- Use `` ` `` for branch names, file paths, commands
- Use `**bold**` for emphasis on key info

## CLI Tools

- **codesession:** `cs start/end/status/note/log-ai` — session tracking (always use `--json`)
- **mcporter:** MCP server management and tool calling
- **vk:** Veritas Kanban CLI
- **gh:** GitHub CLI (authed as BillChirico, full scopes — replaces github MCP)
- **claude:** Claude Code CLI (agent teams enabled via `~/.claude/settings.json`)
- **clawhub:** Skill marketplace CLI
