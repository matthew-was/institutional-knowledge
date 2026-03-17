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

Tests written alongside code, not deferred to "after the feature works." See `pipeline-testing-strategy.md` skill for patterns.

**Testing strategy — two tiers only:**

- **Unit tests**: cover logic that can be extracted to a pure function — data transformations,
  format derivations, computations that take inputs and return outputs with no I/O. The
  canonical test: could this logic live in a standalone `function f(input): output`? If yes,
  test it as a unit test. No database, no HTTP, no mocked `db` needed.

- **Integration tests**: cover everything else. These tests start from a real HTTP request via
  supertest, proceed through the `validate` middleware, the service layer, and the repository
  layer, and assert on the HTTP response and the resulting database state. A real PostgreSQL
  instance is required. This is the correct tier for all paths that involve I/O: `not_found`
  lookups, success paths that write to the database, and any acceptance condition that can be
  described as "calling the API returns X".

**There is no middle tier.** Calling a service method directly against a real database without
going through the HTTP layer bypasses the `validate` middleware and the route layer entirely,
leaving those paths untested. The only exception is tests that verify coordination between the
service and a non-database external dependency (e.g. file storage + database together in a
lifecycle test), where mounting a full HTTP stack adds no additional coverage.

**Corollary — keep Zod schemas tight**: if a validation rule can be expressed in the Zod
schema (e.g. `.refine(s => s.trim().length > 0)` for non-whitespace strings), it belongs
there — not in the service. Service-level guards that duplicate schema constraints are dead
code once the middleware enforces them.

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
| Accessing `db._knex` outside tests or transactions | Bypasses the repository layer; SQL leaks into service/route code | Repository Pattern |
| Passing `AppDependencies` to a route or service that only needs one dep | Hides actual dependencies; makes tests harder to write | Dependency Composition |
| Throwing from a service for an expected domain error | Forces callers to catch rather than handle typed results | ServiceResult Pattern |
| Deferred testing ("I'll add tests later") | Tests deferred become tests never written | Test Early |
| Single-file components without defined I/O contracts | Creates integration surprises | Clear Boundaries |
| Secrets or document content in logs | Security boundary violation | Production-Ready Patterns |
| Mocked database clients for integration tests | Masks real database behaviour | Test Early |
| Calling service methods directly against a real database as an integration test | Bypasses validate middleware and route layer; leaves HTTP boundary untested | Test Early |

---

## Dependency Composition Pattern

Dependencies are composed at the top of the call chain (`server.ts`) and then narrowed as they are passed down. Each factory receives only the interface it actually uses.

**Startup sequence** (`server.ts`):

```typescript
const log     = createLogger(config);
const db      = await createDb(config.db);
const storage = createStorageService(config.storage, log);
const vector  = createVectorStore(config.vectorStore, config.embedding, db, log);
const graph   = createGraphStore(config.graph, db, log);
const docs    = createDocumentService({ db, storage, config, log });
const app     = createApp({ config, db, storage, vectorStore: vector, graphStore: graph, documentService: docs, log });
```

**Narrowing rule**: route factories receive one service, not `AppDependencies`.

```typescript
// Correct — routes/documents.ts receives only what it needs
export function createDocumentsRouter(service: DocumentService): Router { ... }

// Wrong — do not pass the full dep bag to a router
export function createDocumentsRouter(deps: AppDependencies): Router { ... }
```

The same rule applies to services: a service that only needs `db`, `storage`, and `config` should declare exactly those three parameters, not an opaque "deps" object that happens to contain them. Keeping the surface area minimal makes mock injection in tests trivial and makes dependencies self-documenting.

---

## Service Pattern

Services are **factory functions**, not classes. Methods are closures over the dependency arguments.

```typescript
export interface DocumentService {
  initiateUpload(input: InitiateUploadInput): Promise<ServiceResult<InitiateUploadData, DocumentErrorType>>;
  uploadFile(input: UploadFileInput): Promise<ServiceResult<UploadFileData, DocumentErrorType, DuplicateConflictResponse>>;
}

export function createDocumentService(deps: DocumentServiceDeps): DocumentService {
  const { db, storage, config, log } = deps;

  async function initiateUpload(input: InitiateUploadInput) {
    // uses db, storage, config, log from the outer closure
  }

  return { initiateUpload, uploadFile, finalizeUpload, cleanupUpload };
}
```

**Rules**:

- Methods return `ServiceResult<T, K, E>` for all expected outcomes — never throw for domain errors such as "not found" or "file too large". Throwing is reserved for genuinely unexpected failures (DB unreachable, programming error) that should propagate to the Express error handler via `next(err)`. `T` is the success data type; `K extends string` is the union of valid `errorType` strings (defaults to `string`); `E` is the type of `errorData` for structured error payloads (defaults to `never` for methods whose error cases carry only a message).
- Services have no knowledge of Express (`Request`, `Response`, `NextFunction` are route-layer concerns).
- The exported interface type is what callers depend on; the factory implementation is an internal detail.

---

## Repository Pattern

All SQL lives in `apps/backend/src/db/repositories/`. One repository file per database table. Services call `db.documents.insert(...)`, `db.embeddings.search(...)` — they never write SQL directly.

**Repository factory signature**:

```typescript
export function createDocumentsRepository(db: Knex) {
  return {
    async insert(row: DocumentInsert): Promise<void> { ... },
    async getById(id: string): Promise<Document | undefined> { ... },
  };
}
export type DocumentsRepository = ReturnType<typeof createDocumentsRepository>;
```

`DbInstance` exposes each repository as a named property:

```typescript
export type DbInstance = {
  _knex: Knex;
  documents: DocumentsRepository;
  embeddings: EmbeddingsRepository;
  chunks: ChunksRepository;
  graph: GraphRepository;
  destroy(): Promise<void>;
};
```

**`_knex` access rules**:

| Caller | May use `db._knex`? |
| --- | --- |
| Services (`services/*.ts`) | No — call `db.documents.*` etc. |
| Route handlers (`routes/*.ts`) | No |
| Implementation classes (`PgVectorStore`, `PostgresGraphStore`) | No — they receive `DbInstance` and call `db.embeddings.*` etc. |
| Repositories (`db/repositories/*.ts`) | Yes — they receive raw `Knex` and that is the appropriate layer for SQL |
| Test cleanup (`testing/dbCleanup.ts`) | Yes — `cleanAllTables` needs direct `Knex` access to issue a cross-table `TRUNCATE` |
| Multi-table transactions | Yes — pass `db._knex` to `knex.transaction()` when atomicity spans multiple repositories |

`knex.raw()` is permitted inside repositories for queries that cannot be expressed in the Knex query builder (pgvector cosine distance, recursive CTEs). When using `knex.raw()`, column names must be written in snake\_case because `wrapIdentifier` does not apply; result rows must be mapped to camelCase explicitly.

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
