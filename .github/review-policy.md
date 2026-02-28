# Review Policy

This repository prioritizes **high-signal review feedback**.

## Severity policy

Automated reviewers (Claude Code, bots, or scripts) should focus on:

- 🔴 **Critical**: security, correctness, data loss, production reliability
- 🟡 **Warning**: maintainability or performance issues with real impact

Avoid filing low-value style commentary unless explicitly requested by a maintainer.

## Bot-noise controls

If a review bot cannot be configured at the org/app level from this repository:

1. Keep workflow prompts scoped to critical/high-impact findings.
2. Avoid request-changes for cosmetic-only concerns.
3. Batch findings into one concise summary + precise inline comments for blocking issues only.

## Human reviewer guidance

- Request follow-up for nits in a separate comment thread (optional).
- Keep blocking reviews reserved for critical/warning findings.
- Prefer small PRs to reduce review noise and cycle time.
