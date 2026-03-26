# Agent Workflow Design

## Philosophy

This project uses a **human-in-the-loop** multi-agent workflow. Agents analyse, synthesise, and present options. The developer makes all final decisions. This is intentional — not a limitation.

**Why not full autonomy?**

- Complex architectural decisions involve domain knowledge that agents can't fully have
- The project will pause and resume many times; clear agent roles ensure context can be re-established
- Confident wrong assumptions compound quickly in a pipeline system — human checkpoints prevent this
- This is a learning project; deep understanding requires the developer to be in the decision loop

---

## How to Start a Session With an Agent

Agents have no memory between sessions. Each conversation starts fresh. To re-establish context quickly:

**Starting any agent session**:

1. Open a new conversation with the relevant agent (via `/agents` in Claude Code, or by referencing the agent file)
2. Say what phase you are in, for example: *"We are in the Product Owner phase. The user requirements document already exists at `requirements/user-requirements.md`. I want to work on Phase 1 user stories."*
3. The agent will read its key context files as defined in its role. Point it at any additional output documents from prior phases that are relevant.

**Context documents to pass at each phase**:

| Agent | Pass these documents |
| --- | --- |
| Product Owner | [project/overview.md](../project/overview.md) |
| Head of Development | `documentation/requirements/user-requirements.md`, [decisions/architecture-decisions.md](../decisions/architecture-decisions.md), [process/development-principles.md](development-principles.md) |
| Integration Lead | `documentation/requirements/user-requirements.md`, [decisions/architecture-decisions.md](../decisions/architecture-decisions.md), [project/architecture.md](../project/architecture.md), component specifications (written by Senior Developers) |
| Platform Engineer | [project/architecture.md](../project/architecture.md), approved task lists; for dependency review: existing `package.json` and `pyproject.toml` files |
| Senior Developer | Component specification (written by this agent), `documentation/requirements/phase-1-user-stories.md`, [decisions/architecture-decisions.md](../decisions/architecture-decisions.md), Integration Lead contracts |
| Project Manager | Senior Developer implementation plan |
| Implementer / Pair Programmer | Project Manager task list, component specification |
| Code Reviewer | Code under review, original implementation plan, [decisions/architecture-decisions.md](../decisions/architecture-decisions.md) |

**Output documents are the handoff mechanism**: Agents communicate across sessions through documents written to disk. If a document exists at the expected location, the next agent picks it up. This is why every agent's definition of done requires output written to a file — not just discussed in chat.

**Resuming within a phase**: If a session was interrupted mid-phase, re-open the conversation, state the current task, and point the agent at the partially completed output document. It will continue from there.

---

## Why These Agents Exist

The project grew from informal design conversations scattered across multiple chat sessions. The agent structure exists to:

- Give each type of work a consistent, documented role
- Ensure no component is designed in isolation from the others (Integration Lead enforces this)
- Enable the developer to engage at different levels (strategic with Head of Development, task-level with Project Manager)
- Prevent security and quality concerns from being bolted on later (Code Reviewer embeds them from the start)

---

## Agent Roster

**⚠️ Important**: Some context files referenced in agent role definitions below (particularly component specifications) are created during earlier phases and may not exist yet when you start a new agent. This is expected. When starting an agent session:

- If context files don't exist, the agent will note that they are not yet created
- Agents will identify and flag missing context as blocking dependencies
- Follow the agent's guidance on whether to continue or wait for prior phases to complete

### 1. Product Owner Agent

**File**: `.claude/agents/product-owner.md`

**Responsibility**: Define and own the project scope. Produces the user requirements document (the authoritative scope baseline) and converts requirements into formal user stories with acceptance criteria. This is the first agent engaged on the project — nothing should be built without a clear requirements foundation.

**First engagement**: Before any architectural or implementation work, the Product Owner produces a user requirements document that captures all known use cases, user types, functional requirements, and non-functional requirements. This prevents scope gaps from emerging mid-implementation.

**Inputs**: Project goals, use cases, feature descriptions, phase requirements, developer input on scope boundaries

**Output format**:

- User requirements document: `requirements/user-requirements.md` — structured list of all requirements with priority (must/should/could), user type, and rationale
- User stories: *As a [role], I want [action] so that [benefit]* — with acceptance criteria, definition of done, and phase assignment
- Flags for the Head of Development where a requirement has architectural implications

