# Maintain Docs

---
on:
  schedule:
    - cron: '0 9 * * *'  # 4 AM EST = 9 AM UTC
  workflow_dispatch: {}

permissions:
  contents: write
  pull-requests: write
  issues: write

tools:
  github:
  edit:
  
engine: copilot

---

# Maintain Repository Documentation

## Purpose

Keep the repository documentation accurate and current by:
- Reviewing merged pull requests since the last run
- Checking updated source, tests, dashboard, config, and docs files
- Updating every affected documentation file for architectural, workflow, setup, config, feature, UI, or public behavior changes
- Creating a pull request if updates are needed

## Documentation Scope

Maintain the docs that match the change:
- `AGENTS.md` for repo-specific operating rules, workflows, and gotchas
- `DESIGN.md` for visual/design-system direction
- `DEVELOPMENT.md` for local setup, dev commands, environment, project structure, and contributor/developer workflow
- `README.md` for public/product overview, user-facing setup, and feature summaries
- `CONTRIBUTING.md` for contribution workflow and review expectations
- Mintlify docs (`docs/**/*.mdx`) and `docs/docs.json` for feature/config/security/help docs, dashboard docs, public behavior, and navigation changes
- `.github/workflows/maintain-docs.md` when automated doc-maintenance scope or rules change

## Instructions for the Agent

1. **Fetch Recent Changes**: Query the repository for merged PRs and updated files from the past 24 hours.

2. **Review Significant Changes**: Check whether these areas changed in ways docs should reflect:
   - `src/modules/` - New modules or modified behavior patterns
   - `src/api/` - API routes, middleware, config allowlist, or public API changes
   - `src/commands/` - New or changed slash commands
   - `src/utils/` - Utility additions or required usage patterns
   - `web/` - Dashboard behavior, navigation, setup, or visual changes
   - `docs/` - Mintlify content or navigation changes
   - `tests/` - Testing patterns or coverage expectations
   - Root config/setup files - setup, environment, scripts, or workflow changes

3. **Analyze Merged PRs**: Look at PR titles, descriptions, and changed files to identify:
   - New features or changed user-facing behavior
   - Architecture decisions or pattern changes
   - Setup, config, command, environment, or workflow changes
   - Dashboard navigation, public docs navigation, or design-system changes
   - Testing approach or coverage threshold changes
   - Breaking changes

4. **Update Docs if Needed**:
   - Update all affected docs in the same PR; do not stop at `AGENTS.md` when other docs are stale.
   - Keep agent-only rules in `AGENTS.md`, not `README.md`.
   - Keep visual direction in `DESIGN.md`.
   - Keep public/user-facing behavior in `README.md` and Mintlify docs as appropriate.
   - Keep Mintlify nav changes in `docs/docs.json` alongside any new, renamed, or removed docs pages.

5. **Create Pull Request**: If changes are needed:
   - Create a branch named `copilot/maintain-docs-YYYY-MM-DD`
     <!-- NOTE: Replace YYYY-MM-DD with the actual run date on each execution,
          e.g. copilot/maintain-docs-2026-03-07. A static date causes branch collisions
          on repeated daily runs. Use a date expression or ${{ github.run_id }}.
          The `copilot/` prefix is required for GitHub Copilot coding agent branches. -->
   - Update the affected documentation files
   - Create a PR with:
     - Title: "docs: update repository docs from merged PRs and source changes"
     - Description: List the changes reviewed and which docs were updated
     - Label: `documentation`
     - Auto-merge enabled if all checks pass

6. **Quality Checks**:
   - Ensure Markdown and MDX formatting is correct
   - Verify all links and references are accurate
   - Check that code examples and commands match current patterns
   - Ensure sections remain organized and readable
   - Preserve the current bot coverage thresholds and web PR #626 ratcheted baseline
     unless the real gates change

7. **If No Changes Needed**: Close silently or note in logs that repository docs are current.

Always maintain accuracy and completeness across the repository docs, not just one file.
