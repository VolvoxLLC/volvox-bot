# Standup Summary Prompt

Use this for generating daily status reports.

---

## Prompt

````
Generate a standup summary for <DATE>.

## Sections to Include

### ✅ Completed
Tasks that moved to "done" today:
- Task title + brief summary of what was accomplished

### 🔄 In Progress
Tasks currently being worked on:
- Task title + what's being done + ETA if known

### 🚫 Blocked
Tasks that cannot proceed:
- Task title + blocker reason + who can unblock

### 📋 Upcoming
High-priority tasks planned for next:
- Task title + when it will start

### 📊 Stats
- Tasks completed: X
- Time tracked: Xh Xm
- Sprint progress: X/Y tasks done

## Format
Keep it scannable:
- Bullet points, not paragraphs
- Task IDs for reference
- Brief descriptions (1 line each)

## CLI Command
```bash
vk summary standup --text
````

## Posting

Post to team channel with format:

```
📅 Standup — <DATE>

<STANDUP-CONTENT>
```

```

---

## Example Output

```

📅 Standup — 2026-02-04

### ✅ Completed

- task_20260204_abc — OAuth login flow (Google provider working)
- task_20260204_def — Fixed archive button error (filename mismatch)

### 🔄 In Progress

- task_20260204_ghi — Prompts registry (50% done, creating templates)

### 🚫 Blocked

- task_20260204_jkl — GitHub sync testing (need GITHUB_TOKEN)

### 📋 Upcoming

- task_20260204_mno — Shared resources registry (after prompts)

### 📊 Stats

- Completed: 2 tasks
- Time tracked: 3h 45m
- Sprint progress: 4/10 tasks done

```

```
