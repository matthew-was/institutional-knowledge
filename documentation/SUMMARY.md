# Institutional Knowledge: Documentation Summary & Next Steps

## What Was Done

### What Was Found

The `initial documentation/` directory contained high-quality, well-considered design work across 10 files — two complete component specs, an agent workflow design, a combined overview, and pipeline diagrams. The content was strong but scattered with inconsistent naming, no navigational structure, and no clear indication of which document superseded which.

### Archive Convention

All external documents that were used as source material during documentation reorganisation have been moved to the `archive/` directory. This convention applies going forward: any external document (conversations, briefings, exported content from other tools) that is read and processed into part of the `documentation/` directory should be moved to `archive/` after processing, for future reference. The `documentation/` directory is the single source of truth; `archive/` is the provenance record.

Key findings:

- The agent workflow design (in `working-with-claude.md`) was complete but had no `.claude/` directory to make it operational
- A combined C2+C3 overview document signalled that the original 5-component design had evolved to 4 components
- Critical unresolved questions were mixed into a workflow document rather than tracked as blockers
- Pre-approval component specs (C1–C4) have been archived to `archive/previous-documentation/components/` — they pre-date the Head of Development review and contain architectural assumptions not yet decided; Senior Developers will produce new specs after the Head of Development phase

### Component Renumbering

During this reorganisation, the decision was made to merge the original Components 2 and 3 into a single Component 2. See [decisions/architecture-decisions.md](decisions/architecture-decisions.md) ADR-005.

| Was | Now |
| --- | --- |
| Component 1 (Document Intake) | Component 1 (unchanged) |
| Component 2 (Text Extraction) + Component 3 (Embedding) | Component 2 (Text Extraction, Processing & Embedding) |
| Component 4 (Query & Retrieval) | Component 3 |
| Component 5 (Continuous Ingestion) | Component 4 |

### Source-to-Destination Map

| Source File | Destination | Treatment |
| --- | --- | --- |
| `family-estate-ducment-archive-system-project-context.md` | `project/overview.md` + `project/architecture.md` | Split: goals/principles → overview; components/phases/stack → architecture |
| `estate-archive-document-intake-system-component-1-specification.md` | `archive/previous-documentation/components/component-1/specification.md` | Archived; pre-dates current ADRs |
| `high-level-project-document-component-2-update.md` | `archive/previous-documentation/components/component-2/overview.md` | Archived; pre-dates current ADRs |
| `component-2-text-extraction-and-document-processing-design-spec.md` | `archive/previous-documentation/components/component-2/specification.md` | Archived; pre-dates current ADRs |
| `working-with-claude.md` | `process/agent-workflow.md` + `process/skills-catalogue.md` | Split by concern |
| `document_pipeline.mermaid` | `project/system-diagrams.md` | Expanded to 4 diagrams reflecting current architecture |
| `INITIAL_PURPOSE.md` | Incorporated into `project/overview.md` | Merged |

New files synthesised:

- `documentation/README.md` — navigation index
- `project/domain-context.md` — living estate terminology document
- `process/development-principles.md` — synthesised from all design documents
- `decisions/unresolved-questions.md` — all open questions consolidated (reference copy; Head of Development works from Architectural Flags in `user-requirements.md`)

### Current Implementation Status

| Component | Design | Implementation |
| --- | --- | --- |
| Component 1: Document Intake | Pending Head of Development | Not started |
| Component 2: Processing & Embedding | Pending Head of Development | Not started |
| Component 3: Query & Retrieval | Pending | Not started |
| Component 4: Continuous Ingestion | Phase 2+ placeholder | Not started |

---

## Next Steps: Setting Up the `.claude/` Directory

The `process/agent-workflow.md` document defines a complete 7-agent workflow. None of the agent or skill files exist yet. This section provides the concrete steps to make it operational.

### Target `.claude/` Structure

```text
.claude/
├── settings.json             ← Already created (permissions)
├── agents/
│   ├── product-owner.md
│   ├── head-of-development.md
│   ├── integration-lead.md
│   ├── senior-developer-template.md
│   ├── senior-developer-component-1.md
│   ├── senior-developer-component-2.md
│   ├── implementer.md
│   ├── pair-programmer.md
│   ├── code-reviewer.md
│   └── project-manager.md
└── skills/
    ├── agent-file-conventions.md
    ├── approval-workflow.md
    ├── configuration-patterns.md
    ├── dependency-composition-pattern.md
    ├── metadata-schema.md
    ├── pipeline-testing-strategy.md
    ├── ocr-extraction-workflow.md
    ├── embedding-chunking-strategy.md
    └── rag-implementation.md
```

