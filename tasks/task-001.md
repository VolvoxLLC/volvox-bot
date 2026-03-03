# Task 001: Refactor guilds.js God Route

## Parent
- **Master Task:** Code improvements from CODE_IMPROVEMENTS.md
- **Branch:** refactor/guilds-routes

## Context
The file `src/api/routes/guilds.js` is 1,622 lines and handles too many concerns:
- Analytics endpoints (charts, stats, activity)
- Member management (list, search, bulk actions)
- Guild configuration
- Moderation actions

This violates single responsibility principle and makes the file hard to maintain.

## Files to Work On
- `src/api/routes/guilds.js` - Source file to split
- Create: `src/api/routes/analytics.js` - Analytics endpoints
- Create: `src/api/routes/members.js` - Already exists but may need cleanup
- Create: `src/api/routes/guildConfig.js` - Config-specific routes
- Update: `src/api/index.js` - Register new routes
- Update tests as needed

## Requirements

### Phase 1: Extract Analytics Routes
Move these endpoints from guilds.js to analytics.js:
- `GET /:id/analytics/activity` - Message activity data
- `GET /:id/analytics/commands` - Command usage stats
- `GET /:id/analytics/voice` - Voice channel stats
- `GET /:id/analytics/overview` - Summary statistics
- `GET /:id/analytics/export` - CSV/JSON export

### Phase 2: Extract Config Routes
Move these endpoints to guildConfig.js:
- `GET /:id/config` - Get guild config
- `PATCH /:id/config` - Update config
- `POST /:id/config/reset` - Reset to defaults

### Phase 3: Cleanup guilds.js
After extraction, guilds.js should only handle:
- Basic guild info endpoints
- Guild validation middleware exports

## Constraints
- Do NOT change API behavior - this is pure refactoring
- Keep all existing tests passing
- Export shared functions (like `parsePagination`, `parseAnalyticsRange`) from a utils file
- Update imports in index.js

## Acceptance Criteria
- [ ] analytics.js created with all analytics endpoints
- [ ] guildConfig.js created with config endpoints
- [ ] guilds.js reduced to <500 lines
- [ ] All existing tests pass
- [ ] No API behavior changes
- [ ] Proper JSDoc on extracted functions
- [ ] Code passes lint check

## Results
_[To be filled by subagent]_

**Status:** [In Progress]
**Commits:** 
**Issues:** 
