# Development Principles

## Why This Document Exists

These principles were established deliberately during the design phase. They should not be
revisited casually — they are load-bearing. Changes require an explicit architectural decision
recorded in [decisions/architecture-decisions.md](../decisions/architecture-decisions.md).

## How to Use These Files

This file (`development-principles.md`) contains **universal principles** that apply across all
services. Agents and implementers must read this file for every task, regardless of service.

Service-specific principles are in separate files. Read the file for the service you are
working on:

- Frontend (`apps/frontend/`): `development-principles-frontend.md`
- Backend (`apps/backend/`): `development-principles-backend.md`
- Python service (`services/processing/`): `development-principles-python.md`

Both this file and the relevant service-specific file are the source of truth. Agent definitions
cross-reference this file — they do not restate its content.

## How to Grow These Principles

When a new pattern is identified (e.g. from a code review finding or PM process review):

1. Decide whether it is universal (all services) or service-specific
2. Add it to the appropriate file, in the most appropriate section, at the right level of
   generality
3. If it is an instance of a more general pattern already documented here, extend that section
   rather than adding a new one
4. In `code-review-principles.md`, add only a cross-reference — do not restate the rule
5. In agent definitions, do not add the pattern — the reading list already includes these files

**Avoid**:

- Adding the same rule to multiple files (duplication causes drift and inflates context)
- Over-specifying (prefer "cleanup operations delete the harder-to-query resource first" over
  "startup sweeps delete the file before the DB row")
- Adding a new section when the pattern belongs in an existing one

---

## Core Architectural Principle: Infrastructure as Configuration

Every external service must be accessed through an abstraction interface. The concrete
implementation is determined by configuration at runtime, not hardcoded in application logic.

**What this means in practice**:

Application code calls an interface:

```typescript
storageService.store(fileBuffer, metadata)
```

Configuration determines the implementation:

```text
STORAGE_BACKEND=local   → LocalFilesystemAdapter loads
STORAGE_BACKEND=s3      → S3Adapter loads
```

The application code never changes between environments. Only the configuration changes.

**Concrete abstraction points in this project**:

| Service | Abstraction | Phase 1 Default | Phase 2+ Option |
| --- | --- | --- | --- |
| Document storage | `StorageService` interface | `LocalFilesystemAdapter` | `S3Adapter` |
| Database | Connection string config | Docker PostgreSQL | AWS RDS |
| OCR engine | OCR service interface | Docling + Tesseract fallback | Alternative OCR engines |
| LLM provider | LLM client interface | Local via Ollama | API providers (Claude, GPT) |
| Embedding service | Embedding interface | Local model | API-based embedding models |
| Vector DB | pgvector config | pgvector on local PostgreSQL | Dedicated vector DB |
| Compute | Docker configuration | Docker Compose local | AWS ECS |

**Implementation approach**:

- TypeScript: well-defined interfaces + factory pattern or dependency injection
- Python: abstract base classes + factory functions
- Runtime selection via environment variables or config files
- Never branch on environment name (e.g., `if process.env.NODE_ENV === 'production'`)

See the `configuration-patterns.md` skill (`.claude/skills/configuration-patterns.md`) for
implementation patterns and code examples.

---

## Software Development Principles

### 1. Start Small and Complete

Build a complete end-to-end pipeline with the simplest cases first. A working narrow system
beats a partial broad system. Phase 1 processes real documents through the full pipeline —
even if with limitations.

### 2. Incremental Complexity

Add complexity component by component and phase by phase. Each phase's simplifications are
explicit design choices, not shortcuts. Phase 1 simplifications are documented in each
component specification.

### 3. Real-World Testing from Day One

Use actual family estate documents during development — not toy datasets or synthetic examples.
Assumptions only get validated on real data. This is especially important for OCR quality,
chunking heuristics, and category detection.

### 4. Maintainability Over Convenience

Design for ongoing document addition over years, not just the initial batch. Design for
infrastructure changes (local → AWS). Avoid decisions that require major rewrites when
requirements evolve.

### 5. Learning-Focused

Understand each step deeply, not just use black-box solutions. Components 2–4 are deliberately
implemented by the developer personally to build genuine AI/ML skills. The Implementer agent is
only used for Component 1 (established web development domain).

### 6. Migration-Ready Abstractions

Apply production-ready patterns from day one. The codebase should run on AWS without code
changes — only configuration changes. This is not future-proofing speculation; it is a
concrete design constraint.

### 7. Type Safety End-to-End

TypeScript strict mode in all TypeScript packages. Zod validation at every external boundary
(user input, API responses, file metadata). Shared types package prevents frontend/backend
schema drift.

