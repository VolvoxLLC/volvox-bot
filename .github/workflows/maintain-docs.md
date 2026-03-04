---
on:
  schedule:
    - cron: '0 9 * * *'  # 4 AM EST = 9 AM UTC
  workflow_dispatch: {}

permissions:
  contents: true
  pull-requests: true
  issues: true

tools:
  github:
  edit:
  
engine: copilot

---

# Maintain AGENTS.md Documentation

## Purpose

Keep the AGENTS.md file accurate and current by:
- Reviewing merged pull requests since last run
- Checking updated source files (src/, web/, tests/, etc.)
- Updating AGENTS.md to reflect any architectural or pattern changes
- Creating a pull request if updates are needed

## Instructions for the Agent

1. **Fetch Recent Changes**: Query the repository for merged PRs and updated files from the past 24 hours

2. **Review Architecture Changes**: Check if any of these directories have significant changes:
   - `src/modules/` - New modules or modified patterns
   - `src/api/` - API route or middleware changes
   - `src/commands/` - New slash commands
   - `src/utils/` - Utility additions or pattern changes
   - `web/` - Dashboard updates
   - `tests/` - Testing patterns

3. **Analyze Merged PRs**: Look at PR titles and descriptions to identify:
   - New features added
   - Architecture decisions
   - Pattern changes
   - Testing approach changes
   - Breaking changes

4. **Update AGENTS.md if Needed**:
   - Architecture Overview section: Add new modules or directories
   - Key Patterns section: Document new patterns or changes
   - Common Tasks section: Update task examples if workflows changed
   - Resources section: Add new links if applicable

5. **Create Pull Request**: If changes are needed:
   - Create a branch named `docs/maintain-docs-2026-03-04`
   - Update AGENTS.md with discovered changes
   - Create a PR with:
     - Title: "docs: update AGENTS.md from merged PRs and source changes"
     - Description: List the changes reviewed and what was updated
     - Label: `documentation`
     - Auto-merge enabled if all checks pass

6. **Quality Checks**:
   - Ensure markdown formatting is correct
   - Verify all links and references are accurate
   - Check that code examples match current patterns
   - Ensure sections remain organized and readable

7. **If No Changes Needed**: Close silently or note in logs that AGENTS.md is current

## Context

AGENTS.md documents:
- Code quality standards (ESM, single quotes, semicolons, 2-space indent, Winston logger)
- Architecture overview (src/, web/ structure)
- Key patterns (config system, caching, AI integration, database)
- Common tasks (adding features, commands, API endpoints)
- Testing requirements (80% coverage)
- Git workflow and review bots
- Troubleshooting guides
- Resources

Always maintain accuracy and completeness of this documentation file.
