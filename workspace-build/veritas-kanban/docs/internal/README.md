# Internal Documentation — Workflow Engine v3.0

This directory contains implementation notes and code reviews from the v3.0 workflow engine development. These are internal development artifacts — the authoritative specification is `../WORKFLOW_ENGINE_ARCHITECTURE.md`.

## Contents

### Implementation Notes

- `PHASE1_IMPLEMENTATION_NOTES.md` — Core workflow engine implementation (YAML, CRUD API, sequential execution)
- `PHASE2_IMPLEMENTATION_NOTES.md` — Run state management, progress files, tool policies, session isolation
- `PHASE3_IMPLEMENTATION_NOTES.md` — Frontend components, WebSocket refactor, real-time updates
- `PHASE4_IMPLEMENTATION_NOTES.md` — Loop/gate/parallel steps, enhanced acceptance criteria
- `DASHBOARD_IMPLEMENTATION_NOTES.md` — Workflow monitoring dashboard
- `POLICIES_SESSIONS_IMPLEMENTATION_NOTES.md` — Tool policies + fresh sessions per step

### Code Reviews

- `PHASE1_CODE_REVIEW.md` / `PHASE1_CODE_REVIEW_FINAL.md` — Phase 1 review by Ava
- `PHASE2_CODE_REVIEW_FINAL.md` — Phase 2 review by Ava
- `PHASE3_CODE_REVIEW_FINAL.md` / `PHASE3_FINAL_REVIEW.md` — Phase 3 review by Ava
- `CODEX_REVIEW_PHASE1_2.md` / `CODEX_REVIEW_PHASE3.md` / `CODEX_FINAL_REVIEW_PHASE3.md` — Codex reviews
- `PHASE4_CODE_REVIEW_FINAL.md` — Phase 4 review by Ava
- `DASHBOARD_CODE_REVIEW_FINAL.md` — Dashboard review by Ava
- `POLICIES_SESSIONS_CODE_REVIEW_FINAL.md` — Policies & sessions review by Ava
- `WORKFLOW_ENGINE_REVIEW.md` / `WORKFLOW_ENGINE_REVIEW_R2.md` — Initial architecture reviews

## Organization

All review and implementation notes have been moved to this directory to keep the main `docs/` folder focused on user-facing documentation. The authoritative workflow engine specification remains in `docs/WORKFLOW_ENGINE_ARCHITECTURE.md`.

## Cross-References

If you're looking for:

- **User documentation** → `../FEATURES.md` (Workflow Engine section)
- **Architecture spec** → `../WORKFLOW_ENGINE_ARCHITECTURE.md`
- **Changelog** → `../../CHANGELOG.md` (v3.0.0 entry)
- **README** → `../../README.md` (Workflow Engine section)