**Scope constraints**: Does NOT make architectural decisions. Captures what the system must do; not how it does it. If a requirement implies a significant architectural choice, flags it explicitly rather than embedding an assumption.

**Definition of done — Product Owner phase**: The Product Owner phase is complete when:

1. A user requirements document exists at `requirements/user-requirements.md` covering all user types and use cases
2. Phase 1 user stories exist at `requirements/phase-1-user-stories.md` with testable acceptance criteria
3. Any requirements with architectural implications are flagged for the Head of Development
4. The developer has reviewed and approved the requirements document

**Handoff to Head of Development**: Pass the user requirements document. The Head of Development uses it as input when resolving unresolved architectural questions.

**Key context files**: [project/overview.md](../project/overview.md) (use cases and project goals)

**Output location**: `.claude/docs/requirements/`

---

### 2. Head of Development Agent

**File**: `.claude/agents/head-of-development.md`

**Responsibility**: Evolve system architecture based on requirements; make cross-cutting architectural decisions; ensure the Infrastructure as Configuration principle is upheld in all decisions. Engaged after the Product Owner has produced a requirements baseline.

**Inputs**: User requirements document from Product Owner, component proposals from Senior Developers, questions about cross-cutting concerns

**Output format**:

- Architecture decisions recorded in [decisions/architecture-decisions.md](../decisions/architecture-decisions.md) (ADR format: decision, context, rationale, risk, tradeoffs)
- Updated architecture documentation
- Validation or rejection of component specification choices with reasoning
- All architectural questions resolved as ADRs in [decisions/architecture-decisions.md](../decisions/architecture-decisions.md)

**Scope constraints**: Cross-cutting decisions ONLY. Does not write implementation plans. Acts as a discussion partner, not an autonomous decision-maker — presents options with tradeoffs for the developer to choose from.

**Hard rule**: Every decision must honour the Infrastructure as Configuration principle (see [process/development-principles.md](development-principles.md)).

**Definition of done — Head of Development phase**: The Head of Development phase is complete when:

1. All 15 Architectural Flags from `user-requirements.md` are covered by an existing or new ADR
2. Python placement, data ownership, and testing strategy questions are resolved as ADRs
3. `documentation/decisions/architecture-decisions.md` is approved by the developer
4. `documentation/project/architecture.md` is written as a fresh synthesis and approved by the developer

**Handoff to Senior Developer**: Pass the updated architecture decisions and resolved unresolved questions. The Senior Developer uses these as constraints when writing the implementation plan.

**Key context files**: [project/architecture.md](../project/architecture.md), [process/development-principles.md](development-principles.md), [decisions/architecture-decisions.md](../decisions/architecture-decisions.md)

---

### 3. Integration Lead Agent (Critical — Cross-Cutting)

**File**: `.claude/agents/integration-lead.md`

**Architectural position**: The Integration Lead sits **outside** the component pipeline. It is not a step in a sequence — it is shared infrastructure that every component depends on. It owns the backend API and PostgreSQL schema as a cross-cutting concern. Components do not own any part of the database independently; they make requests to the Integration Lead, which approves or rejects them.

**Responsibility**: Own the PostgreSQL backend as the single source of truth. Manages schema evolution, API contracts, and data access patterns. Prevents multiple components from independently querying the database in ways that break on schema changes.

**Why this agent is critical**: Without it, each component team independently decides how to access the database. Over time this creates brittle, tightly coupled systems that break when the schema changes. The Integration Lead is the gatekeeper that prevents this.

**Specific tasks**:

- Manage schema evolution and migrations
- Define API interfaces that all components depend on
- Validate component data access patterns (no ad-hoc queries allowed)
- Approve new schema/API needs from Senior Developers before they're implemented
- Manage backward compatibility across schema changes
- Prevent ad-hoc queries from multiple components

**Inputs**: Data access requirement proposals from Senior Developers

**Output format**:

- Approved schema changes with migration files
- API contracts (TypeScript interfaces)
- Rejection feedback with recommended alternatives

**Hard rules**:

- No component gets database access without Integration Lead approval
- No direct SQL queries outside defined data access patterns
- Schema changes require migration files; no direct `ALTER TABLE` in ad-hoc SQL

**Key context files**: [project/architecture.md](../project/architecture.md), all component specifications, [decisions/architecture-decisions.md](../decisions/architecture-decisions.md) (UQ-001, UQ-003, UQ-005 resolved as ADRs)

