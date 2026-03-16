# Development Principles

## Why This Document Exists

These principles were established deliberately during the design phase. They should not be revisited casually — they are load-bearing. Changes require an explicit architectural decision recorded in [decisions/architecture-decisions.md](../decisions/architecture-decisions.md).

---

## Core Architectural Principle: Infrastructure as Configuration

Every external service must be accessed through an abstraction interface. The concrete implementation is determined by configuration at runtime, not hardcoded in application logic.

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

See the `configuration-patterns.md` skill (`.claude/skills/configuration-patterns.md`) for implementation patterns and code examples.

---

## Software Development Principles

### 1. Start Small and Complete

Build a complete end-to-end pipeline with the simplest cases first. A working narrow system beats a partial broad system. Phase 1 processes real documents through the full pipeline — even if with limitations.

### 2. Incremental Complexity

Add complexity component by component and phase by phase. Each phase's simplifications are explicit design choices, not shortcuts. Phase 1 simplifications are documented in each component specification.

### 3. Real-World Testing from Day One

Use actual family estate documents during development — not toy datasets or synthetic examples. Assumptions only get validated on real data. This is especially important for OCR quality, chunking heuristics, and category detection.

### 4. Maintainability Over Convenience

Design for ongoing document addition over years, not just the initial batch. Design for infrastructure changes (local → AWS). Avoid decisions that require major rewrites when requirements evolve.

### 5. Learning-Focused

Understand each step deeply, not just use black-box solutions. Components 2–4 are deliberately implemented by the developer personally to build genuine AI/ML skills. The Implementer agent is only used for Component 1 (established web development domain).

### 6. Migration-Ready Abstractions

Apply production-ready patterns from day one. The codebase should run on AWS without code changes — only configuration changes. This is not future-proofing speculation; it is a concrete design constraint.

### 7. Type Safety End-to-End

TypeScript strict mode in all TypeScript packages. Zod validation at every external boundary (user input, API responses, file metadata). Shared types package prevents frontend/backend schema drift.

### 8. Test Early

Tests written alongside code, not deferred to "after the feature works." Real PostgreSQL for integration tests (separate `estate_archive_test` database), not mocked database clients. See `pipeline-testing-strategy.md` skill for patterns.

### 9. Document During Build

Documentation written as decisions are made, not after. Architecture decisions recorded in [decisions/architecture-decisions.md](../decisions/architecture-decisions.md). Unresolved questions tracked in [decisions/unresolved-questions.md](../decisions/unresolved-questions.md).

### 10. Production-Ready Patterns Applied From Day One

Security at boundaries (not bolted on). Structured logging (Pino) from the first line. Error handling with cleanup. Configuration hierarchy. These patterns are not added in Phase 4 — they are Phase 1 requirements.

---

## AI Development Philosophy

### Clarity Over Speed

The project will be paused and resumed many times. Clear documentation, defined agent roles, and explicit decision records are more valuable than quick implementation. A well-documented incomplete system is better than a working undocumented one.

### Human-in-the-Loop

Agents analyse, synthesise, and present options. The developer makes decisions. This applies to:

- Domain context (Component 2 flags candidates; developer approves)
- Architecture (Head of Development agent presents options; developer decides)
- Code quality (Code Reviewer flags issues; developer resolves)

Agents are informed participants, not autonomous decision-makers for ambiguous questions.

### Clear Boundaries Prevent Rework

Explicit component boundaries and data contracts (defined before implementation) prevent integration surprises. The Integration Lead enforces this at the database layer. Each component specification defines its input and output contracts.

### Understand the Tools, Don't Just Use Them

This project is a learning vehicle. OCR engines, embedding models, vector databases, and RAG patterns should be understood deeply — how they work, why they work, and where they fail — not treated as black boxes.

---

## What These Principles Rule Out

The following are explicitly prohibited:

| Anti-pattern | Why prohibited | Principle violated |
| --- | --- | --- |
| Code branching on environment name (`if (env === 'production')`) | Prevents seamless migration; different code paths in different environments | Infrastructure as Configuration |
| Hardcoded provider names or file paths | Prevents runtime swapping | Infrastructure as Configuration |
| Ad-hoc SQL queries from application components | Creates coupling that breaks on schema changes | Integration Lead authority |
| Deferred testing ("I'll add tests later") | Tests deferred become tests never written | Test Early |
| Single-file components without defined I/O contracts | Creates integration surprises | Clear Boundaries |
| Secrets or document content in logs | Security boundary violation | Production-Ready Patterns |
| Mocked database clients for integration tests | Masks real database behaviour | Test Early |

---

## Logging Standard

Use Pino's four log levels consistently across all backend services:

| Level | When to use | Examples |
| --- | --- | --- |
| `info` | State changes meaningful to operators | Document finalised, upload initiated, cleanup completed |
| `debug` | Entry/exit of internal operations that aid debugging but add noise in production | Writing a file, inserting a row, executing a search |
| `warn` | Recoverable unexpected conditions — execution continues but something is wrong | Cleanup failed but returning success, fallback taken |
| `error` | Non-recoverable unexpected conditions that require attention | Unhandled exception, DB unreachable, corrupted state |

Never log document content, file content, or user-provided text at any level. Log only identifiers (uploadId, documentId, chunkId) and status values. This is a security boundary — see `Production-Ready Patterns Applied From Day One` above.

---

## ADR Citation Standard

Every source file in `apps/backend/src/` should include a one-sentence ADR citation in its file-level JSDoc. The format varies by file type:

- **Interface files** (`StorageService.ts`, `VectorStore.ts`, `GraphStore.ts`): cite the ADR that defines the abstraction.

  ```typescript
  /**
   * StorageService interface (ADR-008).
   * ...
   */
  ```

- **Concrete implementations** (`LocalStorageService.ts`, `PgVectorStore.ts`, `PostgresGraphStore.ts`): cite as "implements ADR-XXX".

  ```typescript
  /**
   * LocalStorageService — Phase 1 filesystem-backed StorageService (implements ADR-008).
   * ...
   */
  ```

- **Repository files**: cite only if there is a non-obvious design decision documented in an ADR (e.g. the graph repository cites ADR-037 for the document-evidenced filter). Omit the citation if there is no relevant ADR.

This gives one sentence of context per file without cluttering every method.
