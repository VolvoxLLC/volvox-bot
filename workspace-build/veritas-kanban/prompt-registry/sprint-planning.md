# Sprint Planning Prompt

Use this when breaking down an epic or goal into a sprint of tasks.

---

## Prompt

```
I need to plan a sprint for: <GOAL>

Project: <PROJECT>
Sprint ID: <SPRINT-ID> (e.g., US-1700)
Estimated duration: <DURATION> (e.g., 1 week)

Please:
1. Break this into 5-15 atomic tasks
2. Each task should be completable in 1-4 hours
3. Use subtasks for multi-step work
4. Include clear acceptance criteria in each task description
5. Suggest a logical execution order

For each task, provide:
- Title (prefix with sprint ID)
- Type (feature/bug/docs/research/code)
- Priority (high/medium/low)
- Subtasks if needed
- Acceptance criteria

Create the tasks via the Veritas Kanban API at http://localhost:3001/api/tasks
```

---

## Example

**Input:**

```
Goal: Add GitHub Issues sync to Veritas Kanban
Project: veritas-kanban
Sprint: US-1300
Duration: 1 week
```

**Expected output:** 8-12 tasks covering:

- Research GitHub API
- Design sync architecture
- Implement issue import
- Implement status push
- Add configuration UI
- Write tests
- Update documentation
