# Development Principles

## Why This Document Exists

These principles were established deliberately during the design phase. They should not be revisited casually — they are load-bearing. Changes require an explicit architectural decision recorded in [decisions/architecture-decisions.md](../decisions/architecture-decisions.md).

## How to Grow These Principles

**This file is the single source of truth for all implementation patterns.** `code-review-principles.md` and agent definitions (implementer.md, code-reviewer.md) reference this file — they do not restate its content.

When a new pattern is identified (e.g. from a code review finding or PM process review):

1. Add it here, in the most appropriate section, at the right level of generality
2. If it is an instance of a more general pattern already documented here, extend that section rather than adding a new one
3. In `code-review-principles.md`, add only a cross-reference: *"Check that X follows the [pattern name] in development-principles.md"* — do not restate the rule
4. In agent definitions, do not add the pattern — the Implementer's reading list already includes this file

**Avoid**:

- Adding the same rule to multiple files (duplication causes drift and inflates context)
- Over-specifying (prefer "cleanup operations delete the harder-to-query resource first" over "startup sweeps delete the file before the DB row")
- Adding a new section when the pattern belongs in an existing one

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

**Prefer explicit `null` over empty string or `undefined` for absent data**: when a field has no value, use `null` — not `''` or omission. `null` is unambiguous ("no data expected here"); `''` cannot be distinguished from a real empty string; `undefined` is lost in JSON serialisation. This applies to Zod schemas, TypeScript types, and DB-to-service mappings. Exceptions exist (e.g. optional fields in request bodies where omission is the natural form), but they should be deliberate.

### 8. Test Early

Tests written alongside code, not deferred to "after the feature works." See `pipeline-testing-strategy.md` skill for patterns.

**Testing strategy — two tiers only:**

- **Unit tests**: cover standalone pure functions only — functions that take inputs and return
  outputs with no I/O of any kind. The canonical examples are `normalise.test.ts`
  (`utils/normalise.ts`) and `db/utils.test.ts` (`db/utils.ts`). The test must call the
  function directly, not via a service factory. If reaching the logic under test requires
  constructing a service or mocking a dependency (`db`, `storage`, `log`), it is not a unit
  test — write an integration test instead.

- **Integration tests (the default)**: cover everything else. When in doubt, write an
  integration test. These tests start from a real HTTP request via supertest, proceed through
  the `validate` middleware, the service layer, and the repository layer, and assert on the
  HTTP response and the resulting database state. A real PostgreSQL instance is required. This
  is the correct tier for all paths that involve I/O: `not_found` lookups, success paths that
  write to the database, and any acceptance condition that can be described as "calling the API
  returns X". Use `createTestApp(db, storage, config, log, { serviceUnderTest })` from
  `testing/testHelpers.ts` to build the Express app — pass only the service(s) actually
  exercised by the test file; all others default to `{} as never` and will throw if called.

**There is no middle tier.** Calling a service method directly against a real database without
going through the HTTP layer bypasses the `validate` middleware and the route layer entirely,
leaving those paths untested. Calling a service method with mocked `db`/`storage` deps is also
not a unit test — it exercises I/O paths through a mock, not pure logic.

**Pure-function unit tests and integration test depth**: when a function is exported as a
standalone utility with no I/O (e.g. `archiveReference`, `normaliseTermText`, `camelCase`),
write a unit test that calls it directly with a range of inputs covering all edge cases.
Integration tests that exercise code paths calling these functions need only confirm the
happy-path output — exhaustive edge-case coverage belongs in the unit test.

**Corollary — keep Zod schemas tight**: if a validation rule can be expressed in the Zod
schema (e.g. `.refine(s => s.trim().length > 0)` for non-whitespace strings), it belongs
there — not in the service. Service-level guards that duplicate schema constraints are dead
code once the middleware enforces them.

**Frontend testing strategy — three tiers:**

The frontend has two sub-systems — the UI (browser) and the custom server (Node.js) — each
with its own layering. The three-tier model maps tests to the layer they exercise.

**Architecture context**:

UI sub-system (browser):

| Layer | Responsibility |
| --- | --- |
| Presentational component | Props → rendered output, accessibility. No state, no API calls. |
| Custom hook | State management and business logic. Uses useSWR for data fetching and useSWRMutation for mutations — both call through `fetchWrapper`. |
| Page / wrapper component | Wires a hook to a presentational component. Thin. |