**Prefer explicit `null` over empty string or `undefined` for absent data**: when a field has
no value, use `null` — not `''` or omission. `null` is unambiguous ("no data expected here");
`''` cannot be distinguished from a real empty string; `undefined` is lost in JSON
serialisation. This applies to Zod schemas, TypeScript types, and DB-to-service mappings.
Exceptions exist (e.g. optional fields in request bodies where omission is the natural form),
but they should be deliberate.

**Types and constants shared across components must have a single definition**: export from the
component or module that owns the concept; import everywhere else. Do not duplicate a type or
constant across files — duplicates drift silently and provide no compile-time signal when one
copy is updated and another is not. Within the frontend, the owning component is typically the
one that renders the concept (e.g. `DuplicateConflictAlert` owns `DuplicateRecord`); within the
shared layer, `packages/shared` is the owner for cross-service types.

**Values that enforce a cross-service contract must come from config, not be hardcoded in
application code**: if a value is validated by one service (e.g. the backend enforcing
`upload.acceptedExtensions`), any other service that depends on that value (e.g. the frontend
restricting the file picker) must read it from its own config — not hardcode a copy. Hardcoded
copies can drift between services without any compile-time or test-time signal.

### 8. Test Early

Tests written alongside code, not deferred to "after the feature works." See
`pipeline-testing-strategy.md` skill for patterns.

**Corollary — keep Zod schemas tight**: if a validation rule can be expressed in the Zod
schema (e.g. `.refine(s => s.trim().length > 0)` for non-whitespace strings), it belongs
there — not in the service. Service-level guards that duplicate schema constraints are dead
code once the middleware enforces them.

For service-specific testing strategy, see:

- Backend: `development-principles-backend.md` — Backend testing strategy — two tiers
- Frontend: `development-principles-frontend.md` — Frontend testing strategy — three tiers
- Python: `development-principles-python.md` — Testing strategy

### 9. Document During Build

Documentation written as decisions are made, not after. Architecture decisions recorded in
[decisions/architecture-decisions.md](../decisions/architecture-decisions.md). Unresolved
questions tracked in [decisions/unresolved-questions.md](../decisions/unresolved-questions.md).

### 10. Production-Ready Patterns Applied From Day One

Security at boundaries (not bolted on). Structured logging (Pino) from the first line. Error
handling with cleanup. Configuration hierarchy. These patterns are not added in Phase 4 —
they are Phase 1 requirements.

---

## AI Development Philosophy

### Clarity Over Speed

The project will be paused and resumed many times. Clear documentation, defined agent roles,
and explicit decision records are more valuable than quick implementation. A well-documented
incomplete system is better than a working undocumented one.

### Human-in-the-Loop

Agents analyse, synthesise, and present options. The developer makes decisions. This applies to:

- Domain context (Component 2 flags candidates; developer approves)
- Architecture (Head of Development agent presents options; developer decides)
- Code quality (Code Reviewer flags issues; developer resolves)

Agents are informed participants, not autonomous decision-makers for ambiguous questions.

### Clear Boundaries Prevent Rework

Explicit component boundaries and data contracts (defined before implementation) prevent
integration surprises. The Integration Lead enforces this at the database layer. Each component
specification defines its input and output contracts.

### Understand the Tools, Don't Just Use Them

This project is a learning vehicle. OCR engines, embedding models, vector databases, and RAG
patterns should be understood deeply — how they work, why they work, and where they fail —
not treated as black boxes.

---

## What These Principles Rule Out (Universal)

The following are explicitly prohibited across all services:

| Anti-pattern | Why prohibited | Principle violated |
| --- | --- | --- |
| Code branching on environment name (`if (env === 'production')`) | Prevents seamless migration; different code paths in different environments | Infrastructure as Configuration |
| Hardcoded provider names or file paths | Prevents runtime swapping | Infrastructure as Configuration |
| Deferred testing ("I'll add tests later") | Tests deferred become tests never written | Test Early |
| Single-file components without defined I/O contracts | Creates integration surprises | Clear Boundaries |
| Secrets or document content in logs | Security boundary violation | Production-Ready Patterns |
| Using string-refinement format validators instead of the top-level primitives native to the installed major version of Zod | Use the format validators native to the installed version. Currently Zod v4: `z.uuid()`, `z.url()`, `z.email()` (not the v3 chained form). Verify on any major upgrade. | Zod (version-current) |
| A "full payload" integration test that omits data for one or more tables named in the acceptance condition | The omission silently satisfies the assertion count while leaving an entire write path untested | Test Early |

---

## Monorepo conventions

### pnpm catalog

A package belongs in the pnpm catalog (`pnpm-workspace.yaml` under `catalog:`) if and only
if it is declared by more than one workspace member. Single-package dependencies stay in
that package's own `package.json`. This keeps the catalog meaningful and prevents
version drift across packages without cataloging backend-only or frontend-only dependencies.
