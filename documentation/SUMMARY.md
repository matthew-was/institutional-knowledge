# Institutional Knowledge: Project Status & Setup Guide

## Quick Status

| Item | Status |
| --- | --- |
| Scope and requirements | ✓ Approved 2026-02-17 |
| Architecture decisions (52 ADRs) | ✓ Approved (last: ADR-052, 2026-03-25) |
| Architecture and system diagrams | ✓ Approved 2026-02-25 |
| Foundational skills (15 files) | ✓ All written |
| Agents (10 of 10) | ✓ All written |
| Backend implementation | ✓ Complete — 19 tasks + chores, merged to main |
| Frontend implementation | ✓ Complete — 18 tasks + 13a + 5a, merged to main |
| Python service implementation | ⏳ In progress — Tasks 0–10 done; Task 11 next |

**Current phase**: Implementation in progress.

**Next actionable step**: Python Task 11 (LLM combined pass step — chunk post-processing).

**Known blockers**: OQ-3 (embedding model) must be resolved before Python Tasks 15/22.

---

## Milestone Timeline

```text
2026-02-13 to 17  overview.md, user-requirements.md, phase-1-user-stories.md approved
                  (138 requirements, 101 user stories, 15 Architectural Flags)
2026-02-25        architecture-decisions.md approved (ADR-001 to ADR-041)
                  architecture.md and system-diagrams.md approved
2026-02-25 to 27  All foundational skills written; all 10 agents written
2026-03-06        Platform Engineer phases 1 & 2 complete (monorepo scaffold, Docker Compose)
2026-03-09        Platform Engineer phase 3 complete (GitHub Actions CI/CD)
2026-03-21        Backend Tasks 1–16 complete, merged to main
2026-03-22        Backend Tasks 17–18 + post-audit chores complete
2026-03-23        Frontend task list rebuilt (18 tasks; Hono + Next.js; ADR-050, ADR-051)
2026-03-28        Frontend Tasks 1–18 + 13a + 5a complete, merged to main
2026-03-30        Backend Chores 1, 2, 4 done; Python Tasks 0 + 1 done
2026-04-12        Python Tasks 0–10 done
```

---

## Document Precedence

Approved documents are listed in precedence order in [approvals.md](approvals.md). In case of
contradiction, the higher-ranked document is authoritative. All 6 approved documents are
currently consistent with each other.

---

## Archive Convention

Any external document (conversation exports, briefings, exported content from other tools)
that is read and processed into `documentation/` should be moved to `archive/` after
processing, for future reference. `documentation/` is the single source of truth; `archive/`
is the provenance record. See [../archive/README.md](../archive/README.md) for what each
subdirectory contains.

---

## Component Renumbering Reference

During the documentation reorganisation, the original 5-component design was merged to 4:

| Current | Was | Description |
| --- | --- | --- |
| Component 1 | Component 1 | Document Intake (unchanged) |
| Component 2 | Components 2 + 3 | Text Extraction, Processing & Embedding |
| Component 3 | Component 4 | Query & Retrieval |
| Component 4 | Component 5 | Continuous Ingestion |

See ADR-005 in [decisions/architecture-decisions.md](decisions/architecture-decisions.md).

---

## Current `.claude/` Structure

```text
.claude/
├── settings.json
├── agents/
│   ├── product-owner.md
│   ├── head-of-development.md
│   ├── integration-lead.md
│   ├── senior-developer-frontend.md
│   ├── senior-developer-python.md
│   ├── implementer.md
│   ├── pair-programmer.md
│   ├── code-reviewer.md
│   ├── project-manager.md
│   └── platform-engineer.md
└── skills/
    ├── agent-file-conventions.md
    ├── approval-workflow.md
    ├── overview-review-workflow.md
    ├── user-stories-review-workflow.md
    ├── adr-review-workflow.md
    ├── configuration-patterns.md
    ├── dependency-composition-pattern.md
    ├── metadata-schema.md
    ├── pipeline-testing-strategy.md
    ├── ocr-extraction-workflow.md
    ├── embedding-chunking-strategy.md
    ├── rag-implementation.md
    ├── document-review-workflow.md
    ├── update-task-status/     ← invocable skill (/update-task-status)
    └── finish-task/            ← invocable skill (/finish-task <service> <task-number>)
```

---

## Agents

All 10 agents are written. See [process/agent-workflow.md](process/agent-workflow.md) for
role definitions, input/output formats, scope constraints, and the per-agent context table.

---

## Key Output Locations

As agents complete their phases, outputs are written here:

```text
documentation/
├── requirements/
│   ├── user-requirements.md         ← Product Owner — approved 2026-02-17
│   └── phase-1-user-stories.md      ← Product Owner — approved 2026-02-17
└── tasks/
    ├── backend-tasks.md             ← Project Manager + Implementer — 19 tasks, all done
    ├── backend-chores.md            ← Post-audit chores — Chores 1, 2, 4 done; Chore 3 blocked
    ├── frontend-tasks.md            ← Project Manager + Implementer — 18 tasks + 13a + 5a, all done
    └── python-tasks.md              ← Project Manager + Pair Programmer — 23 tasks; Tasks 0–10 done
```

---

## Reference

- [process/agent-workflow.md](process/agent-workflow.md) — Full agent role definitions and
  workflow diagrams
- [process/skills-catalogue.md](process/skills-catalogue.md) — All 13 skills with purpose,
  links, and creation order
- [decisions/architecture-decisions.md](decisions/architecture-decisions.md) — All 41 ADRs
- [approvals.md](approvals.md) — Approval status, precedence, and full audit log
