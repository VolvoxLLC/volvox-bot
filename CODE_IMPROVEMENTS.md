# Code Improvement Opportunities

Based on comprehensive analysis of the volvox-bot codebase (159 JS files, ~50k lines).

## 🔴 Critical Issues

### 1. Large File Refactoring Needed
**Files exceeding 500 lines need decomposition:**

| File | Lines | Issue |
|------|-------|-------|
| `src/api/routes/guilds.js` | 1,622 | God route - handles analytics, members, config, moderation |
| `src/api/routes/conversations.js` | 1,069 | Multiple concerns (conversations + flagged messages) |
| `src/api/routes/members.js` | 1,006 | Member management + bulk actions + reputation |
| `src/modules/events.js` | 959 | Event handler doing too much - violates SRP |
| `src/modules/config.js` | 904 | Config logic + caching + merging + validation |
| `src/modules/triage.js` | 806 | Complex AI triage - could split by stage |

**Recommendation:** Split into smaller modules with single responsibilities.

---

## 🟠 High Priority

### 2. Missing Test Coverage
**Files without tests:**
- `src/modules/pollHandler.js` - No tests
- `src/modules/reputationDefaults.js` - No tests
- `src/modules/reviewHandler.js` - No tests
- `src/utils/cronParser.js` - No tests
- `src/utils/flattenToLeafPaths.js` - No tests
- `src/commands/voice.js` - Command exists but no test file

### 3. TODO Items in Code
```javascript
// src/utils/permissions.js:132
// TODO(#71): check guild-scoped admin roles once per-guild config is implemented

// src/api/routes/guilds.js:1182
// TODO(issue-122): move slash-command analytics to a dedicated usage table

// src/modules/backup.js:18
// TODO: Consider switching to fs.promises for async operations
```

### 4. Magic Numbers & Hardcoded Values
Many time constants scattered throughout:
```javascript
// Should be configurable:
24 * 60 * 60 * 1000        // 1 day - appears 8+ times
15 * 60 * 1000             // 15 min - rate limit windows
365 * 24 * 60 * 60 * 1000  // 1 year - max duration
MAX_MEMORY_CACHE_SIZE = 1000  // utils/cache.js
```

**Recommendation:** Centralize in `src/constants/time.js` or make configurable.

---

## 🟡 Medium Priority

### 5. Error Handling Inconsistencies

**Inconsistent catch patterns:**
```javascript
// Some use empty catch (swallow errors):
} catch {
  // nothing
}

// Some log but don't rethrow:
} catch (err) {
  logError('...', { error: err.message });
}

// Some properly handle:
} catch (err) {
  error('Failed to...', { error: err.message });
  throw err;
}
```

**Files with empty catches to review:**
- `src/utils/cache.js:87`
- `src/utils/guildSpend.js:28`
- `src/utils/debugFooter.js:298`
- `src/api/utils/sessionStore.js:71`
- `src/api/utils/webhook.js:24`
- `src/api/utils/ssrfProtection.js:204,266`
- `src/api/middleware/redisRateLimit.js:69`
- `src/api/middleware/auditLog.js:140,203,231`
- `src/api/middleware/verifyJwt.js:46,53`
- `src/api/routes/community.js:714`
- `src/api/routes/health.js:20`

### 6. Potential Memory Leaks

**Event listeners without removal:**
- 58 `.on()` / `.once()` calls found
- Need audit of listener cleanup on shutdown/restart

**Timers without cleanup:**
- 55 `setTimeout` / `setInterval` instances
- Some may not be cleared on error paths

### 7. Database Query Patterns

**Good:** All queries use parameterized inputs (no SQL injection risk)

**Could improve:**
- Some queries build dynamic WHERE clauses - verify all are safe
- Missing query timeout handling in some places
- No connection pool exhaustion handling visible

---

## 🟢 Low Priority / Polish

### 8. Code Organization

**Import ordering inconsistent:**
Some files group by type (builtins, external, internal), others don't.

**Example standard:**
```javascript
// 1. Node builtins
import { readFileSync } from 'node:fs';

// 2. External packages
import { Client } from 'discord.js';

// 3. Internal modules (absolute)
import { getConfig } from '../modules/config.js';

// 4. Internal modules (relative)
import { helper } from './helper.js';
```

### 9. JSDoc Coverage

Many functions lack JSDoc types, making IDE support weaker.

### 10. Naming Consistency

Some inconsistency in naming:
- `logError` vs `error` (logger imports)
- `guildId` vs `id` vs `serverId` in different contexts
- `userId` vs `user_id` (JS vs DB naming)

---

## 📊 Metrics Summary

| Metric | Count |
|--------|-------|
| Total JS files | 159 |
| Async functions | 441 |
| Await statements | 1,334 |
| Promise chains (.then/.catch) | 149 |
| Throw statements | 90 |
| New Error instances | 52 |
| Database queries | 816 |
| setTimeout/setInterval | 55 |
| Event listeners | 58 |
| TODO/FIXME comments | 3 |

---

## 🎯 Recommended Actions (Priority Order)

1. **Split large route files** — Start with `guilds.js` (1,622 lines)
2. **Add missing tests** — Focus on `pollHandler.js`, `reviewHandler.js`
3. **Centralize magic numbers** — Create `src/constants/` directory
4. **Audit error handling** — Review all empty catch blocks
5. **Document public APIs** — Add JSDoc to exported functions
6. **Standardize imports** — Enforce consistent ordering via lint rule
