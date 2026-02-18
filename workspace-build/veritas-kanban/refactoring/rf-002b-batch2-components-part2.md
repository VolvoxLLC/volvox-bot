# RF-002b Batch 2: Components Part 2 Audit

---

**Audited by:** openai-codex/gpt-5.2-codex  
**Reviewed by:** claude-opus-4-5 (Veritas)  
**Date:** 2026-02-02  
**Initiative:** RF-002 Cross-Model Code Audit  
**Scope:** 57 files, ~9,000 lines (React components, second half)

---

## Opus Review Summary

Codex reported 6 findings. All 6 confirmed valid. Good mix of state management, accessibility, and security findings.

## Findings

### Finding 1: State updates during render in ConflictResolver ✅ CONFIRMED

- **Severity:** Medium
- **File:** `web/src/components/task/ConflictResolver.tsx`
- **Line(s):** ~68, ~121
- **Category:** State
- **Description:** `setSelectedFile()` and `setManualContent()` called directly during render. Causes React warnings and potential render loops.
- **Impact:** Unstable UI, infinite rerenders possible.
- **Recommendation:** Move to `useEffect` with proper deps.

---

### Finding 2: GitSelectionForm state drift from task updates ✅ CONFIRMED

- **Severity:** Low
- **File:** `web/src/components/task/git/GitSelectionForm.tsx`
- **Category:** State
- **Description:** Sync effect depends on `task.id` but reads `task.git`. Background refetches that change git config without changing task ID won't sync.
- **Recommendation:** Add `task.git` fields to dependency array.

---

### Finding 3: AgentStatusIndicator uptime never re-computes ✅ CONFIRMED

- **Severity:** Low
- **File:** `web/src/components/shared/AgentStatusIndicator.tsx`
- **Line(s):** ~284–287
- **Category:** State
- **Description:** `useMemo` depends on `forceUpdate` (the setter function, which is a stable reference). The `setInterval` increments the counter triggering re-renders, but `useMemo` sees the same setter reference every time — so `uptimeDisplay` is actually recomputed on every render anyway (because the component re-renders from the state change). The dep list is misleading but the behavior accidentally works.
- **Opus Note:** Downgraded from bug to **quality issue**. The uptime DOES update because the component re-renders from `forceUpdate(n => n+1)`, causing `useMemo` to re-evaluate. But the dependency array is wrong — `forceUpdate` never changes. Should use the counter value as the dep, or just remove `useMemo` since it recalculates every render anyway.

---

### Finding 4: Missing aria-labels on attachment icon buttons ✅ CONFIRMED

- **Severity:** Low
- **File:** `web/src/components/task/AttachmentsSection.tsx`
- **Category:** Accessibility
- **Description:** Icon-only buttons (expand, download, delete) lack `aria-label`.
- **Impact:** Fails WCAG 4.1.2.

---

### Finding 5: Missing aria-labels on comment action buttons ✅ CONFIRMED

- **Severity:** Low
- **File:** `web/src/components/task/CommentsSection.tsx`
- **Category:** Accessibility
- **Description:** Edit/Delete icon buttons lack `aria-label`, only visible on hover.
- **Impact:** Inaccessible to screen readers and keyboard users.

---

### Finding 6: window.open without noopener (tabnabbing) ✅ CONFIRMED

- **Severity:** Low
- **File:** `PRDialog.tsx`, `PreviewPanel.tsx`, `WorktreeStatus.tsx`
- **Category:** Security
- **Description:** `window.open(url, '_blank')` without `noopener,noreferrer` in 4 locations.
- **Impact:** Opened tab can access `window.opener` for tabnabbing attacks.
- **Recommendation:** Add `'noopener,noreferrer'` third argument or use `<a>` with `rel`.
- **Opus Note:** Verified at 4 call sites across 3 files.

---

## Summary

| Severity | Count |
| -------- | ----- |
| Medium   | 1     |
| Low      | 5     |

| Category      | Count |
| ------------- | ----- |
| State         | 3     |
| Accessibility | 2     |
| Security      | 1     |
