# Blocked Escalation Prompt

Use this when work is blocked and needs escalation.

---

## Prompt

````
Task <TASK-ID> is blocked.

## Blocker Details

**Category:** <CATEGORY>
- waiting-on-feedback — Need input from human/stakeholder
- technical-snag — Hit unexpected technical issue
- prerequisite — Depends on another task
- other — Something else

**Description:**
<WHAT-IS-BLOCKING>

**Impact:**
<WHAT-CANNOT-PROCEED>

**Attempted Solutions:**
1. <WHAT-YOU-TRIED>
2. <WHAT-ELSE-YOU-TRIED>

**Unblock Options:**
1. <OPTION-1>
2. <OPTION-2>

**Recommended Action:**
<YOUR-RECOMMENDATION>

## Escalation Command
```bash
vk block <TASK-ID> "<BRIEF-REASON>"
````

## Notification

After blocking, notify the appropriate party:

- Technical snag → Post in team channel with details
- Waiting on feedback → Message the specific person
- Prerequisite → Link the blocking task ID

```

---

## Example

```

Task task_20260204_abc123 is blocked.

## Blocker Details

**Category:** technical-snag

**Description:**
GitHub API rate limit exceeded. Cannot sync more than 60 requests/hour without authentication.

**Impact:**
Cannot complete GitHub sync testing. 50 issues remain to import.

**Attempted Solutions:**

1. Tried unauthenticated requests — hit rate limit
2. Checked for existing token — none configured

**Unblock Options:**

1. Configure GITHUB_TOKEN in .env
2. Implement request queuing with backoff
3. Wait 1 hour for rate limit reset

**Recommended Action:**
Option 1 — Ask for GITHUB_TOKEN to be configured

## Escalation Command

vk block task_20260204_abc123 "GitHub API rate limit - need GITHUB_TOKEN configured"

```

```
