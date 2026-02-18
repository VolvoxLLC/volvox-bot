# Best Practices & Anti-Patterns

Codify what works (and what burns us) when running Veritas Kanban with humans + AI agents.

---

## Do This

1. **Always track time**
   - Start timers with `vk begin` the moment you pick up a task.
   - If you forgot, add a manual entry with reason. Time data fuels estimation and billing.

2. **Use subtasks as living checklists**
   - Break work into 3–8 subtasks.
   - Mark them complete as you progress; unfinished subtasks make blockers obvious.

3. **Write acceptance criteria inside the task description**
   - Bullet list or checklist. Agents need crisp definitions of done.

4. **Post completion summaries + links**
   - Final comment should include what changed, where to find artifacts, and next steps.

5. **Keep tasks atomic**
   - One deliverable per task. If work spans >3 days or mixes unrelated goals, split it.

6. **Update SOP files after every lesson**
   - Mistake → update AGENTS.md/CLAUDE.md + Lessons Learned field.

7. **Respect cross-model review**
   - Treat it like CI. No code ships without the opposite model’s signoff.

8. **Mirror important artifacts to Brain/knowledge base**
   - Use `scripts/brain-write.sh` or equivalent so humans can find deliverables later.

9. **Use Agent Status + comments for visibility**
   - Set `vk agent working` when you start; leave concise updates in comments instead of DM spam.

10. **Archive aggressively**
    - Done column should stay lean. Use multi-select + archive (bug tracked separately) at sprint end.

---

## Don’t Do This

1. **Tasks without acceptance criteria**
   - Leads to rework and ambiguous reviews.

2. **Skipping time tracking**
   - “It was quick” is not data. Even 5-minute fixes get tracked.

3. **Giant grab-bag tasks**
   - “Implement feature + write docs + shoot video” belongs in separate tasks.

4. **Auto-piloting agents without supervision**
   - Always read summaries, review diffs, enforce cross-model review.

5. **Letting prompts drift**
   - Keep prompt registry updated or agents will regress.

6. **Leaving example tasks in production boards**
   - Clear the seed tasks before real work to avoid confusion.

7. **Treating planning as a board status**
   - Planning is a checklist/subtask, not `TaskStatus`. Valid statuses: todo, in-progress, blocked, done.

8. **Storing secrets in tasks**
   - Use vault/secret manager references, never raw credentials.

9. **Ignoring Lessons Learned**
   - If you uncover a process flaw and don’t log it, you’ll repeat it next sprint.

10. **Copy/pasting unvetted external code**
    - Run security review (see RF-002) and cite sources.

Stick to these rules and the board stays trustworthy even with dozens of agents in parallel.
