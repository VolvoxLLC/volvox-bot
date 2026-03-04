# Code Quality Improvements

## Task 1: Refactor events.js

Split src/modules/events.js (959 lines) into smaller, focused handler modules.

### Current Structure

- events.js has ~959 lines with many event handlers mixed together
- Handles: ready, messageCreate, interactionCreate, reactionAdd/Remove, voiceStateUpdate, etc.

### Target Structure

Create separate modules in src/modules/events/:

- ready.js - Client ready handler
- messageCreate.js - Message handling (AI, moderation, spam, etc.)
- interactionCreate.js - Slash commands, buttons, modals
- reactionHandlers.js - Starboard, reaction roles, polls
- voiceStateUpdate.js - Voice channel tracking
- guildMemberAdd.js - Welcome messages

### Steps

1. Create src/modules/events/ directory
2. Move each handler to its own file
3. Update events.js to import and register all handlers
4. Keep the same exports (registerReadyHandler, registerEventHandlers, etc.)
5. Run pnpm lint and pnpm test after changes
6. Commit with conventional commits

## Task 2: Add Missing Tests

Add test coverage for files without tests.

### Files to Test (priority order)

1. src/utils/cronParser.js
2. src/utils/flattenToLeafPaths.js
3. src/api/utils/dangerousKeys.js
4. src/modules/pollHandler.js
5. src/modules/reviewHandler.js
6. src/modules/reputationDefaults.js

### Steps

1. Create test files in tests/ matching source structure
2. Follow existing test patterns (Vitest, describe/it/expect)
3. Test both happy paths and edge cases
4. Mock external dependencies (Discord.js, DB, etc.)
5. Run pnpm test to verify coverage increases
6. Commit with conventional commits

## Standards

- ESM imports/exports
- Single quotes
- 2-space indent
- Semicolons required
- Use Winston logger (no console.*)
