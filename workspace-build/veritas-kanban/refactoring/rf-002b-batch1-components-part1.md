# RF-002b Batch 1: Components Part 1 Audit

---

**Audited by:** openai-codex/gpt-5.2-codex  
**Reviewed by:** claude-opus-4-5 (Veritas)  
**Date:** 2026-02-02  
**Initiative:** RF-002 Cross-Model Code Audit  
**Scope:** 58 files, ~12,400 lines (React components, first half)

---

## Opus Review Summary

Codex reported 5 findings. All 5 confirmed valid. Caught real state bugs and accessibility gaps.

## Findings

### Finding 1: Activity feed animation IDs never persisted ✅ CONFIRMED

- **Severity:** Medium
- **File:** `web/src/components/activity/ActivityFeed.tsx`
- **Line(s):** ~629–635
- **Category:** State
- **Description:** When fresh activity IDs are detected, `knownIdsRef.current` is NOT updated before the early return. Same items re-animate on subsequent renders.
- **Impact:** Repeated "new" animations, flicker.
- **Recommendation:** Update `knownIdsRef.current = currentIds` before the early return.
- **Opus Note:** Verified — line 635 (`knownIdsRef.current = currentIds`) only executes when NO fresh items are found. The ref stays stale when fresh items exist.

---

### Finding 2: State update inside useMemo (render-time side effect) ✅ CONFIRMED

- **Severity:** Medium
- **File:** `web/src/components/layout/ArchiveSidebar.tsx`
- **Line(s):** ~228–230
- **Category:** State
- **Description:** `useMemo` used to call `setVisibleCount(PAGE_SIZE)` — this is a side effect during render.
- **Impact:** React warnings, potential render loops.
- **Recommendation:** Replace with `useEffect`.
- **Opus Note:** Verified at line 228. Comment even says "Reset visible count when filters change" — clearly an effect, not a memo.

---

### Finding 3: Stale mutation of selection set on restore ✅ CONFIRMED

- **Severity:** Low
- **File:** `web/src/components/archive/ArchivePage.tsx`
- **Category:** State
- **Description:** `selectedIds.delete(taskId)` mutates the Set directly, then creates a new Set from the mutated one.
- **Impact:** Stale selection state if async restore is in-flight.
- **Recommendation:** Use functional update: `setSelectedIds(prev => { const next = new Set(prev); next.delete(taskId); return next; })`.

---

### Finding 4: Clickable divs without keyboard support ✅ CONFIRMED

- **Severity:** Medium
- **File:** `BacklogPage.tsx` (line 246), `ArchivePage.tsx` (line 287)
- **Category:** Accessibility
- **Description:** Task cards use `onClick` on `<div>` without `role="button"`, `tabIndex`, or keyboard handlers.
- **Impact:** Keyboard/assistive tech users can't interact with cards. Fails WCAG 2.1.1.
- **Recommendation:** Use `<button>` or add `role="button"` + `tabIndex={0}` + `onKeyDown` for Enter/Space.

---

### Finding 5: Command palette search input missing accessible label ✅ CONFIRMED

- **Severity:** Low
- **File:** `web/src/components/layout/CommandPalette.tsx`
- **Category:** Accessibility
- **Description:** Search input uses placeholder only, no `aria-label`.
- **Recommendation:** Add `aria-label="Search commands"`.

---

## Summary

| Severity | Count |
| -------- | ----- |
| Medium   | 3     |
| Low      | 2     |

| Category      | Count |
| ------------- | ----- |
| State         | 3     |
| Accessibility | 2     |
