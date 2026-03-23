# Frontend Tasks — Revision

**Approved**: 2026-03-23

## Purpose

This document records all identified changes agreed on 2026-03-23 before the Project
Manager rebuilds `frontend-tasks.md`. The draft was reviewed and approved; this file
is now the actionable reference. It will be moved to `archive/` once all steps are
complete.

Changes fall into three categories:

1. **Contract changes** — things that changed in the backend during implementation that
   the original frontend tasks did not anticipate
2. **Testing architecture** — a testing model that was never properly defined, requiring
   new design principles and a revised frontend plan before tasks can be written correctly
3. **Custom server architecture** — a three-layer structure (route handler → handler →
   request functions) that is not reflected anywhere in the current documentation

Once this draft is reviewed and agreed, the changes must flow through the documentation
hierarchy in order — each layer informs the next:

1. **Integration Lead** — fix `DuplicateConflictResponse` in `packages/shared/src/schemas/documents.ts`
   and update `integration-lead-contracts.md` to reflect the actual wire shape (see §0 below)
2. **`documentation/process/development-principles.md`** — add the frontend three-tier
   testing model (mirrors the backend two-tier section already there); this is the
   canonical reference for the Implementer and code reviewer
3. **`documentation/tasks/senior-developer-frontend-plan.md`** — revise the testing
   approach section, add the custom server three-layer architecture, and document the
   Hono + Next.js catch-all server structure; the plan is the durable design reference
   that sits above the task list
4. **`frontend-tasks.md`** — PM rebuilds from scratch using the updated principles,
   the revised plan, and this document as additional context

Skipping steps 1–3 would mean the PM writes tasks without a principled basis, and the
Implementer would have no upstream reference to consult when the task description is
ambiguous.

---

## Guiding design principle — framework agnosticism

The frontend is built with React and Next.js because they are pragmatic choices for this
project, not because the architecture depends on them. The following constraints must be
carried into the revised senior developer plan and enforced by the code reviewer:

**What must stay framework-agnostic**:

- Custom hook logic — no Next.js imports; hooks are plain React
- Handler layer (custom server) — no Next.js, no Hono, no Express imports; pure
  TypeScript business logic
- Request functions (custom server) — no framework imports; Ky is the HTTP library (a
  thin `fetch`-based wrapper); the layer has no knowledge of Next.js, Hono, or any
  server framework
- Presentational components — no Next.js imports beyond what React itself requires
- `fetchWrapper` utility (browser side) — a thin project utility function (not a library)
  wrapping plain `fetch`; sets consistent `content-type` and base path; used only as the
  fetcher argument passed to useSWR and useSWRMutation — it has no framework coupling of
  its own and could be reused with any replacement data-fetching library

**What is permitted to be framework-specific**:

- Hono route handler files — these are the deliberate framework boundary; thin by design
  and the only place Hono-specific API patterns appear
- `server.ts` — the Hono app entry point; mounts the API router, applies auth middleware,
  and mounts Next.js as a catch-all for all non-API traffic; framework-specific but thin
- Page components where RSC patterns are used (e.g. server-side data fetch, `redirect()`)
  — acceptable because pages are the natural framework boundary and RSC is used here
  because it is convenient, not because the architecture requires it

**Why**: if Hono were replaced with another framework, or if Next.js were replaced with a
static React build + React Router, the handler layer, request functions, hooks, and
components should require zero changes. Only the route handler files, `server.ts`, and
pages would need rewriting — and those are intentionally thin.

useSWR and useSWRMutation are similarly kept at the boundary: they are called only within
custom hook files, never directly in components. Replacing them with TanStack Query would
be a change confined to hook files.

**HTTP libraries**:

- **Browser side** — useSWR for data fetching (GET requests, queue data) and
  `useSWRMutation` for mutations (POST, PATCH, DELETE). Both call through a thin shared
  project utility (`fetchWrapper`) that sets consistent `content-type` and base path.
  No plain `fetch` calls in hooks — all requests go through useSWR/useSWRMutation for
  consistency. `fetchWrapper` is a project utility function, not a dependency.
- **Custom server request functions** — **Ky**. Ky is a thin `fetch`-based wrapper that
  removes request function boilerplate (non-2xx error handling, JSON serialisation,
  consistent headers). A single pre-configured Ky instance shared across all request
  functions sets the backend base URL (from config `express.baseUrl`) and the `x-internal-key` header once. Ky is
  `fetch`-based, so it is edge-compatible and framework-agnostic — consistent with the
  principle above. Superagent and axios are not preferred: superagent has lost momentum;
  axios is Node-specific and would not survive a move to edge/serverless.