Custom server sub-system (Node.js):

| Layer | Responsibility |
| --- | --- |
| Route handler | Thin — parse request, call handler, shape response. |
| Handler | Business logic and orchestration. No HTTP or framework imports. |
| Request functions | Thin — URL construction, Ky HTTP call, `x-internal-key` header injection, response parsing, error classification. No framework imports. |

The `x-internal-key` header lives exclusively in the custom server request functions. It is
never set or seen by browser-side code.

**Tier 1 — Unit tests**: pure functions and presentational components. No state, no API
calls, no running server.

- Pure utility functions: `parseFilename`, Zod form schemas, formatting/sorting utilities
- Presentational component tests: React Testing Library (RTL) with static props — rendering,
  accessibility (ARIA roles, keyboard navigation), conditional display logic
- `fetchWrapper` utility: mock `window.fetch` directly to assert consistent `content-type`
  header and base path on every call
- Custom server pure helper functions (error classifiers, response mappers) if standalone
  with no I/O; otherwise covered by Tier 2

Tooling: Vitest, RTL (for components). No MSW needed at this tier.

**Tier 2 — Behaviour tests**: stateful behaviour and the custom server's internal layers.
This is where the bulk of confidence lives.

*UI behaviour — custom hook tests*:

- Use `renderHook` from RTL
- MSW intercepts calls from `fetchWrapper` to the **Hono API route paths**
  (e.g. `/api/curation/documents`, `/api/documents/upload`)
- Assert on state transitions: idle → loading → success, idle → loading → error,
  mutation → re-fetch, partial failure handling

*Custom server — route handler tests*:

- Drive requests into the route handler using supertest against a minimal Hono test app
- Mock the handler layer (or intercept at the HTTP level with MSW) to isolate the route handler
  from the Express backend
- Assert on: response status, response body shape, error propagation

*Custom server — handler tests*:

- Import the handler function directly (it has no knowledge of HTTP)
- Mock the request functions it calls
- Assert on: orchestration logic, error classification, typed return values
- The composite upload handler is the primary target — three sequential calls with cleanup on
  failure is non-trivial logic that warrants thorough handler-level testing

*Custom server — request function tests*:

- Import the request function directly
- Mock the Ky instance at the call boundary
- Assert on: correct URL, `x-internal-key` header present, correct request body/query params,
  expected error states returned as typed results, unexpected errors re-thrown

Tooling: Vitest, RTL (`renderHook`), MSW (UI behaviour), supertest (custom server route
handlers).

**Tier 3 — E2E tests (small in number)**: full stack — real browser, real Hono custom server,
Express backend mocked at the network boundary.

- Playwright drives a real browser against a running Hono custom server
- MSW (service worker or Node server mode) intercepts outbound calls from the custom server
  to Express
- Cover critical happy paths and key error paths only — these are expensive to write and
  maintain

Tooling: Playwright, MSW.

**MSW intercept boundary** — must be explicit in every test file:

| Tier | MSW intercepts | Example URL pattern |
| --- | --- | --- |
| Tier 2 — hook tests | `fetchWrapper` → Hono API route | `/api/documents/upload` |
| Tier 2 — custom server handler tests | Request functions → Express | `http://localhost:4000/api/documents` |
| Tier 3 — E2E | Custom server → Express | `http://localhost:4000/api/documents` |

