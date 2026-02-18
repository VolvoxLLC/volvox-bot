# Real-World Agent Workflow Examples

Steal these end-to-end flows when building your own automations. Each example shows the goal, prompts, API/CLI calls, and outputs we expect.

---

## 1. Feature Development Sprint (BrainMeld PRD excerpt)

**Goal:** Build "Lessons Learned" field.

1. **Create task**
   ```bash
   vk create "Feature: Lessons Learned field" --project veritas-kanban --type feature --priority medium
   ```
2. **Prompt (worker)**
   ```
   Implement markdown lessonsLearned field on tasks (UI + API). Include migration + docs. Cross-model review required.
   ```
3. **Workflow**
   - `vk begin <id>`
   - Implement server -> shared -> web changes
   - Update docs + tests
   - `vk done <id> "Added lessons learned field"`
4. **Outputs**
   - Task summary with PR link
   - Lessons Learned comment describing future usage

---

## 2. Bug Fix (Archive bulk action)

**Goal:** Sprint archive button fails.

1. Create bug task referencing GitHub Issue #86.
2. Subtasks:
   - Reproduce in dev
   - Inspect network requests
   - Patch bulk archive handler
   - Add regression test (Playwright)
3. CLI flow: `vk begin`, fix, `vk done "Bulk archive now calls API"`
4. Cross-model review ensures UI + API parity.

---

## 3. Documentation Update

**Goal:** Add sanity checks to Getting Started.

1. Task description includes sections to cover (API, UI, agent pickup).
2. Agent edits `docs/GETTING-STARTED.md` + `docs/TROUBLESHOOTING.md` references.
3. Completion summary links to diff + screenshot placeholders.

---

## 4. Security Audit (RF-002 style)

**Goal:** Run cross-model audit on repo.

1. Task -> `type=security`, `project=veritas-kanban`.
2. Subtasks: scope, run Codex audit, run Claude review, compile findings, create issues.
3. Agents spawn using research prompt template, save results to `refactoring/rf-002/*`.
4. Deliverables: Markdown report, HTML deck, GitHub issues.

---

## 5. Content Production (Podcast clip → LinkedIn post)

1. Task `type=content` with acceptance criteria (summary, caption, schedule time).
2. Agent fetches transcript, writes summary, drafts LinkedIn copy, saves assets to `projects/start-small-think-big/...`.
3. Completion summary includes copy + asset path; lessons learned capture platform insights.

---

## 6. Research & Report (Champions)

1. Task `type=research`, project `social`, sprint `CHAMP-02`.
2. Prompt includes dossier template, required sources, HTML deck requirement.
3. Agent workflow: gather sources, write Markdown, generate HTML via script, `brain-write.sh` to mirror.
4. Final comment: TL;DR + links to both artifacts.

---

## Pattern to Copy

For any workflow:

1. **Task** with crystal-clear done definition.
2. **Prompt** stored in registry.
3. **API/CLI** calls scripted (vk begin/done, time tracking, status updates).
4. **Artifacts** saved to predictable paths and mirrored to Brain/engram if needed.
5. **Cross-model review** if code/critical.
6. **Lessons learned** field updated for systemic knowledge.

Use these recipes as seeds for your own automation playbooks.
