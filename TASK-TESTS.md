# Task: Add Missing Tests

## Goal

Add test coverage for files without tests.

## CRITICAL RULES

1. Read ONE source file at a time
2. Create its test file
3. COMMIT immediately after each test file
4. DO NOT batch multiple files

## Priority Order

### Test 1: cronParser.js

Source: src/utils/cronParser.js

Test: tests/utils/cronParser.test.js

Steps:

1. Read src/utils/cronParser.js
2. Understand what it does (parses cron expressions?)
3. Create tests/utils/cronParser.test.js
4. Test valid inputs, invalid inputs, edge cases
5. Run `pnpm test tests/utils/cronParser.test.js`
6. COMMIT: `git add tests/utils/cronParser.test.js && git commit -m "test(utils): add cronParser tests"`

### Test 2: flattenToLeafPaths.js

Source: src/utils/flattenToLeafPaths.js

Test: tests/utils/flattenToLeafPaths.test.js

Steps:

1. Read src/utils/flattenToLeafPaths.js
2. Understand what it does (flattens nested objects?)
3. Create tests/utils/flattenToLeafPaths.test.js
4. Test nested objects, arrays, edge cases
5. Run `pnpm test tests/utils/flattenToLeafPaths.test.js`
6. COMMIT: `git add tests/utils/flattenToLeafPaths.test.js && git commit -m "test(utils): add flattenToLeafPaths tests"`

### Test 3: dangerousKeys.js

Source: src/api/utils/dangerousKeys.js

Test: tests/api/utils/dangerousKeys.test.js

Steps:

1. Read src/api/utils/dangerousKeys.js
2. Create tests/api/utils/dangerousKeys.test.js
3. Run `pnpm test tests/api/utils/dangerousKeys.test.js`
4. COMMIT: `git add tests/api/utils/dangerousKeys.test.js && git commit -m "test(api): add dangerousKeys tests"`

Continue with remaining files if time permits.

## Standards

- Use Vitest (describe, it, expect)
- Mock external dependencies
- Test happy paths AND error cases
- Follow existing test patterns in tests/