**SWR fetcher placement**: fetchers passed to useSWR/useSWRMutation may be defined inline in
the hook file or in a co-located `[hookName].requests.ts` file. Start inline; extract to a
shared helper only if repetition across hooks warrants it. If extracted, the fetcher functions
must be unit tested independently at Tier 1.

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
| Calling a service factory with mocked `db`/`storage` deps as a "unit test" | The mock bypasses real I/O, leaving the HTTP boundary and validate middleware untested; pure-function logic inside a service must be extracted before it can be unit-tested | Test Early |
| Using string-refinement format validators instead of the top-level primitives native to the installed major version of Zod | Use the format validators native to the installed version. Currently Zod v4: `z.uuid()`, `z.url()`, `z.email()` (not the v3 chained form `z.string().uuid()`, `z.string().url()`, `z.string().email()`). Verify these examples against the installed version on any major upgrade. | Zod (version-current) |
| `crypto.randomUUID()` for UUID generation | The `uuid` package (`v7 as uuidv7`) is the project standard; `crypto.randomUUID()` is a Node.js built-in with no consistent import and is not used elsewhere in the codebase | Consistency |
| Adding a repository to `DbInstance` without updating the `DbInstance` listing in `development-principles.md` | The listing in this document is the authoritative reference for what is on `DbInstance`; letting it drift creates confusion about what is available and what is missing | Documentation |
| Inline `res.status(...).json({ error, message })` in a route handler instead of `sendServiceError` | The envelope shape is a project rule, not a per-handler decision; inlining it creates drift risk if the envelope changes | Error Response Pattern |
| Omitting `trx` from an abstraction's write method when the underlying repository supports it | Forces the write onto a separate pool connection; uncommitted rows from the outer transaction are invisible, causing FK violations | Repository Pattern / Transaction Participation |
| Discarding a `ServiceResult` return value inside a `db._knex.transaction()` block | The transaction commits despite a logical failure; errors are silently swallowed | ServiceResult Pattern |
| A service function that writes to two or more tables without wrapping all writes in a single `db._knex.transaction()` block, with `trx` threaded through every repository call | Partial writes leave the database in an inconsistent state if any step fails; writes that occur outside the transaction block cannot be rolled back | Repository Pattern / Transaction Participation |
| A "full payload" integration test that omits data for one or more tables named in the acceptance condition | The omission silently satisfies the assertion count while leaving an entire write path untested | Test Early |
| Hardcoding operational numeric limits (e.g. max traversal depth, max file size, retry count) in Zod schemas in `packages/shared/src/schemas/` | Embeds a backend-specific or environment-specific constraint in the shared API contract; cannot be changed without a code change; prevents alternative backends from using different safe limits | Infrastructure as Configuration |
| Using `?? ''` to substitute an empty string for a null value in repository row-mapping code | Converts a meaningful absence of data into an indistinguishable empty string; callers cannot tell the difference; use `null` explicitly (see §7 Type Safety) | Type Safety |
| Constructing services individually and passing them all to `createApp()` directly in an integration test | Creates boilerplate that must be updated in every test file when `AppDependencies` gains a new entry; use `createTestApp()` from `testing/testHelpers.ts` with only the services under test passed as overrides — all others default to `{} as never` | Test Early |
| A service operation that interleaves file storage I/O or external service calls with DB writes, where all DB writes are placed inside a single `db._knex.transaction()` — including the I/O | Storage and external service calls cannot participate in a SQL transaction and will not roll back. Use the three-step sentinel pattern instead: (1) a sentinel DB update outside any transaction to mark the operation as in-flight so the startup sweep can detect and recover it on crash; (2) I/O outside any transaction; (3) a single `db._knex.transaction()` wrapping all DB writes that do not depend on I/O | Repository Pattern / Transaction Participation |
| Inline conditional to compute HTTP status from `errorType` (e.g. `errorType === 'not_found' ? 404 : 409`) instead of a `Record<ErrorType, number>` map | The `Record` form is TypeScript-exhaustiveness-checked; an inline conditional silently omits new error types when the union grows | Error Response Pattern |
| Synchronous `fs.*` calls (`fs.mkdirSync`, `fs.writeFileSync`, `fs.readFileSync`, etc.) | Blocks the Node.js event loop; all file operations must use `node:fs/promises` | Production-Ready Patterns |
| Instantiating a concrete service implementation directly in integration tests (e.g. `new LocalStorageService(basePath, stagingPath, log)`) instead of using the factory function (e.g. `createStorageService(config, log)`) | Bypasses the factory entirely; `storage/index.ts` (and equivalent index files) goes untested and the test would pass even if the factory were broken | Infrastructure as Configuration |
| Redefining a response schema in `apps/frontend/src/lib/schemas.ts` that is already defined in `packages/shared/src/schemas/` | Creates a duplicate definition that can silently drift from the backend source of truth; import from `@institutional-knowledge/shared` instead | Schema Placement / Type Safety |
| Importing Next.js, Hono, or Express in a custom hook, handler, or request function | Couples business logic to the framework; violates the framework agnosticism constraint — only route handler files and `server.ts` may import framework-specific APIs | Frontend Framework Agnosticism |
| Calling useSWR or useSWRMutation directly in a component (not inside a custom hook) | Scatters data-fetching logic across components; preventing framework replacement would require touching every component rather than just hook files | Frontend Framework Agnosticism |
| Plain `fetch` calls inside a custom hook (bypassing useSWR/useSWRMutation) | Inconsistent request handling; loses the caching, deduplication, and revalidation guarantees that useSWR provides | Frontend Framework Agnosticism |
| Setting the `x-internal-key` header outside of the request functions layer (e.g. in a hook or component) | The internal key must never appear in browser-side code; it is a server-to-server credential and must remain confined to the custom server request functions | Security / Frontend Framework Agnosticism |

