# RF-002a Batch 2: Routes Audit

---

**Audited by:** openai-codex/gpt-5.2-codex  
**Reviewed by:** claude-opus-4-5 (Veritas)  
**Date:** 2026-02-02  
**Initiative:** RF-002 Cross-Model Code Audit  
**Scope:** 36 files, ~5,900 lines (all route handlers)

---

## Opus Review Summary

Codex reported 8 findings. After cross-model review, **4 were downgraded or marked as false positives** because global authentication middleware (`app.use('/api', authenticate)` at `index.ts:357`) was not visible in the route files Codex reviewed. The global guard covers all `/api` routes — individual route files don't need per-route auth unless requiring elevated authorization (admin role).

### Adjusted Findings

---

### Finding 1: ~~Sensitive routes lack auth guards~~ → FALSE POSITIVE

- **Original Severity:** High → **Adjusted:** Info (False Positive)
- **File:** `server/src/routes/v1/index.ts`
- **Category:** Security
- **Opus Note:** `app.use('/api', authenticate)` in `index.ts:357` applies authentication globally to all `/api` routes before any route handler runs. Auth routes are mounted earlier (line 347-348) and correctly excluded. Not a real vulnerability.

---

### Finding 2: ~~Agent status update unauthenticated~~ → FALSE POSITIVE

- **Original Severity:** High → **Adjusted:** Info (False Positive)
- **File:** `server/src/routes/agent-status.ts`
- **Opus Note:** Covered by global `authenticate` middleware. However, this endpoint **should** consider requiring `authorize('admin')` since agent status manipulation is an administrative action. Downgraded to **Info** with a recommendation to add admin authorization.

---

### Finding 3: ~~Settings/config endpoints lack auth~~ → FALSE POSITIVE (partial)

- **Original Severity:** High → **Adjusted:** Low
- **File:** `server/src/routes/settings.ts`, `server/src/routes/config.ts`
- **Opus Note:** Authentication is covered globally. However, Codex has a valid point that config/settings writes should require **admin authorization** (`authorize('admin')`), not just authentication. Adjusted to Low — currently any authenticated user can modify server config.

---

### Finding 4: ~~Activity/notification deletion unauthenticated~~ → FALSE POSITIVE (partial)

- **Original Severity:** Medium → **Adjusted:** Low
- **File:** `server/src/routes/activity.ts`, `server/src/routes/notifications.ts`
- **Opus Note:** Authentication covered globally. Same recommendation as Finding 3 — destructive operations should require admin authorization.

---

### Finding 5: Attachment context leaks absolute filesystem paths ✅ CONFIRMED

- **Severity:** Medium
- **File:** `server/src/routes/tasks.ts`
- **Line(s):** ~240–330
- **Category:** Security
- **Description:** `GET /api/tasks/:id/context` returns `imagePaths` built from `attachmentService.getAttachmentPath()`, which are server filesystem paths. Leaks internal directory structure.
- **Impact:** Exposes server directory layout, could aid targeted attacks or LFI probing.
- **Recommendation:** Return attachment IDs or download URLs instead of filesystem paths.

---

### Finding 6: Activity pagination loads excess records and slices in memory ✅ CONFIRMED

- **Severity:** Medium
- **File:** `server/src/routes/activity.ts`
- **Line(s):** ~15–50
- **Category:** Performance
- **Description:** When `page > 0`, handler fetches `page * limit` items then slices. Scales linearly with page number.
- **Impact:** Increased latency and memory for large page values; potential DoS vector.
- **Recommendation:** Implement proper offset/limit in the service layer. Enforce max `limit` and max `page`.

---

### Finding 7: Task list pagination loads all tasks before slicing ✅ CONFIRMED

- **Severity:** Medium
- **File:** `server/src/routes/tasks.ts`
- **Line(s):** ~60–190
- **Category:** Performance
- **Description:** `listTasks()` loads all tasks into memory. Filtering and pagination occur after full load.
- **Impact:** Large task sets cause slow responses and high memory usage.
- **Recommendation:** Move filtering/pagination into storage layer.

---

### Finding 8: Comment/subtask/verification IDs use Math.random() ✅ CONFIRMED

- **Severity:** Low
- **File:** `server/src/routes/task-comments.ts`, `task-subtasks.ts`, `task-verification.ts`
- **Category:** Quality
- **Description:** IDs use `Date.now()` + `Math.random().toString(36)`. Not cryptographically strong and can collide under concurrency.
- **Impact:** Potential ID collisions under high concurrent writes.
- **Recommendation:** Use `crypto.randomUUID()` for all generated IDs.

---

## Adjusted Summary

| Severity | Count | Notes                                                      |
| -------- | ----- | ---------------------------------------------------------- |
| Critical | 0     |                                                            |
| High     | 0     | 3 originals downgraded (global auth covers)                |
| Medium   | 3     | Filesystem path leak, 2× pagination issues                 |
| Low      | 3     | Admin authz gaps on config/settings/deletes, ID generation |
| Info     | 2     | False positives (global auth)                              |

| Category      | Count (confirmed) |
| ------------- | ----------------- |
| Security      | 1 (path leak)     |
| Performance   | 2 (pagination)    |
| Quality       | 1 (ID generation) |
| Best Practice | 2 (admin authz)   |

## Cross-Model Review Observations

Codex's main blind spot in this batch was **not having visibility into the application bootstrap** (`index.ts`) where global middleware is applied. This is expected — the route files were reviewed in isolation. The auth-related findings show good security instincts but needed the full picture to properly assess.

The performance and quality findings (5-8) were all accurate and actionable.