---

### 4. Platform Engineer Agent

**File**: `.claude/agents/platform-engineer.md`

**Responsibility**: Own the platform layer — everything that sits above and between the
four service directories. Does not write application code and does not make architectural
decisions about services, APIs, or data access patterns.

**Four phases (each independently invocable):**

1. **Monorepo root scaffolding** — creates `pnpm-workspace.yaml`, root `package.json`,
   root `tsconfig.json`, root `biome.json`, and the `packages/shared/` skeleton
   (including `archiveReference`). Must complete before any Implementer or Pair Programmer
   session begins.

2. **Docker Compose** — creates `docker-compose.yml` for the local development environment
   (PostgreSQL + pgvector, backend, frontend, Python processing service) and `.env.example`
   documenting all required environment variables.

3. **GitHub Actions CI/CD** — creates `.github/workflows/ci.yml` (lint, type-check, and
   test jobs for all services on every push; PR gate to `main`) and
   `.github/workflows/dependency-audit.yml` (weekly scheduled audit report).

4. **Dependency update review** — on-demand; reads all `package.json` files and
   `pyproject.toml`/`requirements.txt`, fetches current and latest versions, assesses
   security advisories against actual code usage, and writes a structured recommendation
   report. Does not create tasks or upgrade packages.

**When to invoke**:

- Scaffolding phase: immediately after all task lists are approved, before Implementer
  Task 1 for either frontend or backend
- Docker Compose and CI/CD phases: any time after scaffolding; can overlap with
  Implementer work
- Dependency review: on-demand, any time during or after implementation

**Inputs**: `documentation/project/architecture.md`, approved task lists, existing
`package.json` and `pyproject.toml` files (dependency review phase)

**Output locations**:

- `pnpm-workspace.yaml` — workspace root
- `package.json`, `tsconfig.json`, `biome.json` — workspace root
- `packages/shared/src/archiveReference.ts` — shared utility
- `docker-compose.yml`, `.env.example` — repository root
- `.github/workflows/ci.yml`, `.github/workflows/dependency-audit.yml`
- `documentation/tasks/dependency-review-YYYY-MM-DD.md` — dependency review reports

**Key constraint**: Does not modify approved design documents or task lists (except to
update prerequisite status notes in `frontend-tasks.md` and `backend-tasks.md` once
scaffolding is confirmed complete).

---

### 5. Senior Developer Agent (Template — One Per Component)

**File template**: `.claude/agents/senior-developer-template.md`

**Responsibility**: Decompose a component specification into a detailed implementation plan. One instance per component, each scoped to its component's specification.

**Inputs**: Component specification, current architecture, Integration Lead contracts, relevant skills from `.claude/skills/`

**Output format**: Implementation plan containing:

- Ordered task list with dependencies
- Data access requirements (for Integration Lead approval before implementation proceeds)
- New schema/API needs
- Technology choices within the component's scope
- Estimated complexity per task

**Escalation rule**: If a component has 5+ distinct subsystems or represents more than 3–4 months of work, escalate to a Team Lead structure (break into sub-components, each with their own Senior Developer).

**Workflow**: Propose data access needs → Integration Lead validates → proceed with implementation plan.

**Component-specific instances**:

- `.claude/agents/senior-developer-component-1.md` — scoped to Component 1; produces its own specification document
- `.claude/agents/senior-developer-component-2.md` — scoped to Component 2; produces its own specification document

Pre-approval component specs are archived at `archive/previous-documentation/components/` for reference; Senior Developers write new specs informed by the approved architecture and requirements.

---

### 5. Implementer Agent

**File**: `.claude/agents/implementer.md`

**Responsibility**: Write production-ready code from approved implementation plans for TypeScript services.

**When to use**: Both TypeScript services — `apps/frontend/` (Next.js) and `apps/backend/` (Express). These are the developer's existing domain; the learning value is in the Python ML pipeline, not in TypeScript web development.

**When NOT to use**: `services/processing/` (Python processing service). This is the learning component — OCR, embeddings, RAG, document processing pipelines. The developer implements this personally with Pair Programmer support to build genuine understanding.

**Inputs**: Approved task list and implementation plan for the target service

**Output format**: Working TypeScript/Node.js code with Vitest tests, following the monorepo patterns and development principles.

**Scope constraints**:

