# Weekly Changelog

---
on:
  schedule:
    - cron: '0 18 * * 5'  # Fridays at 6 PM UTC
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

# Weekly Changelog Update

## Purpose

At the end of each ISO week, compile a recap of all user-facing changes shipped
and add it to **both** changelog surfaces:

1. `docs/changelog.mdx` — Mintlify changelog (MDX `<Update>` components).
2. `docs/wiki-pages/Changelog.md` — GitHub wiki changelog (plain Markdown).

## Instructions for the Agent

### 1. Determine the current ISO week

Calculate the ISO week number and date range for the current run date.
Examples: `2026-W18` covers April 27–May 3, 2026; `2026-W19` covers May 4–10, 2026.

### 2. Fetch merged PRs for the week

Query the repository for all PRs merged during Monday–Sunday of the current ISO week.
Examine each PR's title, description, labels, and changed files.

### 3. Filter to user-facing changes

**Include** PRs that change features, UX, API behavior, configuration, commands, or
user-visible documentation.

**Exclude** PRs that are purely internal with no user-visible impact:
- `chore:` dependency bumps or tooling changes with no behavioral effect
- `ci:` pipeline and workflow changes only
- `test:` test-only additions or fixes
- `refactor:` internal restructures with identical behavior
- Merge commits and automated bot PRs that do not add user-facing value

### 4. Write the weekly recap in `docs/changelog.mdx`

Insert a new `<Update>` block at the **very top** of the file, immediately after the
YAML frontmatter (the `---` block). Place it before any existing `<Update>` entries.

**Block format:**

```mdx
<Update label="YYYY-W##" description="Week of <Mon D> – <Fri D>, YYYY" tags={["Weekly recap"]}>
## This week in Volvox.Bot

<One sentence describing the week's overall theme.>

**Feature or fix name** — One-sentence description with a [docs link](/features/relevant) when applicable.

**Another change** — One sentence.

For day-by-day details, see the entries below.
</Update>
```

Rules:
- `label` must be the ISO week string (e.g., `2026-W18`). Zero-pad single-digit weeks.
- `description` uses the Monday–Friday date range of the week (not Monday–Sunday).
- `tags` is always `{["Weekly recap"]}`.
- List each notable change as a `**bold heading** — one sentence` bullet.
- Link to relevant Mintlify docs pages using relative paths (e.g., `/features/moderation`,
  `/dashboard`, `/features/tldr`).
- End with `For day-by-day details, see the entries below.`
- The label must be unique across all existing entries in the file. Check for collisions
  before inserting.

### 5. Write individual daily entries in `docs/changelog.mdx`

For each day in the current week that had at least one merged user-facing PR and does
**not** already have a `<Update label="YYYY-MM-DD" ...>` entry, add a new daily entry.
Insert daily entries in reverse-chronological order, below the weekly recap block and
above the previous week's entries.

**Daily entry format:**

```mdx
<Update label="YYYY-MM-DD" description="<Month> YYYY" tags={["Features", "Improvements", "Fixes"]}>
## New features

**Feature name** — One-sentence description. Link to [docs page](/features/relevant).

## Improvements

**Improvement name** — One sentence.

## Fixes

**Fix name** — One sentence.
</Update>
```

Rules:
- Only include section headings (`## New features`, `## Improvements`, `## Fixes`) for
  types that actually appear in that day's changes. Omit empty sections.
- Tags should reflect which types are present: include `"Features"` only if there are
  new features, `"Improvements"` only if there are improvements, `"Fixes"` only if there
  are fixes.
- Skip days with no user-facing merged PRs.
- Skip days that already have an entry in the file.

### 6. Update the wiki changelog in `docs/wiki-pages/Changelog.md`

Insert a new `##` section at the top, immediately after the introductory paragraph and
before the previous week's section.

**Section format:**

```markdown
## Week YYYY-W## (Mon D – Fri D, YYYY)

<One sentence describing the week's overall theme.>

- **Feature or fix name** — One-sentence description.
- **Another change** — One sentence.
```

Rules:
- Use plain Markdown only — no MDX components.
- Section heading: `## Week YYYY-W## (Mon D – Fri D, YYYY)`.
- Each item is a `- **bold name** — one sentence` bullet.
- No links to internal docs pages (wiki readers may not have access to the Mintlify site).
- Keep the section concise — cover the same highlights as the weekly recap.

### 7. Create a pull request

If any changes were made to either file, create a PR:

- **Branch**: `copilot/weekly-changelog-YYYY-W##`
  <!-- NOTE: Replace YYYY-W## with the actual ISO week computed at runtime
       (e.g., copilot/weekly-changelog-2025-W03 for the third week of 2025).
       A static string causes branch collisions on repeated weekly runs. -->
- **Title**: `docs(changelog): week YYYY-W## recap`
- **Description**: List the PRs reviewed and summarize the changes captured in both files.
- **Label**: `documentation`
- **Auto-merge**: Enable if all checks pass.

### 8. Quality checks before opening the PR

- All `<Update>` `label` values in `docs/changelog.mdx` are unique.
- Weekly recap label is `YYYY-W##` (e.g., `2026-W18`). Single-digit weeks are zero-padded.
- Daily entry labels are `YYYY-MM-DD`.
- The weekly recap block appears before all daily entries for that week.
- Wiki `Changelog.md` sections use `## Week YYYY-W##` headers.
- All relative links in MDX entries point to pages that exist in `docs/docs.json`.

### 9. If no user-facing changes were merged this week

Skip creating a PR. Log a note that no user-facing changes were found for the week.