---

## Agents to Create

Each agent is a markdown file in `.claude/agents/`. Use [everything-claude-code](https://github.com/affaan-m/everything-claude-code) as a reference for file format.

For each agent, the file should contain: role definition, inputs, output format, scope constraints, escalation rules, and context files to read.

---

### `product-owner.md`

**Role**: User story writer. Converts use cases and requirements into formal user stories with acceptance criteria.

**Input**: Project goals, use cases, feature requests, phase requirements

**Output format**: User stories (`As a [role], I want [action] so that [benefit]`) with acceptance criteria, definition of done, phase assignment

**Scope**: Does NOT make architectural decisions. Flags architectural implications to Head of Development.

**Key context to include**: [project/overview.md](project/overview.md) (use cases section)

**Output location**: `.claude/docs/requirements/`

---

### `head-of-development.md`

**Role**: Architectural decision-maker for cross-cutting concerns. Ensures Infrastructure as Configuration principle is upheld.

**Input**: Requirements from Product Owner, proposals from Senior Developers, cross-cutting questions

**Output format**: Architecture decisions (recorded in decisions/architecture-decisions.md), updated architecture docs, validation or rejection of component choices

**Scope**: Cross-cutting decisions ONLY. Discussion partner, not autonomous decision-maker — presents options with tradeoffs.

**Hard constraint**: Every decision must honour the Infrastructure as Configuration principle.

**Key context to include**: [project/architecture.md](project/architecture.md), [process/development-principles.md](process/development-principles.md), [decisions/architecture-decisions.md](decisions/architecture-decisions.md)

---

### `integration-lead.md`

**Role**: Owns the backend API and PostgreSQL schema as shared infrastructure — a cross-cutting concern used by all components, not a step in the pipeline.

**Architectural position**: The Integration Lead sits outside the component pipeline. Every component depends on the contracts it defines, but no component owns it. It is the shared foundation that prevents the components from independently evolving the database in incompatible directions.

**Input**: Data access requirement proposals from Senior Developers (any component)

**Output format**: Approved schema changes + migration files, API contracts (TypeScript interfaces), rejections with recommended alternatives

**Specific responsibilities**:

- Manage schema evolution and migrations
- Define API interfaces that all components depend on
- Validate component data access patterns (no ad-hoc queries)
- Prevent components from coupling through the database
- Manage backward compatibility

**Hard rules**:

- No component gets database access without Integration Lead approval
- No direct SQL queries outside defined access patterns

**Key context to include**: [project/architecture.md](project/architecture.md), all component specifications, [decisions/unresolved-questions.md](decisions/unresolved-questions.md) (UQ-001, UQ-003, UQ-005)

**First task when set up**: Review Component 1 and Component 2 specifications for compliance with these rules. Answer UQ-001 and UQ-005.

---

### `senior-developer-template.md`

**Role**: Implementation planner for a single component (instanced per component).

**Input**: Component specification, architecture, Integration Lead contracts, relevant skills

**Output format**: Implementation plan with ordered tasks, data access requirements (for Integration Lead), new schema/API needs, complexity estimates

**Workflow**: Propose data access needs → Integration Lead validates → proceed with plan

**Escalation**: If component has 5+ subsystems or 3–4 months of work, escalate to Team Lead structure

Component-specific instances:

- `senior-developer-component-1.md` — context: [components/component-1-document-intake/specification.md](components/component-1-document-intake/specification.md), `requirements/user-requirements.md`, `requirements/phase-1-user-stories.md`, [decisions/architecture-decisions.md](decisions/architecture-decisions.md)
- `senior-developer-component-2.md` — context: all files in [components/component-2-processing-and-embedding/](components/component-2-processing-and-embedding/), `requirements/user-requirements.md`, [decisions/architecture-decisions.md](decisions/architecture-decisions.md)

---

### `implementer.md`

**Role**: Code writer. Used for Component 1 ONLY (established domain, no learning value for developer).

**Input**: Detailed Senior Developer implementation plan

**Output**: Working TypeScript/Node.js code + Vitest tests

**Hard constraints**:

- Implements exactly what the plan specifies
- Does NOT make architectural decisions
- Does NOT skip tests
- Does NOT choose different libraries than specified

**Code standards**: TypeScript strict mode, Pino logging, Zod validation, pnpm workspace patterns.

**Key context to include**: [components/component-1-document-intake/specification.md](components/component-1-document-intake/specification.md), `configuration-patterns.md` skill, `pipeline-testing-strategy.md` skill

---

### `code-reviewer.md`

**Role**: Quality and security reviewer. Security is treated as architectural, not as compliance.

**Input**: Code (PR or file set) + original implementation plan

**Output**: Review comments with severity (blocking/suggestion), security findings, pattern observations

**Review focus**:

- Code quality, maintainability, TypeScript strictness
- Security at system boundaries (file upload validation, input sanitisation, path traversal, MIME types)
- Proper use of configuration abstraction layer (no hardcoded providers)
- Error handling consistency (correct HTTP codes, cleanup on failure)
- No secrets/credentials/document content in logs

**When invoked**: After Integration Lead validates data access contracts; after code is written.

**Key context to include**: [process/development-principles.md](process/development-principles.md), [decisions/architecture-decisions.md](decisions/architecture-decisions.md)

---

### `project-manager.md`

**Role**: Task breakdown and sequencing from Senior Developer plans.

**Input**: Senior Developer implementation plan

**Output format**: Ordered task list — each task has: description, dependency (if any), complexity (S/M/L), acceptance condition

**Scope**: Does not make design decisions. If a task is ambiguous, flags it for the Senior Developer.

**Output location**: `tasks/component-N-tasks.md`

---

### `pair-programmer.md`

**Role**: Active coding partner during developer-led implementation (Components 2–4).

**When to use**: When the developer is writing code directly (learning components). Replaces the Implementer agent in this context. The developer leads; the pair-programmer assists.

**Behaviours**:

- Answers questions about the current implementation task without going off-script
- Suggests approaches when the developer is stuck, presenting options rather than decisions
- Reviews code snippets inline as they are written — flags issues before they compound
- Explains unfamiliar APIs, library patterns, or ML concepts on request
- Does NOT write whole modules autonomously; assists with specific functions, blocks, or debugging
- Does NOT override the Senior Developer plan without flagging it explicitly

**Scope constraints**: Operates within the task defined by the Project Manager task list. If the developer's approach diverges from the plan in a meaningful way, flags it and asks whether to update the plan or continue.

**Key context to include**: Current component specification, Project Manager task list for the component, `configuration-patterns.md` skill, relevant component-specific skills

**Difference from Implementer**: The Implementer writes code autonomously from a plan. The pair-programmer works alongside the developer interactively, keeping the human in the learning loop at all times.

---

## Skills to Create

Skills live in `.claude/skills/`. Write them in this order — each is a dependency for work that follows.

Full descriptions in [process/skills-catalogue.md](process/skills-catalogue.md).

### Creation Order

**0. `agent-file-conventions.md`** — Write before any agent files are created

- What a well-formed `.claude/agents/*.md` file looks like
- System prompt structure, scope constraints as instructions, context loading, output format specification, tool restrictions
- Worked example: Product Owner agent
- Anti-patterns: what makes an agent file fail in practice
- Used when: creating or revising any agent file

**1. `configuration-patterns.md`** — Write first (blocks all Senior Developer agents)

- The "Infrastructure as Configuration" principle in implementation terms
- TypeScript interfaces + factory/DI patterns
- Python abstract base classes + factory functions
- Config singleton pattern with fail-fast validation
- Docker runtime configuration (base + overrides)
- Component 1's `StorageService` as first concrete reference

**1b. `dependency-composition-pattern.md`** — Write second (Implementer needs this before wiring routes)

- Structured dependency injection across TypeScript and Python
- Services instantiated at startup, injected into route handlers
- Testing via mock injection
- MCP server wrapping (same services, multiple deployment contexts)
- Key principles: single responsibility, explicit dependencies, composability

**2. `metadata-schema.md`** — Write fourth (Integration Lead needs this)

- Canonical field list for document, chunk, and processing metadata
- Required vs optional per document type
- Schema evolution strategy

**3. `pipeline-testing-strategy.md`** — Write fifth (must exist before code)

- Vitest (TypeScript) and pytest (Python) setup patterns
- Pipeline stage isolation testing
- Fixture document strategy
- Test database management (`estate_archive_test`)

**4. `ocr-extraction-workflow.md`** — Write before Component 2 implementation

- File type detection algorithm
- Docling/Tesseract decision tree
- Confidence scoring
- Graceful degradation ladder

**5. `embedding-chunking-strategy.md`** — Write after Component 2 Phase 1

- Heuristic chunking algorithm
- Parent document reference pattern
- pgvector storage patterns
- Embedding provider abstraction

**6. `rag-implementation.md`** — Write before Component 3 design

- Similarity search patterns
- Context assembly
- LLM provider abstraction
- Response format with citations

---

## Unresolved Questions to Answer Before Coding

Full details in [decisions/unresolved-questions.md](decisions/unresolved-questions.md).

**Must answer before any component coding begins**:

1. **UQ-001 Data flow & read/write ownership** — Which components write vs read the database? Transaction boundaries?
2. **UQ-002 Configuration abstraction map** — Complete list of every service needing abstraction + runtime selection mechanism
3. **UQ-003 Formal metadata schema** — Canonical fields, required/optional per type, extension strategy
4. **UQ-004 Testing strategy** — Python pipeline testing patterns + fixture strategy
5. **UQ-005 PostgreSQL integration points** — Read/write semantics per component

**Must answer before Component 2 implementation**:

1. **UQ-C2-001 Semantic chunking heuristics** — Exact rules per document type
2. **UQ-C2-002 Category detection patterns** — Pattern list per category

---

## Recommended Implementation Sequence

This sequence minimises rework by resolving dependencies before they block work.

### Foundation (Before Any Code)

**Step 1**: Write `agent-file-conventions.md` skill — defines what a well-formed agent file looks like. Prerequisite for all agent creation.

**Step 2**: Product Owner agent — finalise project scope. Output: `documentation/requirements/user-requirements.md` ✓ Complete (approved 2026-02-17)

**Step 3**: Product Owner agent — formalise Phase 1 user stories. Output: `documentation/requirements/phase-1-user-stories.md` ✓ Complete (approved 2026-02-17)

**Step 4**: Head of Development agent — resolve Architectural Flags from `user-requirements.md`; produce `documentation/decisions/architecture-decisions.md` and `documentation/project/architecture.md`

**Step 5**: Write `configuration-patterns.md` skill (informed by Python placement ADR and UR-133 decision from Step 4)

**Step 5b**: Write `dependency-composition-pattern.md` skill (closely aligned with configuration patterns, needed before Implementer wires routes)

**Step 6**: Write `metadata-schema.md` skill (informed by UR-057/061/086/138 decisions from Step 4)

**Step 7**: Write `pipeline-testing-strategy.md` skill (informed by testing strategy decision from Step 4)

**Step 8**: Set up Integration Lead agent. Its first task: work with Senior Developers on component specifications and data access contracts.

### Component 1 Implementation

**Step 9**: Senior Developer (Component 1) agent — create implementation plan

**Step 10**: Integration Lead validates Component 1 data access patterns

**Step 11**: Project Manager — create task breakdown → `tasks/component-1-tasks.md`

**Step 12**: Implementer agent — writes Component 1 code + tests

**Step 13**: Code Reviewer validates

**Step 14**: Developer reviews and merges

### Component 2 Implementation

**Step 15**: Answer UQ-C2-001 and UQ-C2-002 (requires looking at actual estate documents)

**Step 16**: Write `ocr-extraction-workflow.md` skill

**Step 17**: Senior Developer (Component 2) agent — create implementation plan. Uses all files in [components/component-2-processing-and-embedding/](components/component-2-processing-and-embedding/).

**Step 18**: Integration Lead validates Component 2 data access patterns

**Step 19**: Project Manager — create task breakdown → `tasks/component-2-tasks.md`

**Step 20**: Developer implements Component 2 (learning component — pair-programmer agent assists)

**Step 21**: Code Reviewer validates

### Component 3 Design

**Step 22**: Write `embedding-chunking-strategy.md` skill (now informed by real implementation)

**Step 23**: Design Component 3 using [components/component-3-query-retrieval/README.md](components/component-3-query-retrieval/README.md) as the brief

**Step 24**: Write `rag-implementation.md` skill

**Then**: Continue with Component 3 implementation (developer implements — learning component), then Component 4 design and implementation.

---

## Reference

- [process/agent-workflow.md](process/agent-workflow.md) — Full agent role definitions
- [process/skills-catalogue.md](process/skills-catalogue.md) — Full skills list with purpose and dependencies
- [decisions/unresolved-questions.md](decisions/unresolved-questions.md) — Open questions
- [decisions/architecture-decisions.md](decisions/architecture-decisions.md) — All ADRs
- [everything-claude-code repo](https://github.com/affaan-m/everything-claude-code) — Agent file format reference
