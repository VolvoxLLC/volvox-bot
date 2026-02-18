# Learnings Log

---

## [LRN-20260216-001] correction

**Logged**: 2026-02-16T11:15:00-05:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary

Failed to sync memory at session start and after completing work. Bill had to ask when last sync was — should never happen.

### Details

After context compaction, jumped straight into user requests without following AGENTS.md boot sequence (read SOUL.md, USER.md, daily memory, MEMORY.md, pull Mem0). Completed multiple significant tasks (session cleanup, gmail hook updates, skill installs, token fixes) without writing anything to daily notes or pushing to Mem0 until Bill called it out.

### Suggested Action

- Memory sync is NOT optional — it's step 1 of every session
- After compaction: ALWAYS re-hydrate before doing anything else
- After completing substantial work: ALWAYS update daily notes immediately, don't batch
- Treat memory writes like git commits — small and frequent, not one big dump at the end

### Metadata

- Source: user_feedback
- Related Files: AGENTS.md, memory/2026-02-16.md
- Tags: memory, discipline, boot-sequence, compaction

---
