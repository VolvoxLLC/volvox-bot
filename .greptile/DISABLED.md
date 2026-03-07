# Greptile PR Review — Disabled

Greptile automated PR reviews have been disabled for this repository.

**Decision:** We are consolidating PR review tooling to a single reviewer:
- ✅ **Claude Code Review** (via `.github/workflows/claude-review.yml`) — keep
- ❌ **Greptile** — disable (redundant; Claude covers the same ground with project-specific rules)
- ❌ **GitHub Copilot** — not configured in this repo (no workflow or app install found)

**Action required (done by a repo admin):**
1. Go to GitHub → Settings → Installed GitHub Apps → Greptile → Configure
2. Remove access to the `VolvoxLLC/volvox-bot` repository, OR
3. Uninstall the Greptile app from the organization

The `.greptile/` config files are retained for reference but the app should be
removed at the GitHub org/repo level to stop automated comments.

**Why Claude only?**
- `claude-review.yml` enforces all the same rules (no-console, ESM, parameterized queries, etc.)
- Single reviewer → no duplicate/conflicting comments on PRs
- Claude is already integrated with project context via AGENTS.md and inline prompts