This principle is not a commitment to migrate — Next.js and RSC are the right choices for
Phase 1. It is a constraint that keeps the migration path open and prevents framework
coupling from accumulating in the wrong layers.

---

## 0. Pre-condition — Integration Lead fix required

### 0.1 `DuplicateConflictResponse` schema and contract are inconsistent with the backend

**What the backend actually sends** (DOC-002, 409 duplicate detected):

```json
{ "error": "duplicate_detected", "data": { "existingRecord": { ... } } }
```

This is the standard error envelope produced by `sendServiceError` in `routes/routeUtils.ts`
when `errorData` is present: `{ error: errorType, data: errorData }`.

**What the shared schema says** (`packages/shared/src/schemas/documents.ts`):

```typescript
const DuplicateConflictResponse = z.object({
  error: z.literal('duplicate_detected'),
  existingRecord: z.object({ ... }),
});
```

This schema has `existingRecord` at the top level and includes its own `error` field —
meaning it was designed as the full response body. But it is passed as `errorData` to
`sendServiceError`, which wraps it under `data`. The actual wire response therefore has
`error` duplicated and `existingRecord` one level deeper than the schema describes.

**What the Integration Lead contract says**
(`documentation/tasks/integration-lead-contracts.md`, DOC-002):

```typescript
interface DuplicateConflictResponse {
  error: 'duplicate_detected';
  existingRecord: { ... };
}
```

Same as the shared schema — `existingRecord` at the top level. The contract was never
updated to reflect the envelope pattern established during backend implementation.

**Required fixes (Integration Lead task)**:

1. Update `DuplicateConflictResponse` in `packages/shared/src/schemas/documents.ts` to
   represent only the `errorData` payload — remove the `error` field and keep only
   `{ existingRecord: { ... } }`. The `error: 'duplicate_detected'` field belongs to the
   envelope, not the payload.

2. Update the DOC-002 entry in `integration-lead-contracts.md` to show the correct wire
   shape:

   ```json
   { "error": "duplicate_detected", "data": { "existingRecord": { ... } } }
   ```

3. Verify the backend service (`services/documents.ts`) passes only
   `{ existingRecord: { ... } }` as `errorData` — remove the `error` field from the
   `errorData` object constructed there.

**This fix must land before the frontend tasks are rebuilt**, as the frontend task
descriptions for the 409 handling (Tasks 7 and 9) depend on the correct wire shape.

**Note**: this is the only `errorData` case in the entire backend. All other error
responses use `{ error, message }` only and are unaffected.

---

## 1. Contract changes

### 1.1 Shared Zod schemas must be imported, not redeclared

**What changed**: During backend implementation (ADR-048, Task 19), all API request and
response schemas were moved into `packages/shared/src/schemas/` and registered with the
OpenAPI spec generator. These are now the authoritative definitions of every API contract
shape — not the integration-lead contracts document.

**Impact on frontend tasks**: Several tasks tell the Implementer to define response schemas
in `apps/frontend/src/lib/schemas.ts`. This is wrong — it would produce a duplicate
definition that can silently drift from the backend source of truth.

**Rule**: The Implementer must import contract schemas from `@institutional-knowledge/shared`
rather than redefine them. The only schemas that belong in `apps/frontend/src/lib/schemas.ts`
are those that are purely frontend concerns:

| Schema | Where it belongs | Reason |
| --- | --- | --- |
| `UploadFormSchema` | `apps/frontend/src/lib/schemas.ts` | Client-side form validation only; not an API contract |
| `MetadataEditSchema` | `apps/frontend/src/lib/schemas.ts` | Client-side form validation only |
| `AddTermSchema` | `apps/frontend/src/lib/schemas.ts` | Client-side form validation only |
| `DuplicateConflictResponse` | Import from shared | Defined in `packages/shared/src/schemas/documents.ts` |
| `DocumentQueueItem` / `DocumentQueueResponse` | Import from shared | Defined in shared |
| `DocumentDetailResponse` | Import from shared | Defined in shared |
| `UpdateDocumentMetadataRequest` / `UpdateDocumentMetadataResponse` | Import from shared | Defined in shared |
| `VocabularyCandidateItem` / `VocabularyQueueResponse` | Import from shared | Defined in shared |
| `AcceptCandidateResponse` / `RejectCandidateResponse` | Import from shared | Defined in shared |
| `AddVocabularyTermRequest` / `AddVocabularyTermResponse` | Import from shared | Defined in shared |