---

## pnpm Catalog Convention

A package belongs in the pnpm catalog (`pnpm-workspace.yaml` under `catalog:`) if and only
if it is declared by more than one workspace member. Single-package dependencies stay in
that package's own `package.json`. This keeps the catalog meaningful and prevents
version drift across packages without cataloging backend-only or frontend-only dependencies.

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

**Coordination functions**: `createRouter` and `createApp` are the only functions permitted
to receive the full `AppDependencies` bag. They are coordination/composition functions whose
sole job is to destructure the bag and pass one service to each router or factory they
instantiate. This is not a violation of the narrowing rule — it is the mechanism that
enforces it. Everything they call receives only what it needs.

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
- **`ServiceResult` inside transactions**: when calling a function that returns `ServiceResult<T, E>` from within a `db._knex.transaction()` block, always check `outcome` immediately. If `outcome === 'error'`, throw an error to trigger rollback — do not allow the transaction to commit despite a logical failure. Discarding a `ServiceResult` return value inside a transaction is prohibited.

---

## Error Response Pattern

Route handlers translate a `ServiceResult` error outcome into a JSON response using this
unified envelope:

```typescript
{ error: <errorType>, message?: <errorMessage>, data?: <errorData> }
```

- `error` — always present; the `errorType` string from `ServiceResult`
- `message` — present for standard errors; the `errorMessage` string from `ServiceResult`
- `data` — present when `ServiceResult` carries `errorData`; the structured payload nested
  under `data` (not spread at the top level)
- Both `message` and `data` may be present simultaneously when a future error case warrants it

**Example** — standard error (message only):

```typescript
res.status(404).json({ error: result.errorType, message: result.errorMessage });
```

**Example** — structured error (data only):

```typescript
res.status(409).json({ error: result.errorType, data: result.errorData });
```

The `errorData` payload must never be spread at the top level of the response object
(`{ error, ...result.errorData }` is prohibited). Nesting it under `data` keeps the envelope
shape predictable for API consumers.

Route handlers must use `sendServiceError` from `routes/routeUtils.ts` to send error
responses — not inline `res.json()` calls — so that the envelope shape is enforced in one
place. `sendServiceError` selects `data:` or `message:` automatically based on whether
`errorData` is present.

---

## Repository Pattern

All SQL lives in `apps/backend/src/db/repositories/`. Repositories are grouped by **domain**, not by table — a repository owns all the tables that belong to its domain and may JOIN across them freely for read queries, and may run transactions across them for writes. Services call `db.graph.addTermWithRelationships(...)` or `db.documents.insert(...)` — they never write SQL directly and never call `db._knex` except to open a transaction boundary that crosses repository domains (which should be rare and explicitly justified).

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
  pipelineSteps: PipelineStepsRepository;
  processingRuns: ProcessingRunsRepository;
  ingestionRuns: IngestionRunsRepository;
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
| Integration test seed helpers | Prefer `db.documents.insert()` (or equivalent repository method) when one exists. Use `db._knex` only for tables that have no repository insert method (e.g. `pipeline_steps`) or when verifying raw DB state after a test |

`knex.raw()` is permitted inside repositories for queries that cannot be expressed in the Knex query builder (pgvector cosine distance, recursive CTEs). When using `knex.raw()`, column names must be written in snake\_case because `wrapIdentifier` does not apply; result rows must be mapped to camelCase explicitly.

