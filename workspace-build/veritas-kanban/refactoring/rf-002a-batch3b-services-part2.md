# RF-002a Batch 3b: Services Part 2 Audit

---

**Audited by:** openai-codex/gpt-5.2-codex  
**Reviewed by:** claude-opus-4-5 (Veritas)  
**Date:** 2026-02-02  
**Initiative:** RF-002 Cross-Model Code Audit  
**Scope:** 24 files, ~6,600 lines (services N-Z + metrics)

---

## Opus Review Summary

Codex reported 6 findings. After cross-model review, **all 6 confirmed valid**. Another clean batch with zero false positives. The race condition pattern continues from Batch 3a — systemic issue across the codebase.

## Findings

### Finding 1: Telemetry file reads fully buffered (blocking + memory) ✅ CONFIRMED

- **Severity:** Medium
- **File:** `server/src/services/telemetry-service.ts`
- **Line(s):** ~392–402
- **Category:** Performance / Reliability
- **Description:** `readEventFile()` uses `fs.readFile` + `gunzipSync` — loads entire telemetry file into memory and blocks event loop.
- **Impact:** Large telemetry datasets can freeze server or trigger OOM.
- **Recommendation:** Stream NDJSON with `createReadStream` + `readline` + `createGunzip`.
- **Opus Note:** Verified — `gunzipSync` at line 400 is synchronous and blocking.

---

### Finding 2: getEvents/getBulkTaskEvents load all events into memory ✅ CONFIRMED

- **Severity:** Medium
- **File:** `server/src/services/telemetry-service.ts`
- **Line(s):** ~177, ~237
- **Category:** Performance
- **Description:** Both methods read all events from all matching files, concatenate into single array, then filter/sort.
- **Impact:** Unbounded memory usage scaling with retention volume.
- **Recommendation:** Stream events with early filtering + limit. Add pagination/cursors.

---

### Finding 3: CSV export doesn't escape most fields (injection risk) ✅ CONFIRMED

- **Severity:** Low
- **File:** `server/src/services/telemetry-service.ts`
- **Line(s):** ~260–320
- **Category:** Security / Quality
- **Description:** Only `error` field is escaped. Other fields can contain commas, quotes, newlines, or Excel formula prefixes.
- **Impact:** Malformed CSV output; formula injection in spreadsheets.
- **Recommendation:** Escape all fields uniformly. Sanitize formula prefixes (`=`, `+`, `-`, `@`).

---

### Finding 4: Status history updates non-atomic (concurrent write loss) ✅ CONFIRMED

- **Severity:** Medium
- **File:** `server/src/services/status-history-service.ts`
- **Line(s):** ~60–140
- **Category:** Reliability
- **Description:** `logStatusChange()` does read-modify-write without locking. Same pattern as activity-service from Batch 3a.
- **Impact:** Lost status history entries, incorrect utilization metrics.
- **Recommendation:** Add `withFileLock()` wrapper or switch to append-only NDJSON.
- **Opus Note:** Verified — no lock imports in this file. Directly impacts agent utilization calculations on the dashboard.

---

### Finding 5: Notification persistence has same race condition ✅ CONFIRMED

- **Severity:** Low
- **File:** `server/src/services/notification-service.ts`
- **Line(s):** ~40–120
- **Category:** Reliability
- **Description:** `createNotification()` does unguarded read-modify-write on JSON file.
- **Impact:** Missed notifications or incorrect sent state.
- **Recommendation:** Add file lock or move to append-only log.

---

### Finding 6: O(n²) in sprint velocity computation ✅ CONFIRMED

- **Severity:** Low
- **File:** `server/src/services/metrics/task-metrics.ts`
- **Line(s):** ~150
- **Category:** Performance
- **Description:** `archivedTasks.some(a => a.id === task.id)` inside a loop over all tasks.
- **Impact:** Quadratic scaling with task count.
- **Recommendation:** Build `Set<string>` of archived IDs for O(1) lookups.
- **Opus Note:** Verified at line 150. Easy fix — `const archivedIds = new Set(archivedTasks.map(a => a.id))`.

---

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 3     |
| Low      | 3     |

| Category    | Count |
| ----------- | ----- |
| Security    | 1     |
| Performance | 3     |
| Reliability | 2     |

## Cross-Model Review Observations

Codex continues to show strong reliability analysis. The race condition pattern (read-modify-write without locking) is now confirmed in **5 services**: activity, chat, managed-list, status-history, and notifications. This is the #1 systemic issue — a single `withFileLock` wrapper sweep would fix all of them.

Telemetry streaming is the biggest performance win available — switching from buffered reads to streaming would dramatically improve memory usage under load.
