# Documentation

All design and process documentation for the Institutional Knowledge project. Start here to find anything.

---

## Navigation Guide

### If you want to understand the project

→ [project/overview.md](project/overview.md) — Scope document: users, document types, capabilities by phase, query scope

→ [project/developer-context.md](project/developer-context.md) — Developer background and environment setup

→ [project/architecture.md](project/architecture.md) — All 4 components, phases, tech stack, data flow

→ [project/system-diagrams.md](project/system-diagrams.md) — Visual system architecture and all component flows (4 diagrams)

### If you want to understand why a decision was made

→ [decisions/architecture-decisions.md](decisions/architecture-decisions.md) — All ADRs across the project (populated by Head of Development agent)

### If you want to read the requirements and user stories

→ [requirements/user-requirements.md](requirements/user-requirements.md) — Authoritative scope: 138 requirements across all phases

→ [requirements/phase-1-user-stories.md](requirements/phase-1-user-stories.md) — 101 user stories covering Phase 1 requirements

→ [approvals.md](approvals.md) — Approval status of all scope documents

### If you are setting up Claude agents and skills

→ [SUMMARY.md](SUMMARY.md) — Project status, milestone timeline, and guide to set up `.claude/` directory

→ [process/agent-workflow.md](process/agent-workflow.md) — 8-agent role definitions and workflows

→ [process/skills-catalogue.md](process/skills-catalogue.md) — All identified skills with creation order

Agent and skill definition files are in `.claude/agents/` and `.claude/skills/` at the project root.

### If you are working with institution-specific terminology

Institution-specific vocabulary (entity types, relationships, domain terms) is managed in the database, not in a static file. See ADR-014 in [decisions/architecture-decisions.md](decisions/architecture-decisions.md) and UR-085 in [requirements/user-requirements.md](requirements/user-requirements.md) for the vocabulary management approach.

---

## Document Status

| Document | Status | Notes |
| --- | --- | --- |
| project/overview.md | Current | Rewritten as scope document; approved 2026-02-17 |
| project/developer-context.md | Current | Developer background and environment |
| project/architecture.md | Approved | Approved 2026-02-25; reflects all ADR-001 to ADR-041 |
| project/system-diagrams.md | Approved | Approved 2026-02-25; four diagrams reflecting confirmed architecture |
| project/pipeline-diagram.mermaid | Deleted | Deleted 2026-02-25; superseded by system-diagrams.md |
| project/domain-context.md | Superseded | Vocabulary managed in database per ADR-014; file will not be created |
| decisions/architecture-decisions.md | Approved | Approved 2026-02-25; all 41 ADRs (ADR-001 to ADR-041) |
| decisions/unresolved-questions.md | Archived | Historical UQ-001 to UQ-006 resolved via ADRs; archived to archive/previous-documentation/previous documentation to be reviewed/decisions/ |
| requirements/user-requirements.md | Current | 138 requirements (UR-001 to UR-138); approved 2026-02-17 |
| requirements/phase-1-user-stories.md | Current | 101 stories covering all requirements; approved 2026-02-17 |
| approvals.md | Current | Approval tracking for all scope documents |
| process/agent-workflow.md | Current | 8 agents defined |
| process/skills-catalogue.md | Current | All 13 skills written |
| process/development-principles.md | Current | Universal principles (all services) |
| process/development-principles-backend.md | Current | Backend-specific patterns |
| process/development-principles-frontend.md | Current | Frontend-specific patterns |
| process/development-principles-python.md | Current | Python-specific patterns |
| SUMMARY.md | Current | Project status, milestone timeline, .claude/ setup guide |
| tasks/backend-tasks.md | Complete | 19 tasks — all done and merged to main |
| tasks/backend-chores.md | In progress | Post-audit chores; Chores 1, 2, 4 done; Chore 3 blocked on Node 26 |
| tasks/frontend-tasks.md | Complete | 18 tasks + 13a + 5a — all done and merged to main |
| tasks/python-tasks.md | In progress | 23 tasks; Tasks 0–10 done; Task 11 next |

---

## Component Numbering Reference

This project uses 4 components (previously 5 in early design documents). The merge:

| Current | Was | Description |
| --- | --- | --- |
| Component 1 | Component 1 | Document Intake (unchanged) |
| Component 2 | Components 2 + 3 | Text Extraction, Processing & Embedding |
| Component 3 | Component 4 | Query & Retrieval |
| Component 4 | Component 5 | Continuous Ingestion |