**Transaction participation**: repository methods that may be called inside a caller-owned transaction accept an optional `trx?: Knex.Transaction` parameter and use `const qb = trx ?? db` internally. Any abstraction that wraps a repository (e.g. `VectorStore`, `GraphStore`) must expose the same optional `trx` parameter on methods that write to the database, and thread it through to the underlying repository call. Omitting `trx` from an abstraction's write method forces the write onto a separate pool connection, which cannot see uncommitted rows from the outer transaction and will fail FK constraints.

---

## Schema Placement

Zod schemas serve two distinct roles in this project. Where a schema lives depends on which
role it plays:

| Schema type | Where it lives | Exported to OpenAPI? |
| --- | --- | --- |
| Path params (`:id`, `:termId`) | Locally in the route file — not exported | No |
| Query params | `packages/shared/src/schemas/` — registered with the OpenAPI registry | Yes |
| Request bodies | `packages/shared/src/schemas/` — registered with the OpenAPI registry | Yes |
| Response bodies | `packages/shared/src/schemas/` — registered with the OpenAPI registry | Yes |

**Why path params are local**: path parameters are always strings at the HTTP layer. A local
schema coerces or validates the value (e.g. `z.uuid()`) for the handler's benefit only —
this is not a contract type that API consumers need to know about. Placing a path-param
schema in `packages/shared/src/schemas/` and registering it with OpenAPI would pollute the
spec with internal implementation details.

**Why everything else goes in shared**: query params, request bodies, and response bodies
define the API contract that consumers depend on. They must appear in the OpenAPI spec.
Defining them locally in a route file makes them invisible to the spec generator and creates
drift between the code and the documented contract.

**Frontend schema rule**: the frontend must import contract schemas from
`@institutional-knowledge/shared` rather than redefine them. `apps/frontend/src/lib/schemas.ts`
contains only the three frontend form validation schemas that are purely frontend concerns:

| Schema | Reason |
| --- | --- |
| `UploadFormSchema` | Validates a browser `File` object — not an API contract |
| `MetadataEditSchema` | Derived from `UpdateDocumentMetadataRequest`; extends it with frontend-specific transformation rules (e.g. comma-separated string inputs) |
| `AddTermSchema` | Derived from `AddVocabularyTermRequest`; extends it with frontend-specific rules |

A comment at the top of `schemas.ts` must note that all response schemas are imported from
`@institutional-knowledge/shared` and that the schemas in this file are extensions or
frontend-only concerns, not independent definitions. Redefining a response schema locally
creates a duplicate that can silently drift from the backend source of truth.

**Frontend schema derivation — preserve source field transformations**: when a frontend
schema overrides a field from a shared schema via `.extend()`, the override must preserve
any transformations the source field applies (`.trim()`, `.toLowerCase()`, coercions). A
`.refine()` check replicates the validation invariant but drops the transformation — the
form will submit a value the server would silently mutate, making round-trip behaviour
inconsistent and harder to reason about. If you are unsure whether a source field
transforms, read the shared schema before writing the override.

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

---

## Startup Sweep Design Principle

Startup sweeps (ADR-017, ADR-018) prioritise **recoverability over atomicity**. The sweep runs
once at startup, before the HTTP server accepts requests, and cleans up state left by a previous
crash. The design rules are:

**Per-document ordering: file first, then DB row**

Delete the storage file before deleting the database record. If the file delete succeeds but
the process crashes before the DB delete, the next sweep will retry — the DB row makes the
orphaned state visible. If the DB delete happened first and the process then crashed, the file
would be invisible and would leak permanently.

**Per-document isolation: try/catch per document**

Each document's cleanup is wrapped in a try/catch. A failure on one document (e.g. a transient
I/O error) must not prevent the next document from being cleaned up. Log the error and continue.

**No transaction wrapper**

Startup sweeps must not use a `db._knex.transaction()` wrapper. Storage I/O cannot participate
in a SQL transaction and would not roll back. The per-document try/catch is the recovery
mechanism; atomicity is neither achievable nor necessary here.

**Intentional divergence from service-layer cleanup**

Startup sweeps may duplicate logic from service-layer cleanup methods (e.g. `_cleanupRunById`
in `IngestionService`). This is intentional — the sweep cannot reuse those methods because
they may be written for transactional contexts. The comment in each sweep file should note
which service method it intentionally diverges from and why.

**Storage deletes are idempotent**

`StorageService.deleteStagingFile`, `deletePermanentFile`, and `deleteStagingDirectory` are all
idempotent — `ENOENT` is silently swallowed. Sweeps may call them unconditionally without
checking whether the file exists first.

