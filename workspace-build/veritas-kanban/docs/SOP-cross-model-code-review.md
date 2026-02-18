# SOP: Cross-Model Code Review (Claude ↔ GPT)

**Rule (non-negotiable):** If Claude wrote it, GPT reviews it. If GPT wrote it, Claude reviews it. The author may self-check during development, but the final gate must be a different model.

---

## When to Trigger

| Work Type                        | Review Required?                    |
| -------------------------------- | ----------------------------------- |
| Application code, infra, scripts | ✅ Always                           |
| Docs/content                     | ⚠️ Only if accuracy/safety critical |
| Research summaries               | Optional (human discretion)         |

If in doubt, review.

---

## Workflow

1. **Authoring task completes** (status remains `in-progress`).
2. **Create review task** referencing the original:
   - Title: `Review: <orig task title>`
   - Type: `code`
   - Sprint/project identical
   - Description includes acceptance criteria + diff link(s)
3. **Assign to opposite model** (via OpenClaw or other orchestrator):
   ```
   Hey Codex, review PR for task_1234. Checklist below.
   ```
4. **Reviewer steps**:
   - Pull branch / run tests (if applicable)
   - Use `docs/SOP-agent-task-workflow.md` for lifecycle
   - Log findings as subtasks or checklist entries
   - Severity tagging: High / Medium / Low / Nit
5. **Outcomes**:
   - ✅ No issues → comment summary + mark review task done → original task can go to `done`
   - ❌ Issues → create fix subtasks on original task, set status `blocked` until resolved
6. **Comms**: Reviewer leaves structured comment:
   ```
   ## Findings
   - [High] Path traversal (see notes)
   - [Low] Missing aria-label
   ## Verdict
   Changes required.
   ```
7. **Audit trail**: Update commit message or PR description with `[author: claude-sonnet-4-5][reviewed-by: gpt-5.1-codex]`.

---

## Review Checklist

| Category          | Questions                                                        |
| ----------------- | ---------------------------------------------------------------- |
| **Security**      | Auth enforced? Input validated? Path traversal? Secrets handled? |
| **Reliability**   | Error handling? Race conditions? Timeouts? File locking?         |
| **Performance**   | Avoid O(n²)? Streaming vs buffering? Caching appropriate?        |
| **Accessibility** | Keyboard support? aria-labels? Color contrast?                   |
| **Docs**          | README/docs updated? Migration notes? Tests updated?             |

Adapt per task type.

---

## Prompt Template (Reviewer)

```
You are the cross-model reviewer. The code was authored by <model>. Apply the checklist:
1. Pull latest branch <branch>.
2. Run tests (if any).
3. For each issue, note severity (High/Medium/Low/Nit) + file/line + fix suggestion.
4. Summarize verdict: Approve or Changes Required.
5. Update task <id> with findings and completion summary.
```

Store in `prompt-registry/cross-model-review.md`.

---

## Recording Findings

- Add subtasks under the original task for each confirmed bug.
- Reference GitHub issues if they existed.
- Use Lessons Learned to capture systemic insights (e.g., “Always use withFileLock() when touching JSON stores”).

---

## Escalation

| Scenario                                        | Action                                            |
| ----------------------------------------------- | ------------------------------------------------- |
| Reviewer disagrees with author but fix is minor | Leave comment + request change.                   |
| Reviewer finds high severity bug                | Block task, ping human immediately.               |
| Author disputes reviewer findings               | Create triage meeting or ask human to adjudicate. |

This SOP preserved a 91% accuracy rate in RF-002. Keep following it.
