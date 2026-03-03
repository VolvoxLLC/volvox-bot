# Task 002: Add Missing Tests

## Parent
- **Master Task:** Code improvements from CODE_IMPROVEMENTS.md
- **Branch:** refactor/missing-tests

## Context
Several modules have no test coverage:
- `src/modules/pollHandler.js` - Poll voting logic
- `src/modules/reputationDefaults.js` - Default reputation config
- `src/modules/reviewHandler.js` - Review claim handling
- `src/utils/cronParser.js` - Cron expression parsing
- `src/utils/flattenToLeafPaths.js` - Object flattening utility

## Files to Create
- `tests/modules/pollHandler.test.js`
- `tests/modules/reputationDefaults.test.js`
- `tests/modules/reviewHandler.test.js`
- `tests/utils/cronParser.test.js`
- `tests/utils/flattenToLeafPaths.test.js`

## Requirements

### pollHandler.test.js
Test the poll voting logic:
- Handle poll vote reactions
- Validate vote eligibility
- Update poll results
- Close polls and announce winners

### reputationDefaults.test.js
Test default reputation configuration:
- Default XP values
- Level thresholds
- Role rewards structure

### reviewHandler.test.js
Test review claim handling:
- Claim review items
- Unclaim/release reviews
- Complete reviews with feedback
- Prevent double-claiming

### cronParser.test.js
Test cron expression parsing:
- Parse standard cron formats
- Handle special characters (*, /, -)
- Calculate next run times
- Error on invalid expressions

### flattenToLeafPaths.test.js
Test object flattening:
- Flatten nested objects to dot paths
- Handle arrays
- Preserve primitive values
- Edge cases (null, empty objects)

## Acceptance Criteria
- [ ] All 5 test files created
- [ ] Tests cover main functionality
- [ ] Tests pass (`pnpm test`)
- [ ] Coverage meets project standards (>80%)
- [ ] No lint errors

## Results
_[To be filled by subagent]_

**Status:** [In Progress]
**Commits:** 
**Issues:** 