**Tasks affected**: 4, 10, 13, 15, 17

---

### 1.2 `date` field is `string | null`, not always a string

**What changed**: The null-date audit (PR #32) corrected an anti-pattern where `null` dates
were mapped to `''`. All `date` fields in API responses are now explicitly nullable
(`string | null`) — this is reflected in the shared schemas.

**Impact on frontend tasks**:

- **Task 4** — `DuplicateResponseSchema` described `existingRecord.date` as a string. The
  shared `DuplicateConflictResponse` has `date: z.string().nullable()`. The task description
  and any test assertions that expect a non-null date must be updated.
- **Task 10** — `DocumentQueueItem` display: `date` may be `null`. The component must handle
  this (e.g. display "Undated" rather than rendering `null` directly).
- **Task 12 / 13** — `DocumentDetailResponse` has `date: string | null`. The metadata edit
  form pre-population and `UploadSuccessMessage` must handle null.

**Rule**: Anywhere a `date` value from an API response is rendered, the component must
handle `null` explicitly. "Undated" is the display label for a null date.

**Tasks affected**: 4, 7, 10, 12, 13, 14

---

### 1.3 Error envelope shape for HTTP 409 (duplicate)

**What changed**: The backend error response envelope is:

```json
{ "error": "duplicate_detected", "data": { "existingRecord": { ... } } }
```

The `existingRecord` is nested under `data`, not at the top level of the response body.
This is enforced by `sendServiceError` in `routes/routeUtils.ts`.

**Impact on frontend tasks**: Task 7 describes `DuplicateConflictAlert` receiving props
from the 409 response body, and the original plan treats `existingRecord` as a top-level
field. The component and the Task 9 route handler must read `response.data.existingRecord`,
not `response.existingRecord`.

**Tasks affected**: 7, 9

---

### 1.4 Zod version — use `z.uuid()` not `z.string().uuid()`

**What changed**: The backend prohibited list (development-principles.md) bans `z.string().uuid()`
(Zod v3 chained form). The correct form in Zod v4 is the top-level `z.uuid()`. The shared
schemas already use this consistently.

**Impact on frontend tasks**: Any locally-defined frontend schema that validates UUID fields
(e.g. `targetTermId` in `AddTermSchema`, Task 17) must use `z.uuid()`, not
`z.string().uuid()`. This should be stated explicitly in the task descriptions.

**Tasks affected**: 4, 13, 17 (any task defining local Zod schemas with UUID fields)

---

## 2. Testing architecture

### 2.1 The original tasks have no defined testing model

**The gap**: The original frontend tasks describe testing approaches task-by-task but never
establish a project-wide testing model. The backend has a clear two-tier model documented
in `development-principles.md`. The frontend is different enough in structure that it needs
its own model — but one that follows the same philosophy: each tier has a clear purpose,
and tiers are not mixed within a single test file.

### 2.2 Proposed three-tier testing model

#### Architecture context

The frontend has two distinct sub-systems, each with its own layering:

**UI sub-system** (runs in the browser):

| Layer | Responsibility |
| --- | --- |
| Presentational component | Props → rendered output, accessibility. No state, no API calls. |
| Custom hook | State management and business logic. Uses useSWR for data fetching and useSWRMutation for mutations — both pass `fetchWrapper` as the fetcher. |
| Page / wrapper component | Wires a hook to a presentational component. Thin — one line of logic. |

**Custom server sub-system** (runs in Node.js, never in the browser):

| Layer | Responsibility |
| --- | --- |
| Route handler | Thin — parse request, call handler, shape response. Swappable transport layer. |
| Handler | Business logic and orchestration. No knowledge of HTTP or request libraries. |
| Request functions | Thin — URL construction, HTTP instantiation, `x-internal-key` header injection, response parsing, error classification. Swappable call mechanism. |

The `x-internal-key` header lives exclusively in the custom server request functions. It is
never set or seen by browser-side code.

---

#### Tier 1 — Unit tests

Covers pure functions and presentational components. No state management, no API calls,
no running server.

**What belongs here**:

- Pure utility functions: `parseFilename`, Zod form schemas, any formatting or sorting utilities
- Presentational component tests: RTL with static props — rendering, accessibility (ARIA
  roles, keyboard navigation), conditional display logic
- Custom server utility functions: any pure helper functions extracted from the handler
  or request function layers (e.g. error classifiers, response mappers) — test here if
  they are standalone with no I/O; leave in Tier 2 coverage otherwise
- `fetchWrapper` utility: mock `window.fetch` directly to assert consistent `content-type`
  header and base path are set on every call

**What does not belong here**: anything that involves state transitions, API calls, or
component-hook wiring.

Tooling: Vitest, React Testing Library (for components), no MSW needed.

---

#### Tier 2 — Behaviour tests

Covers stateful behaviour and the custom server's internal layers. This is where the
bulk of confidence lives.

**UI behaviour — custom hook tests**:

- Use `renderHook` from React Testing Library
- MSW intercepts calls from the fetch wrapper to the **Hono API route paths**
  (e.g. `/api/curation/documents`, `/api/documents/upload`)
- Assert on state transitions: idle → loading → success, idle → loading → error,
  mutation → re-fetch, partial failure handling
- Multi-component tests where two or more components share a hook or context: mount
  them together with shared mocked state, assert on cross-component effects

useSWR/useSWRMutation note: `useSWR` handles all data fetching; `useSWRMutation` handles
all mutations. Both call through `fetchWrapper`. MSW intercepts at the Hono API route
boundary regardless of which hook is under test — no special SWR-specific mocking needed.

Fetcher placement: fetchers passed to useSWR/useSWRMutation may be defined inline in the
hook file or in a co-located `[hookName].requests.ts` file. Either is acceptable — start
inline and extract to a shared helper if repetition across hooks warrants it. If extracted,
the fetcher functions can also be unit tested independently at Tier 1.

**Custom server — route handler tests**:

- Drive requests into the route handler using supertest against a minimal test server
- The handler calls the handler layer, which calls request functions
- Mock the request functions (or intercept at the HTTP level with MSW) to isolate the
  route handler from the Express backend
- Assert on: response status, response body shape, error propagation

**Custom server — handler tests**:

- Import the handler function directly (it has no knowledge of HTTP)
- Mock the request functions it calls
- Assert on: orchestration logic, error classification, cleanup on failure, typed return values
- The composite upload handler (DOC-004 equivalent) is the primary target here — three
  sequential calls with cleanup on failure is non-trivial logic that warrants thorough
  handler-level testing

**Custom server — request function tests**:

- Import the request function directly
- Mock the Ky instance at the call boundary
- Assert on: correct URL construction, `x-internal-key` header present, correct request
  body/query params, expected error states returned as typed results, unexpected errors
  re-thrown

Tooling: Vitest, React Testing Library (`renderHook`), MSW (UI behaviour), supertest
(custom server route handlers).

---

#### Tier 3 — E2E tests (small in number)

Full stack: real browser, real Hono custom server, Express backend mocked at the network boundary.

- Playwright drives a real browser against a running Hono custom server (which mounts Next.js for page traffic)
- MSW in service worker mode (or a lightweight mock HTTP server) intercepts outbound calls
  from the custom server to Express
- Tests cover critical happy paths and key error paths that can only be observed with the
  full component tree and server assembled together
- Cross-component effects that cannot be tested at Tier 2 belong here
- These are expensive to write and maintain — keep the count small and focused

Tooling: Playwright, MSW (service worker or Node server mode).

---

### 2.3 What the original tasks must change

**Original tasks treat component tests and API route tests as the same thing.** They
describe "Vitest + React Testing Library + MSW" for both. Under the new model these are
distinct tiers (Tier 1 for presentational components, Tier 2 for hooks and custom server).
Every task that currently has a combined testing acceptance condition needs to be split.

**MSW intercept boundary**: the original tasks never specify which fetch calls MSW
intercepts. Under the new model this must be explicit in every task:

| Tier | MSW intercepts | URL pattern |
| --- | --- | --- |
| Tier 2 — hook tests | useSWR/useSWRMutation → Hono API route | `/api/documents/upload` |
| Tier 2 — custom server handler tests | Request functions → Express | `http://localhost:4000/api/documents` |
| Tier 3 — E2E | Custom server → Express | `http://localhost:4000/api/documents` |

**Tasks affected**: all tasks with testing acceptance conditions — 2, 3, 4, 5, 7, 9, 10,
11, 12, 13, 15, 16, 17, 18, 21.

---

### 2.4 Task 21 — reframe as Tier 1 request function contract sweep

The original Task 21 is described as an "end-to-end MSW integration test suite." Under
the new model, true end-to-end is Tier 3 (Playwright). Task 21 should be reframed as a
**Tier 1 unit test of all request functions**: a single dedicated test file that imports
each request function directly, mocks the Ky instance, and asserts that every outbound
call to Express has:

- The correct URL constructed
- The correct HTTP method
- The `x-internal-key` header present
- The correct request body or query parameter structure

This is not a route handler test or a handler test — it is a contract assertion on the
request functions layer alone. Keeping it in a single file prevents this cross-cutting
concern from being scattered across individual route tasks and adding clutter to those
test files.

---

## 3. Custom server architecture and coverage

### 3.0 Suggested folder structure

The following is a guide for the Implementer, not a rigid convention. Use judgement as
pages are built — some pages may not need a `_hooks/` directory, and unexpected shared
state may require a different home.

```text
apps/frontend/
  |- src/                          # Next.js UI
  | |- app/
  | | |- admin/
  | | | |- curation/
  | | | | |- _hooks/              # Co-located hook, types, and hook tests
  | | | | | |- useDocumentQueue.types.ts
  | | | | | |- useDocumentQueue.test.ts
  | | | | | |- useDocumentQueue.ts
  | | | | |- components/          # Sub-components used only by this page
  | | | | |- page.module.css
  | | | | |- page.tsx
  | | | |- page.module.css
  | | | |- page.tsx
  | | |- layout.tsx
  | | |- page.tsx
  | |- components/                 # Shared presentational components (one directory per component)
  | | |- Button/
  | | | |- Button.tsx
  | | | |- Button.module.css
  | | | |- __tests__/
  | | |   |- Button.test.tsx       # Tier 1 — RTL, static props, accessibility
  | |- lib/                        # fetchWrapper, schemas.ts, pure utilities
  | |- styles/
  |   |- global.css
  |- server/                       # Hono custom server
    |- routes/                     # Hono route handlers (thin)
    |- handlers/                   # Business logic handlers (no framework imports)
    |- requests/                   # Request functions — Ky → Express (no framework imports)
    |- server.ts                   # Hono app entry point; mounts Next.js as catch-all
```

**Notes**:

- `_hooks/` uses the Next.js `_` prefix convention for co-located non-route files
- A top-level `hooks/` directory is not created speculatively — if a genuinely cross-cutting
  hook emerges, decide its home at that point
- `src/lib/schemas.ts` contains only the three frontend form validation schemas; all
  response schemas are imported from `@institutional-knowledge/shared` (see §1.1 and §D2)
- The `server/` directory is a peer to `src/`, not inside it — the two sub-systems are
  genuinely separate

---

### 3.1 Custom server internal structure (new requirement)

The original tasks treat the custom server as a monolith — `server.ts` plus API route
handler files. The three-layer architecture described above (route handler → handler →
request functions) is not reflected in the task descriptions at all.

**New tasks or task changes needed**:

- A task to establish the Hono server structure: `server.ts` setup, auth middleware
  wiring, Next.js catch-all mount, and the directory layout for route handlers, handlers,
  and request functions
- Each API route task must describe all three layers, not just the route handler file

### 3.2 `server.ts` has no automated test coverage

The original Task 1 acceptance condition is entirely manual. At minimum, automated tests
should cover:

- Config is read and the server initialises without error (startup smoke test)
- The internal key used to authenticate outbound calls to the Express backend does not
  appear in any response header returned to the browser (security property — the internal
  key must never leak beyond the custom server)

These are Tier 2 tests (supertest against the custom server).

---

## 4. Design decisions

### D1: Three-tier model goes into `development-principles.md`

**Decided**: Yes, before invoking the PM. Every principle identified in this document that
is not implementation-specific belongs in `development-principles.md` as the canonical
reference for the Implementer and code reviewer — the same approach used for the backend.

### D2: `apps/frontend/src/lib/schemas.ts` — one file, derived from shared

**Decided**: One file. It contains only the three frontend form validation schemas
(`UploadFormSchema`, `MetadataEditSchema`, `AddTermSchema`). `UploadFormSchema` is
frontend-only (validates a browser `File` object). `MetadataEditSchema` and `AddTermSchema`
are derived from their shared counterparts (`UpdateDocumentMetadataRequest`,
`AddVocabularyTermRequest`) — they extend the shared schema shapes with frontend-specific
transformation rules (e.g. comma-separated string inputs). A comment at the top of the
file notes that all response schemas are imported from `@institutional-knowledge/shared`
and that the schemas in this file are extensions or frontend-only concerns, not independent
definitions.

### D3: Task 21 survives — reframed as Tier 1 request function contract sweep

**Decided**: Yes — see §2.4. A single dedicated test file for all request functions,
asserting correct URL, method, headers, and body structure on every outbound Express call.
Tier 1 unit test, not an integration test.

### D4: Custom server route handlers tested with supertest against the Hono app

**Resolved**: The custom server is a **Hono app** that mounts Next.js as a catch-all for
page traffic. All `/api/*` routes are Hono route handlers — not Next.js file-based API
routes. This is a deliberate architectural decision driven by three requirements:

1. **Clean auth** — auth middleware is applied globally to `/api/*` in Hono; it never
   touches Next.js middleware, which is fiddly, edge-restricted, and has a history of
   security issues
2. **Framework agnosticism** — Hono route handlers are plain functions; the handler and
   request function layers have no framework imports
3. **Supertest** — Hono mounts as a Node.js HTTP server; supertest drives requests into
   it naturally, which is a more comfortable and familiar test approach than constructing
   synthetic `new Request(...)` objects

**The server structure**:

```typescript
// server.ts
const nextApp = next({ dev: process.env.NODE_ENV !== 'production', customServer: true });
const nextHandler = nextApp.getRequestHandler();
await nextApp.prepare();

const app = new Hono();

app.use('/api/*', authMiddleware); // Phase 2 — no-op in Phase 1, wired now
app.post('/api/documents/upload', uploadRoute);
// ... all API routes

app.all('*', (c) => {
  // Next.js handles all page traffic
  nextHandler(c.env.incoming, c.env.outgoing, parse(c.req.url, true));
});
```

**Testing**: supertest against the Hono app instance. Handler and request function layers
mocked to isolate the route handler. The Hono app is the test boundary — the same pattern
as the backend's Express app and supertest.

### D5: SWR fetcher placement is an implementer decision

**Decided**: Start inline in the hook file. Extract to a co-located `[hookName].requests.ts`
file if repetition across hooks warrants a shared helper — but do not extract prematurely.
Both approaches are acceptable; if extracted, the fetcher functions must be unit tested
independently at Tier 1. This should be documented in `development-principles.md` as a
permitted choice, not a prescription.

---

## Summary of tasks to add / change

| Change | Current task(s) | Action |
| --- | --- | --- |
| Import response schemas from shared | 4, 10, 13, 15, 17 | Update descriptions |
| Null `date` handling in display components | 4, 7, 10, 12, 13, 14 | Update descriptions and acceptance conditions |
| 409 error envelope — read `response.data.existingRecord` | 7, 9 | Update descriptions and test assertions |
| Zod v4 — `z.uuid()` not `z.string().uuid()` | 4, 13, 17 | Update descriptions |
| Three-tier testing model documented | All | Add to `development-principles.md` before PM |
| Hono server setup task (new) | — | New task: `server.ts`, auth middleware (no-op Phase 1), Next.js catch-all, directory scaffold for `routes/`, `handlers/`, `requests/`; Tier 2 supertest smoke test and internal key leak assertion |
| Shared utilities task (new) | — | New task: `fetchWrapper`, shared Ky instance, `src/lib/schemas.ts`; must precede all UI and server implementation tasks |
| Hono replaces Next.js file-based API routing | All API route tasks | All API route tasks rewritten as Hono route handler + handler + request function; three layers per task |
| Custom server three-layer structure defined | 1, 9, 11, 13, 16, 18 | Covered by Hono server setup task and handler/request function layers in each API task |
| Testing acceptance conditions split by tier | 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 15, 16, 17, 18, 21 | Rewrite per-task testing sections |
| MSW intercept boundary explicit per task | Same as above | Specify which layer MSW intercepts in each task |
| `server.ts` automated coverage | Task 1 | Add Tier 2 supertest smoke test and security assertion |
| Task 21 reframed as Tier 1 request function contract sweep | 21 | Update description and acceptance condition |
| E2E task added (Playwright) | New task | Replace original Task 21 intent with a Playwright task |
