# Research Report Prompt

Use this for deep research tasks that produce a written deliverable.

---

## Prompt

````
Research topic: <TOPIC>

## Task
<TASK-ID>

## Objective
<WHAT-TO-LEARN>

## Scope
- In scope: <INCLUDE>
- Out of scope: <EXCLUDE>

## Research Questions
1. <QUESTION-1>
2. <QUESTION-2>
3. <QUESTION-3>

## Deliverables
1. **Research document** — Comprehensive findings with sources
2. **Executive summary** — 1-page TL;DR for stakeholders
3. **Recommendations** — Actionable next steps
4. **Backlog items** — Tasks to create based on findings (if applicable)

## Format Requirements
- Use markdown with clear headings
- Cite sources with links
- Include pros/cons tables where relevant
- Call out risks and uncertainties

## Output Location
Save deliverables to:
- Research doc: `docs/research/<topic-slug>.md`
- Summary: Include at top of research doc

## Workflow
```bash
vk begin <TASK-ID>
# ... research and write ...
vk done <TASK-ID> "Research complete: <KEY-FINDING>"
````

```

---

## Example

```

Research topic: RSS Integration Patterns for Agent-Driven Knowledge Systems

## Objective

Identify creative ways to integrate RSS feeds into Veritas Kanban and BrainMeld

## Research Questions

1. How do other tools use RSS for automation?
2. What's the MVP RSS feature for VK?
3. How does RSS fit into BrainMeld's nervous system model?

## Deliverables

1. Research doc with patterns + pros/cons
2. MVP recommendation for VK
3. BrainMeld architecture notes
4. Draft GitHub issue spec

```

```
