# RF-002b Batch 3: Hooks, Contexts, Lib, Utils Audit

---

**Audited by:** openai-codex/gpt-5.2-codex  
**Reviewed by:** claude-opus-4-5 (Veritas)  
**Date:** 2026-02-02  
**Initiative:** RF-002 Cross-Model Code Audit  
**Scope:** 65 files, ~8,000 lines (hooks, contexts, lib, utils)

---

## Opus Review Summary

Codex reported 4 findings. All 4 confirmed valid. Strong focus on state management — Codex caught real bugs that would cause silent data loss.

## Findings

### Finding 1: Debounced feature updates lose state on re-render ✅ CONFIRMED (BUG)

- **Severity:** Medium
- **File:** `web/src/hooks/useFeatureSettings.ts`
- **Line(s):** ~98–99
- **Category:** State / Quality
- **Description:** `timeoutRef` and `pendingRef` are plain objects (`{ current: ... }`) instead of `useRef`. Every re-render creates new objects, nuking pending patches and timers.
- **Impact:** Settings toggles can silently fail to persist. Rapid toggling drops updates.
- **Recommendation:** Replace with `useRef()`. Clear timer on unmount.
- **Opus Note:** Verified at lines 98-99. This is a real bug, not just a code quality issue.

---

### Finding 2: Debounced task save clears dirty state even on failure ✅ CONFIRMED

- **Severity:** Medium
- **File:** `web/src/hooks/useDebouncedSave.ts`
- **Line(s):** ~21, ~56
- **Category:** Data Integrity / State
- **Description:** `setChangedFields(new Set())` fires immediately after mutation, not on success. Failed saves appear "saved" locally.
- **Impact:** User edits silently lost without feedback.
- **Recommendation:** Only clear `changedFields` in mutation's `onSuccess`. Show error toast on failure.
- **Opus Note:** Verified at lines 21 and 56. Both clear paths don't check mutation result.

---

### Finding 3: Reorder rollback can revert to stale list ✅ CONFIRMED

- **Severity:** Low–Medium
- **File:** `web/src/hooks/useSortableList.ts`
- **Line(s):** ~38–94
- **Category:** State / Data Integrity
- **Description:** Error rollback uses `items` from closure, which may be stale if parent updated since reorder started.
- **Impact:** UI can jump to outdated ordering, masking newer changes.
- **Recommendation:** Use ref to latest items for rollback, or refetch on error.

---

### Finding 4: Query key mutates caller array ✅ CONFIRMED

- **Severity:** Low
- **File:** `web/src/hooks/useBulkTaskMetrics.ts`
- **Line(s):** ~155
- **Category:** Quality / State
- **Description:** `taskIds.sort()` mutates the original array in-place.
- **Impact:** Subtle reordering bugs in parent components.
- **Recommendation:** `[...taskIds].sort().join(',')` — sort a copy.
- **Opus Note:** Verified at line 155. One-line fix.

---

## Summary

| Severity | Count |
| -------- | ----- |
| Medium   | 2     |
| Low-Med  | 1     |
| Low      | 1     |

| Category       | Count |
| -------------- | ----- |
| State          | 4     |
| Data Integrity | 2     |
| Quality        | 2     |
