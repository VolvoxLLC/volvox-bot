# Task Completion Prompt

Use this as a checklist before marking any task done.

---

## Prompt

````
Complete task <TASK-ID>: <TASK-TITLE>

## Pre-Completion Checklist

### Work Quality
- [ ] All acceptance criteria met
- [ ] All subtasks completed
- [ ] Code compiles without errors (`pnpm typecheck`)
- [ ] Tests pass (`pnpm test`)
- [ ] No console errors or warnings

### Documentation
- [ ] Code comments explain non-obvious logic
- [ ] README updated if user-facing change
- [ ] CHANGELOG entry added if notable

### Review
- [ ] Self-reviewed the diff
- [ ] Cross-model review completed (if code change)
- [ ] No TODO comments left unresolved

### Cleanup
- [ ] No debug code or console.logs
- [ ] No commented-out code blocks
- [ ] Imports organized

## Completion Summary Format

Write a brief summary covering:
1. **What** — What was done
2. **How** — Technical approach (if relevant)
3. **Testing** — How it was verified
4. **Notes** — Anything the next person should know

## Workflow
```bash
# Verify everything passes
pnpm typecheck && pnpm test

# Complete the task
vk done <TASK-ID> "<SUMMARY>"
````

```

---

## Example Summary

```

Implemented OAuth login flow:

- Added GoogleOAuthButton component with redirect handling
- Integrated with existing auth context
- Tested login/logout cycle manually + added e2e test
- Note: Refresh token rotation not implemented (tracked in #123)

```

```
