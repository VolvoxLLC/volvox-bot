# Time Tracking Bug: 17,547 Hours Anomaly

**Date:** 2026-02-12  
**Severity:** High — Data integrity issue  
**Status:** Fixed

## Problem

The Veritas Kanban dashboard showed **17,547 hours** (nearly 2 years) of time tracking for the `veritas-kanban` project, which has only existed for ~2 weeks.

## Root Cause

One telemetry event had a corrupt `durationMs` value:

```json
{
  "taskId": "task_20260210_wht-mV",
  "type": "run.completed",
  "agent": "MARVIN",
  "durationMs": 63169061000, // ❌ 17,546 hours
  "timestamp": "2026-02-10T13:27:42.483Z"
}
```

**Correct value:** 880,932 ms (14.68 minutes)  
**Reported value:** 63,169,061,000 ms (17,546 hours)  
**Inflation factor:** 71,707x

### Why It Happened

The bug occurred during **manual durationMs calculation** by an agent. The AGENTS.md documentation instructed agents to "calculate durationMs from start to now" but didn't provide explicit instructions on HOW, leading to:

- **Unit conversion errors** (mixing seconds/milliseconds)
- **Timestamp arithmetic mistakes** (using epoch timestamp directly instead of duration)
- **No validation** (server accepted impossible values)

Brad's hypothesis: **Not a simple ms/s confusion (which would be 1000x), but likely bad timestamp arithmetic** — possibly using partial timestamps, string concatenation, or mixed units in subtraction.

## Fix

### 1. Data Remediation

Patched the corrupt telemetry entry:

```bash
# Fixed events-2026-02-10.ndjson
63169061000 → 880932 ms
```

### 2. Server-Side Validation

Added validation in `/api/telemetry/events`:

```typescript
// Cap durationMs at 7 days (604,800,000 ms)
if (eventInput.type === 'run.completed' && 'durationMs' in eventInput) {
  const durationMs = (eventInput as any).durationMs;
  const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  if (typeof durationMs === 'number' && durationMs > MAX_DURATION_MS) {
    log.warn({ taskId: eventInput.taskId, durationMs, maxMs: MAX_DURATION_MS });
    (eventInput as any).durationMs = MAX_DURATION_MS;
  }
}
```

### 3. Documentation Update

Updated `~/clawd/AGENTS.md` with explicit calculation instructions:

**Before:**

```bash
# 2. Emit run.completed (calculate durationMs from start to now)
curl ... -d '{"type":"run.completed","durationMs":DURATION_MS}'
```

**After:**

```bash
# 1. Store start time
echo "$(date +%s%3N)" > /tmp/task_start_{TASK_ID}

# 2. Calculate duration using shell arithmetic
START_TIME=$(cat /tmp/task_start_{TASK_ID})
END_TIME=$(date +%s%3N)
DURATION_MS=$((END_TIME - START_TIME))

# 3. Emit run.completed with calculated duration
curl ... -d "{\"durationMs\":${DURATION_MS}}"
```

**Key rules added:**

- Always use `date +%s%3N` (milliseconds with 3-digit precision)
- Never manually type timestamp values
- Use shell arithmetic for duration calculation
- Server validates: durationMs < 7 days

## Verification

**Before fix:**

```
Time by project:
  veritas-kanban: 17,547 hours
  brainmeld: 18.75 hours
  unassigned: 7.21 hours

Total: 17,573 hours
```

**After fix:**

```
Time by project:
  brainmeld: 18.75 hours
  unassigned: 7.21 hours
  veritas-kanban: 0.32 hours

Total: 26.28 hours ✅
```

## Testing

All 1,263 server tests pass ✅

## Commits

- `df4fc8f` - Server validation + telemetry data patch
- `1940eda` - Documentation update with explicit calculation instructions

## Lessons Learned

1. **Validate inputs aggressively** — Even "trusted" agent-submitted data needs sanity checks
2. **Make implicit knowledge explicit** — "Calculate durationMs" without HOW leads to bugs
3. **Use tools, not manual math** — Shell arithmetic prevents unit conversion errors
4. **Detect data anomalies early** — 17K hours should have triggered an alert

## Related Issues

- GH #XX: Time tracking integrity
- Future: Add automated dashboard alerts for impossible values (>7 days per task)
