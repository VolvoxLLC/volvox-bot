# Task: Centralize Magic Numbers and Time Constants

## Context
The codebase has time constants scattered throughout (24 * 60 * 60 * 1000 appearing 8+ times). This makes maintenance hard and configuration impossible.

## Files to Work On
- Create: `src/constants/time.js` - Time duration constants
- Create: `src/constants/index.js` - Re-export all constants
- Update files that use magic numbers:
  - `src/utils/duration.js`
  - `src/utils/guildSpend.js`
  - `src/utils/cache.js`
  - `src/api/middleware/rateLimit.js`
  - `src/api/middleware/redisRateLimit.js`
  - And others identified in CODE_IMPROVEMENTS.md

## Requirements

### Phase 1: Create Constants Module
Create `src/constants/time.js` with:
```javascript
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_HOUR = 60 * 60 * 1000;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
export const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

// Common durations
export const DURATION = {
  MINUTE: MS_PER_MINUTE,
  HOUR: MS_PER_HOUR,
  DAY: MS_PER_DAY,
  WEEK: MS_PER_WEEK,
  YEAR: MS_PER_YEAR,
};

// Rate limit windows
export const RATE_LIMIT = {
  SHORT: 15 * MS_PER_MINUTE,  // 15 minutes
  MEDIUM: MS_PER_HOUR,
  LONG: MS_PER_DAY,
};
```

### Phase 2: Replace Magic Numbers
Replace inline calculations with imports:
- `24 * 60 * 60 * 1000` → `MS_PER_DAY` or `DURATION.DAY`
- `15 * 60 * 1000` → `RATE_LIMIT.SHORT`
- etc.

### Phase 3: Configurable Cache Sizes
Move hardcoded limits to constants:
- `MAX_MEMORY_CACHE_SIZE = 1000` in cache.js
- `MAX_ANALYTICS_RANGE_DAYS = 90` in guilds.js

## Constraints
- Do NOT change any behavior - only replace constants
- Keep all tests passing
- Run lint after changes

## Acceptance Criteria
- [ ] src/constants/time.js created with all time constants
- [ ] src/constants/index.js created for clean imports
- [ ] All magic number occurrences replaced
- [ ] No behavioral changes
- [ ] All tests pass
- [ ] Lint passes

## Progress Tracking
Commit after each file is updated:
1. "refactor: create centralized time constants module"
2. "refactor: replace magic numbers in duration.js"
3. etc.
