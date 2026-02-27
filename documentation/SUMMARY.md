# Institutional Knowledge: Project Status & Setup Guide

## Quick Status

| Item | Status |
| --- | --- |
| Scope and requirements | ✓ Approved 2026-02-17 |
| Architecture decisions (41 ADRs) | ✓ Approved 2026-02-25 |
| Architecture and system diagrams | ✓ Approved 2026-02-25 |
| Foundational skills (13 files) | ✓ All written 2026-02-27 |
| Agents created | 2 of 8 (Product Owner, Head of Development) |
| Implementation | Not started |

**Current phase**: Skills and agents creation. All design is complete and approved.

**Next actionable step**: Create remaining 6 agents (Integration Lead, Senior Developer × 2,
Implementer, Pair Programmer, Code Reviewer, Project Manager). See [process/agent-workflow.md](process/agent-workflow.md)
for role definitions.

**Known blockers**: None.

---

## Milestone Timeline

```text
2026-02-13 to 17  overview.md, user-requirements.md, phase-1-user-stories.md approved
                  (138 requirements, 101 user stories, 15 Architectural Flags)
2026-02-25        architecture-decisions.md approved (ADR-001 to ADR-041)
                  architecture.md and system-diagrams.md approved
2026-02-25 to 27  All 13 foundational skills written
2026-02-27        Next — create remaining 6 agents
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
│   ├── product-owner.md                    ← Created
│   ├── head-of-development.md              ← Created
│   ├── integration-lead.md                 ← Not yet created
│   ├── senior-developer-component-1.md     ← Not yet created
│   ├── senior-developer-component-2.md     ← Not yet created
│   ├── implementer.md                      ← Not yet created
│   ├── pair-programmer.md                  ← Not yet created
│   ├── code-reviewer.md                    ← Not yet created
│   └── project-manager.md                  ← Not yet created
└── skills/
    ├── agent-file-conventions.md           ← Written
    ├── approval-workflow.md                ← Written
    ├── overview-review-workflow.md         ← Written
    ├── user-stories-review-workflow.md     ← Written
    ├── adr-review-workflow.md              ← Written
    ├── configuration-patterns.md           ← Written
    ├── dependency-composition-pattern.md   ← Written
    ├── metadata-schema.md                  ← Written
    ├── pipeline-testing-strategy.md        ← Written
    ├── notion-lab-entry.md                 ← Written
    ├── ocr-extraction-workflow.md          ← Written
    ├── embedding-chunking-strategy.md      ← Written
    └── rag-implementation.md               ← Written
```

---

## Creating the Remaining Agents

Each agent is a markdown file in `.claude/agents/`. Read the
[`agent-file-conventions.md`](../.claude/skills/agent-file-conventions.md) skill before
writing any agent file.

See [process/agent-workflow.md](process/agent-workflow.md) for full role definitions,
input/output formats, scope constraints, and the per-agent context table.

### Agents Still to Create

**Integration Lead** — owns the PostgreSQL schema and API contracts as shared infrastructure.
Key context: [project/architecture.md](project/architecture.md),
[decisions/architecture-decisions.md](decisions/architecture-decisions.md), component
specifications (written by Senior Developers — not yet created).

**Senior Developer (Component 1)** — produces the C1 implementation plan and specification.
Key context: [requirements/user-requirements.md](requirements/user-requirements.md),
[requirements/phase-1-user-stories.md](requirements/phase-1-user-stories.md),
[decisions/architecture-decisions.md](decisions/architecture-decisions.md).

**Senior Developer (Component 2)** — produces the C2 implementation plan and specification.
Key context: same as C1 Senior Developer. Note: C2 is a learning component; the specification
process should preserve the developer's learning experience (see S-6 in project-summary.md).

**Implementer** — writes production-ready code from Senior Developer plans. Used for
Component 1 only (developer's existing domain). Key context: C1 specification (when created),
`configuration-patterns.md` skill, `pipeline-testing-strategy.md` skill.

**Pair Programmer** — active coding partner for learning components (C2–C4). Key context:
current component specification, Project Manager task list, relevant skills.

**Code Reviewer** — quality and security validation. Key context:
[process/development-principles.md](process/development-principles.md),
[decisions/architecture-decisions.md](decisions/architecture-decisions.md).

**Project Manager** — converts Senior Developer plans into ordered task lists. Output written
to `tasks/component-N-tasks.md`.

---

## Key Output Locations

As agents complete their phases, outputs are written here:

```text
documentation/
├── requirements/
│   ├── user-requirements.md         ← Product Owner — approved 2026-02-17
│   └── phase-1-user-stories.md      ← Product Owner — approved 2026-02-17
└── tasks/
    ├── component-1-tasks.md         ← Project Manager (not yet created)
    └── component-2-tasks.md         ← Project Manager (not yet created)
```

Component specifications (produced by Senior Developer agents) will be written as new
documents under `documentation/` — paths to be determined when the Senior Developer agents
are created.

---

## Reference

- [process/agent-workflow.md](process/agent-workflow.md) — Full agent role definitions and
  workflow diagrams
- [process/skills-catalogue.md](process/skills-catalogue.md) — All 13 skills with purpose,
  links, and creation order
- [decisions/architecture-decisions.md](decisions/architecture-decisions.md) — All 41 ADRs
- [approvals.md](approvals.md) — Approval status, precedence, and full audit log
