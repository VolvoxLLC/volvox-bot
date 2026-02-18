# RF-002c: Shared Layer Audit

---

**Audited by:** openai-codex/gpt-5.2-codex  
**Reviewed by:** claude-opus-4-5 (Veritas)  
**Date:** 2026-02-02  
**Initiative:** RF-002 Cross-Model Code Audit  
**Scope:** 30 files, ~1,800 lines (shared types, utils, constants)

---

## Opus Review Summary

Codex reported 3 findings. All 3 confirmed valid. Clean, small layer with minimal issues.

## Findings

### Finding 1: Browser runtime crash in `expandPath` due to `process.env` access ✅ CONFIRMED

- **Severity:** Medium
- **File:** `shared/src/utils/path.ts`
- **Line(s):** ~14–15
- **Category:** Correctness
- **Description:** `expandPath` accesses `process.env` directly. In browser bundles, `process` is undefined — throws `ReferenceError`.
- **Impact:** Any client-side usage crashes at runtime.
- **Recommendation:** Guard with `typeof process !== 'undefined'` or ensure this util is server-only.
- **Opus Note:** Verified at lines 14-15. If this file is tree-shaken out of the client bundle it's fine, but the shared layer implies cross-environment usage.

---

### Finding 2: Constants contain values not in type unions ✅ CONFIRMED

- **Severity:** Low
- **File:** `shared/src/utils/constants.ts`
- **Line(s):** ~12, ~23
- **Category:** Type Safety / Quality
- **Description:** `PRIORITY_LABELS` includes `critical` and `STATUS_LABELS` includes `cancelled`, but these values don't exist in the `TaskPriority` and `TaskStatus` type unions.
- **Impact:** UI can display labels for invalid states. Type system doesn't catch mismatches.
- **Recommendation:** Either add `critical`/`cancelled` to the type unions or remove from labels.
- **Opus Note:** Verified. These are likely forward-looking values that were added to labels before types. Should be synchronized.

---

### Finding 3: WSMessage lacks discriminated union safety ✅ CONFIRMED

- **Severity:** Low
- **File:** `shared/src/types/websocket.types.ts`
- **Line(s):** ~13–24
- **Category:** Type Safety
- **Description:** `WSMessage` uses `data: unknown` instead of a discriminated union. Consumers must cast, losing type safety.
- **Impact:** Runtime errors from incorrect data handling.
- **Recommendation:** Export a discriminated union type for all WS message variants.

---

## Summary

| Severity | Count |
| -------- | ----- |
| Medium   | 1     |
| Low      | 2     |

| Category    | Count |
| ----------- | ----- |
| Correctness | 1     |
| Type Safety | 2     |