---

## UUID Version Standard (backend)

The backend (`apps/backend/`) uses **UUID v7** (`v7 as uuidv7` from the `uuid` package) for all
generated identifiers — in source code and in tests. UUID v7 is time-ordered, which improves
B-tree index locality and insert performance when used as PostgreSQL primary keys.

```ts
import { v7 as uuidv7 } from 'uuid';
const id = uuidv7();
```

UUID v4 is not prohibited in other parts of the project (frontend, Python service) where DB
primary key performance is not a concern. If v4 is used elsewhere for a valid reason, no change
is required.

---

## Frontend Framework Agnosticism

The frontend is built with React, Next.js, and Hono because they are pragmatic choices, not
because the architecture depends on them. The following constraints prevent framework coupling
from accumulating in the wrong layers.

**What must stay framework-agnostic**:

- Custom hook logic — no Next.js imports; hooks are plain React
- Handler layer (custom server) — no Next.js, no Hono, no Express imports; pure TypeScript
  business logic
- Request functions (custom server) — no framework imports; Ky is the HTTP library; this layer
  has no knowledge of Next.js, Hono, or any server framework
- Presentational components — no Next.js imports beyond what React itself requires
- `fetchWrapper` utility (browser side) — a thin project utility wrapping plain `fetch`; sets
  consistent `content-type` and base path; used only as the fetcher argument to useSWR and
  useSWRMutation; no framework coupling

**What is permitted to be framework-specific**:

- Hono route handler files — the deliberate framework boundary; thin by design and the only
  place Hono-specific API patterns appear
- `server.ts` — the Hono app entry point; mounts the API router, applies auth middleware, and
  mounts Next.js as a catch-all for all non-API traffic
- Page components where RSC patterns are used — acceptable because pages are the natural
  framework boundary

**Why**: if Hono were replaced, or if Next.js were replaced with a static React build, the
handler layer, request functions, hooks, and components should require zero changes. Only the
route handler files, `server.ts`, and pages would need rewriting — and those are intentionally
thin.

useSWR and useSWRMutation are kept at the boundary: they are called only within custom hook
files, never directly in components. Replacing them would be a change confined to hook files.

**HTTP libraries**:

- Browser side: useSWR for data fetching (GET requests) and useSWRMutation for mutations
  (POST, PATCH, DELETE). Both call through `fetchWrapper`. No plain `fetch` calls in hooks
  — all requests go through useSWR/useSWRMutation for consistency.
- Custom server request functions: **Ky**. A single pre-configured Ky instance shared across
  all request functions sets the backend base URL (`express.baseUrl` from config) and the
  `x-internal-key` header once. Ky is `fetch`-based, edge-compatible, and framework-agnostic.

**Component library and styling**:

- Interactive component primitives (dialog, select, menu, popover, checkbox, tabs,
  tooltip) use **Base UI** (`@base-ui-components/react`). Simple HTML elements
  (`<button>`, `<input>`, `<ul>`) are used directly where no primitive is needed.
- All styling uses **Tailwind CSS** utility classes. No CSS modules anywhere in the
  frontend. `src/styles/global.css` imports Tailwind base, components, and utilities;
  `tailwind.config.ts` lives at `apps/frontend/`.
- Phase 1 is deliberately unpolished (UR-119) — components are functional with minimal
  Tailwind classes. Phase 2 adds visual polish (colour palette, typography, spacing) via
  Tailwind config and class updates only; no component restructuring required.
- See ADR-051.

**Date handling**:

- Frontend uses `Temporal.PlainDate` (via `@js-temporal/polyfill`) for all calendar date
  logic — parsing, validation, and display. Import `Temporal` from
  `apps/frontend/src/lib/temporal.ts`, not from the global.
- `parseFilename` uses `Temporal.PlainDate.from()` with try/catch to detect invalid
  calendar dates (e.g. `2026-02-30`). `Date` cannot do this reliably.
- API response `date` fields are `string | null`. Convert to `Temporal.PlainDate` at the
  component boundary; display `null` as "Undated".
- Backend continues to use `Date` for DB timestamp operations (Knex boundary). Backend
  migration to `Temporal` is deferred to Phase 2 (see ADR-050 and
  `project_pending_principles.md`).