- Implements exactly what the plan and task list specify
- Does NOT make architectural decisions
- Does NOT choose different libraries than specified
- Does NOT skip tests
- Flags principle gaps at handoff — if an implementation decision feels like it should be a development principle but is not yet recorded, surfaces it for the developer to formalise

**Code standards**: TypeScript strict mode, Pino logging, Zod validation, nconf configuration, pnpm workspace patterns, Biome linting.

**Key context files**: Approved task list, implementation plan, `configuration-patterns.md` skill, `pipeline-testing-strategy.md` skill, `development-principles.md` (universal) + service-specific principles file

---

### 6. Code Reviewer Agent

**File**: `.claude/agents/code-reviewer.md`

**Responsibility**: Quality assurance and security validation of implemented code.

**Why security is combined with code review**: The document pipeline handles untrusted input (user file uploads, PDFs from external sources) and sensitive data (private family documents). Security must be embedded in the architecture from the start, not bolted on as a compliance check. The Code Reviewer validates that security fundamentals are woven into every design decision.

**When invoked**: After Integration Lead has validated data access contracts; after code is written (by developer or Implementer agent).

**Inputs**: Code (PR or file set) + original implementation plan + relevant architecture decisions

**Review focus areas**:

- Code quality, maintainability, TypeScript strictness
- Security by design (at system boundaries: file upload validation, input sanitisation, path traversal prevention, MIME type validation)
- Proper use of the configuration abstraction layer (no hardcoded providers/paths)
- Error handling consistency (correct HTTP codes, proper cleanup on failure)
- No secrets/credentials/document content in logs
- Consistency with patterns established across the codebase

**Output format**: Review comments with severity (blocking/suggestion), security findings, pattern observations.

**Scope constraints**: Does NOT make architectural decisions. If a blocking issue requires architectural change, escalates to Head of Development.

**Key context files**: [process/development-principles.md](development-principles.md) (universal) + service-specific principles file, [process/code-review-principles.md](code-review-principles.md), [decisions/architecture-decisions.md](../decisions/architecture-decisions.md)

**Process improvement loop**: After each review cycle completes (Code Reviewer → Implementer fixes → Project Manager verification), the Project Manager identifies whether any blocking finding or recurring pattern should be formalised as a new principle in the appropriate principles file (`development-principles.md` for universal patterns, or the service-specific file) or `code-review-principles.md`. This keeps the principle documents alive and prevents the same class of issue recurring across tasks. The Code Reviewer consults `code-review-principles.md` (numbered CR-NNN) at the start of every session.

---

### 7. Project Manager Agent

**File**: `.claude/agents/project-manager.md`

**Responsibility**: Convert Senior Developer implementation plans into actionable, sequenced task lists.

**Inputs**: Senior Developer implementation plan

**Output format**: Ordered task list where each task has:

- Clear description of what to do
- Dependency on prior tasks (if any)
- Complexity estimate (S/M/L)
- Acceptance condition (how to know it's done)

**Scope constraints**: Does not make design decisions. If a task description is ambiguous, flags it for the Senior Developer rather than guessing.

**Definition of done — Project Manager phase**: Complete when a task list exists at `tasks/component-N-tasks.md` with every task having a clear acceptance condition, and the developer has reviewed the list for completeness.

**Handoff to Implementer / Developer**: Pass the task list. Each task is self-contained — the implementer should be able to pick up any task without reading the full implementation plan.

**Output location**: `tasks/component-N-tasks.md`

---

### 8. Pair Programmer Agent

**File**: `.claude/agents/pair-programmer.md`

**Responsibility**: Active coding partner during developer-led implementation (Components 2–4). The developer leads; the pair-programmer assists within the scope of the current task.

**When to use**: Any time the developer is implementing a learning component and wants real-time assistance. Replaces the Implementer agent in this context — the developer writes the code, the pair-programmer supports.

**Behaviours**:

- Answers questions about the current implementation task without going off-script
- Suggests approaches when the developer is stuck, presenting options rather than decisions
- Reviews code snippets inline as they are written — flags issues before they compound
- Explains unfamiliar APIs, library patterns, or ML concepts on request
- Does NOT write whole modules autonomously; assists with specific functions, blocks, or debugging
- Does NOT override the Senior Developer plan without flagging it explicitly

**Scope constraints**: Operates within the task defined by the Project Manager task list. If the developer's approach diverges from the plan in a meaningful way, flags it and asks whether to update the plan or continue.

**Key context files**: Current component specification, Project Manager task list for the component, `configuration-patterns.md` skill, relevant component-specific skills

**Difference from Implementer**: The Implementer writes code autonomously from a plan. The pair-programmer works alongside the developer interactively, keeping the human in the learning loop at all times.

---

## Development Workflows

### Pre-Implementation (All Components)

Run once before any component work begins.

```text
Product Owner produces user requirements document
  ↓ [DoD: requirements doc approved by developer]
Product Owner produces Phase 1 user stories
  ↓ [DoD: user stories with acceptance criteria approved by developer]
Head of Development resolves unresolved architectural questions
  ↓ [DoD: UQ-001–005 answered, ADRs recorded, architecture doc updated, approved by developer]
Skills written (configuration-patterns, metadata-schema, pipeline-testing-strategy)
  ↓ [DoD: each skill file exists and reviewed]
Integration Lead reviews C1 + C2 specs for data access compliance
  ↓ [DoD: compliance confirmed or issues raised and resolved]
```

### Non-Learning Components (Component 1)

Used for the document intake web UI — the developer's existing domain.

```text
Senior Developer creates implementation plan
  ↓ [DoD: plan reviewed and approved by developer]
Integration Lead validates data access contracts
  ↓ [DoD: contracts approved, no outstanding data access queries]
Project Manager creates task breakdown
  ↓ [DoD: every task has an acceptance condition, reviewed by developer]
Platform Engineer — monorepo root scaffolding          ← ONE-TIME; gates all Implementer Task 1s
  ↓ [DoD: workspace root, packages/shared/, biome.json, tsconfig.json exist; pnpm install passes]
Platform Engineer — Docker Compose and CI/CD           ← can run concurrently with Implementer
  ↓ [DoD: docker-compose.yml, .env.example, .github/workflows/ exist]
Implementer agent writes code + tests
  ↓ [DoD: all tasks complete, tests passing, no skipped tests]
Code Reviewer validates quality & security
  ↓ [DoD: no blocking findings, or all blocking findings resolved]
Developer reviews, adjusts, merges
  ↓
Done
```

### Learning Components (Components 2–4)

Used for the processing pipeline, query, and ingestion components — where the developer is building new skills.

```text
Senior Developer creates implementation plan
  ↓ [DoD: plan reviewed and approved by developer]
Integration Lead validates data access contracts
  ↓ [DoD: contracts approved, no outstanding data access queries]
Project Manager creates task breakdown
  ↓ [DoD: every task has an acceptance condition, reviewed by developer]
Platform Engineer — monorepo root scaffolding          ← shared with C1; only run once
  ↓ [DoD: workspace root complete — skip if already done]
Developer implements with Pair Programmer support (task by task)
  ↓ [DoD: all tasks complete, tests passing, developer understands what was built]
Code Reviewer validates quality & security
  ↓ [DoD: no blocking findings, or all blocking findings resolved]
Developer refines
  ↓
Done
```

### Definition of Done — General Principles

A phase is not complete until the developer has explicitly reviewed and approved its output. Agents do not self-certify completion. The following apply to all handoffs:

- Outputs are written to their designated locations (not just described in chat)
- Any blocking issues are resolved before the next phase begins — they are not carried forward as known debt
- If a phase raises new questions or scope changes, they are recorded before proceeding (as new ADRs in [decisions/architecture-decisions.md](../decisions/architecture-decisions.md) or as a new requirement)

---

## Skills vs Agents

**Skills** are reusable workflow definitions and domain knowledge patterns referenced by multiple agents. They encode patterns used across components.

**Agents** are role definitions — how to behave in a specific role.

**Decision rule**: Ask "Will multiple agents or components need to reference this pattern?" If yes → skill. If specific to one component → belongs in that component's detailed plan.

**Examples of skills** (see [process/skills-catalogue.md](skills-catalogue.md)):

- `configuration-patterns.md` — used by every Senior Developer agent
- `pipeline-testing-strategy.md` — used by all Senior Developers and the Implementer
- `embedding-chunking-strategy.md` — used by Component 2 and Component 3 agents

---

## Reference

- Agent file format examples: [everything-claude-code repo](https://github.com/affaan-m/everything-claude-code) — battle-tested agent patterns from Anthropic hackathon; shows how to structure agents as markdown files with role definitions, scope, tools, and I/O formats
