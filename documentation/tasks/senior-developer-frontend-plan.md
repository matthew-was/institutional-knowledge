# Senior Developer Plan — Frontend Service

## Status

Approved — 2026-03-03. Revised — 2026-03-23 (Hono custom server architecture, three-tier
testing model, framework agnosticism constraints, corrected `DuplicateConflictResponse` wire
shape, nullable `date` fields).

---

## Integration Lead contracts notice

All 12 API calls in this plan have been matched to approved contracts in
`documentation/tasks/integration-lead-contracts.md` (Approved 2026-03-03, updated 2026-03-23).
Open questions OQ-001 through OQ-004 are resolved. Implementation may proceed.

---

## Scope summary

This plan covers the `apps/frontend/` service for Phase 1. It addresses two functional areas:

- **C1 — Document Intake UI**: single document upload form with metadata fields and client-side
  validation; deduplication conflict feedback; file validation feedback before and after
  submission.
- **Curation UI**: document curation queue; vocabulary review queue (distinct from the document
  queue, per US-079); flag clearing; document metadata correction; manual vocabulary term entry;
  vocabulary candidate accept/reject.

The web UI query (US-073, C3) is Phase 2 and is explicitly out of scope for this plan.

Bulk ingestion progress display is also out of scope for Phase 1. Bulk ingestion runs via the
CLI in Phase 1 (ADR-018, ADR-019); the summary report is written to stdout and a timestamped
file (UR-024), not to the web UI. No Phase 1 user story requires a web view for bulk run
status or report download.

The frontend uses a **Hono custom server** that mounts Next.js as a catch-all for page
traffic. All `/api/*` routes are Hono route handlers — not Next.js file-based API routes.
This is the deliberate architectural boundary per ADR-044 and the decisions finalised
2026-03-23. The C3 query proxy path (ADR-045) is noted as a server-side concern but not
planned here because no Phase 1 query UI is delivered.

---

## Custom server architecture

### Overview

The frontend is a **Hono custom server** (`apps/frontend/server/server.ts`) that:

1. Mounts auth middleware globally on `/api/*` (no-op in Phase 1; wired now for Phase 2)
2. Registers all `/api/*` routes as Hono route handlers
3. Mounts Next.js as a catch-all handler for all non-API traffic (page routes, static assets)

This structure is documented in ADR-044. The key consequence is that there are **no Next.js
file-based API routes** — the `app/api/` directory does not exist. All API handling lives in
`server/routes/`.

### Three-layer structure

Each API operation is implemented across three layers, each with a single responsibility:

| Layer | Location | Responsibility |
| --- | --- | --- |
| Route handler | `server/routes/` | Thin: parse request, call handler, shape response. Only Hono imports here. |
| Handler | `server/handlers/` | Business logic and orchestration. No knowledge of HTTP or request libraries. No framework imports. |
| Request functions | `server/requests/` | Thin: URL construction, HTTP call via Ky instance, `x-internal-key` header injection, response parsing, error classification. No framework imports. |

The `x-internal-key` header lives exclusively in the request functions layer. It is never set
or seen by browser-side code.

### `server.ts` pattern

```typescript
// server/server.ts
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

### Folder structure

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
    |- requests/                   # Request functions — Ky -> Express (no framework imports)
    |- server.ts                   # Hono app entry point; mounts Next.js as catch-all
```

Notes:

- `_hooks/` uses the Next.js `_` prefix convention for co-located non-route files
- A top-level `hooks/` directory is not created speculatively — if a genuinely cross-cutting
  hook emerges, decide its home at that point
- `src/lib/schemas.ts` contains only the three frontend form validation schemas
  (`UploadFormSchema`, `MetadataEditSchema`, `AddTermSchema`); all response schemas are
  imported from `@institutional-knowledge/shared` (see Validation sections)
- The `server/` directory is a peer to `src/`, not inside it — the two sub-systems are
  genuinely separate

### Framework agnosticism constraints

The following layers must remain framework-agnostic (no Next.js, Hono, or Express imports):

- Handler layer (`server/handlers/`) — pure TypeScript business logic
- Request functions layer (`server/requests/`) — Ky is the HTTP library; no framework imports
- Custom hooks (`src/app/*/_hooks/`) — plain React only; no Next.js imports
- Presentational components — no Next.js imports beyond what React itself requires
- `fetchWrapper` utility (`src/lib/fetchWrapper.ts`) — thin project utility wrapping plain
  `fetch`; sets consistent `content-type` and base path; used as the fetcher argument passed
  to `useSWR` and `useSWRMutation`

The following layers are permitted to be framework-specific:

- `server/routes/` — Hono route handlers; deliberate framework boundary; thin by design
- `server/server.ts` — Hono app entry point; mounts Next.js; framework-specific but thin
- Page components where RSC patterns are used (server-side data fetch, `redirect()`) —
  acceptable because pages are the natural framework boundary

Full constraints are documented in `documentation/process/development-principles-frontend.md`
(Frontend Framework Agnosticism section). Do not restate them here — cross-reference only.

### HTTP libraries

- **Browser side** — `useSWR` for data fetching (GET requests, queue data) and
  `useSWRMutation` for mutations (POST, PATCH, DELETE). Both call through `fetchWrapper`.
  No plain `fetch` calls in hooks — all requests go through `useSWR`/`useSWRMutation`.
  `fetchWrapper` is a project utility function, not a dependency.
- **Custom server request functions** — **Ky**. A single pre-configured Ky instance shared
  across all request functions sets `express.baseUrl` (from config) and the `x-internal-key`
  header once. Ky is `fetch`-based, edge-compatible, and framework-agnostic.

---

## C1 — Document Intake UI

### Pages and routes

| Route | Page file | Purpose |
| --- | --- | --- |
| `/` | `app/page.tsx` | Root redirect to `/upload` |
| `/upload` | `app/(private)/upload/page.tsx` | Single document upload form |
| `/upload/success` | `app/(private)/upload/success/page.tsx` | Confirmation after a successful submission |

The application uses the Next.js App Router. All pages are React Server Components by default;
interactive components (form, file picker, validation feedback) are Client Components
(`"use client"`). The root page at `/` redirects to `/upload` so that the application opens
directly on the intake form.

### Components

All components live in `apps/frontend/src/components/`. Shared layout primitives (navigation
header, page shell) live in `apps/frontend/src/components/layout/`.

#### `AppNav` (Server Component)

Responsibility: top-level application navigation header rendered on every private page via
`app/(private)/layout.tsx`. Links `/upload` (Document Intake) and `/curation` (Curation).
Satisfies the single-application requirement of US-086. Has no props and no client-side
state — it is a static Server Component.

Note: `app/layout.tsx` is the outermost shell (`<html>`/`<body>` only). `AppNav` lives in
`app/(private)/layout.tsx` so that future public pages (Phase 2: `/login` etc.) do not
inherit the navigation. Route group folder names are stripped from URLs by Next.js.

#### `DocumentUploadForm` (Client Component)

Responsibility: renders the document upload form and manages all client-side state for the
intake flow. This is the primary interactive component for C1.

Sub-components it composes:

- `FilePickerInput` — file `<input>` element restricted to `accept=".pdf,.tif,.tiff,.jpg,.jpeg,.png"`;
  triggers filename parsing on file selection; emits the selected `File` object to the parent
  form state
- `MetadataFields` — controlled inputs for `date` (type `date`) and `description`
  (type `text`); receives pre-populated values from filename parsing and allows user editing;
  exposes validation state to the parent form
- `ValidationFeedback` — renders per-field error messages derived from Zod client-side
  validation; also surfaces server-side rejection messages returned from the API (duplicate
  detection, server-side format/size rejection)
- `SubmitButton` — disabled while validation errors exist or while a submission is in
  progress; shows a loading state during the API call

State managed inside `DocumentUploadForm`:

- `selectedFile: File | null` — the file chosen by the user
- `date: string` — the date field value (ISO format string or empty)
- `description: string` — the description field value
- `clientErrors: Record<string, string>` — field-level validation errors from Zod
- `serverError: string | null` — top-level rejection message from the API (duplicate,
  server-side format error, network error)
- `submitting: boolean` — tracks in-flight submission state

Props (received from the page):

- `maxFileSizeMb: number` — maximum allowed file size in megabytes; read from frontend config
  at page render time and passed as a prop so the component is testable without config access

#### `UploadSuccessMessage` (Client Component)

Responsibility: displays the submission confirmation on the `/upload/success` page, including
the archive reference derived from the submitted metadata. Receives the document record
returned by the API and renders the description, date, and archive reference.

**Null date display**: if `date` is `null`, display "Undated" in place of the date value.

#### `DuplicateConflictAlert` (Client Component)

Responsibility: displayed inside `ValidationFeedback` when the API returns a duplicate
detection error. Shows the existing record's description, date, and archive reference so the
user understands which document is already in the archive. This gives the user an actionable
response (UR-135).

Props:

- `existingRecord: { description: string; date: string | null; archiveReference: string }` —
  the conflicting document's details as returned by the API

**Null date display**: if `date` is `null`, display "Undated" in place of the date value.

### Data fetching and state

All state for the upload form is local to `DocumentUploadForm`. No server-side data fetching
is required to render the upload page. The page component is a React Server Component that
reads `maxFileSizeMb` from the frontend config at render time (see Configuration section) and
passes it to `DocumentUploadForm` as a prop.

The submission sequence when the user clicks Submit:

1. `DocumentUploadForm` runs the Zod client-side schema against all fields; if errors exist
   it sets `clientErrors` and stops.
2. If validation passes, `submitting` is set to `true` and a `multipart/form-data` POST is
   sent to the Hono route `/api/documents/upload` via `useSWRMutation` / `fetchWrapper`.
3. The Hono route handler delegates to the handler layer, which decomposes the request into
   three Express calls (initiate via DOC-001, upload file bytes via DOC-002, finalize via
   DOC-003) per the composite browser upload contract DOC-004. The browser does not call
   three separate Hono routes.
4. On success (HTTP 201), the page navigates to `/upload/success` with the returned document
   record passed via query parameters or session storage.
5. On a duplicate detection error (HTTP 409), `serverError` is set and `DuplicateConflictAlert`
   is rendered with the existing record data from `response.data.existingRecord`.
6. On any other error (HTTP 400, 422, 5xx), `serverError` is set with the error message from
   the response body.
7. `submitting` is set back to `false` on completion regardless of outcome.

**Note on the four-status upload lifecycle**: The architecture (ADR-007, ADR-017) defines an
`initiated -> uploaded -> stored -> finalized` lifecycle for web UI uploads. Per OQ-001
resolution, the four-status lifecycle is an Express-internal concern. The browser sends a
single `multipart/form-data` POST to the Hono route `/api/documents/upload` (contract
DOC-004). The Hono handler orchestrates the three Express calls (DOC-001, DOC-002, DOC-003)
internally. If any Express step fails, the handler calls the cleanup endpoint
(DOC-005) and returns an appropriate error to the browser.

**Filename parsing** is a pure client-side operation in `FilePickerInput`. On file selection:

1. Parse the filename stem against the pattern `YYYY-MM-DD - short description`.
2. If the pattern matches, attempt to construct a `Date` object from the parsed date parts.
3. If the date is a valid calendar date, pre-populate the `date` field with the ISO string.
4. If the parsed date is not a valid calendar date, leave the `date` field empty with no error
   (UR-006).
5. If the description segment is present and non-empty, pre-populate the `description` field.
6. If the pattern does not match, leave both fields empty.

This logic belongs in a pure utility function (`parseFilename`) in `apps/frontend/src/lib/`
so it can be unit tested independently of the component.

### API calls required

| Call | Method | Hono route | Forwards to | Purpose | Contract |
| --- | --- | --- | --- | --- | --- |
| Browser upload (composite) | `POST` | `/api/documents/upload` | Express DOC-001, DOC-002, DOC-003 internally | Single browser POST; Hono handler orchestrates the three-step Express lifecycle | DOC-004 |
| Cleanup incomplete upload | `DELETE` | `/api/documents/:uploadId` | Express `DELETE /api/documents/:uploadId` | Called by the Hono handler if initiate succeeds but a later step fails | DOC-005 |

The Ky instance in `server/requests/` sets the `x-internal-key` header (ADR-044) on every
call to Express. The browser POST goes to the Hono server only.

### Validation

#### `UploadFormSchema` (client-side Zod schema, `apps/frontend/src/lib/schemas.ts`)

Applied in `DocumentUploadForm` before submission. Fields:

- `file` — must be present; extension must be one of `.pdf`, `.tif`, `.tiff`, `.jpg`, `.jpeg`,
  `.png` (case-insensitive); size must not exceed `maxFileSizeMb` (UR-007, UR-009, UR-031)
- `date` — must be a non-empty string in `YYYY-MM-DD` format and must be a valid calendar date
  (UR-003, UR-004)
- `description` — must be a non-empty, non-whitespace-only string (UR-010)

This schema enforces client-side validation only. Server-side validation is the authoritative
check (UR-004, UR-010). The server may reject a submission that passed client-side validation
(e.g., MIME type mismatch, duplicate hash).

#### `DuplicateResponseSchema` (response validation)

This schema is **imported from `@institutional-knowledge/shared`**
(`packages/shared/src/schemas/documents.ts`) — it must not be redefined in the frontend.
The shared `DuplicateConflictResponse` represents only the `data` payload:
`{ existingRecord: { ... } }`. The `error: 'duplicate_detected'` field belongs to the
envelope, not the payload.

The 409 wire shape is:

```json
{ "error": "duplicate_detected", "data": { "existingRecord": { ... } } }
```

Frontend code must read `response.data.existingRecord`, not `response.existingRecord`.

The `existingRecord` fields include `date: string | null`. The `DuplicateConflictAlert`
component must handle `null` dates explicitly (display "Undated").

All API responses are validated with Zod at the frontend boundary before being used in
component state.

### Testing approach

The C1 intake UI follows the three-tier testing model defined in
`documentation/process/development-principles-frontend.md`. The tiers and their
coverage for this area are:

**Tier 1 — Unit tests** (Vitest, no React Testing Library):

- `parseFilename` utility: conforming filenames, non-conforming filenames, valid calendar
  date, invalid calendar date (should leave date empty, per UR-006), empty string,
  extension-only filenames
- `UploadFormSchema` Zod schema: valid inputs, empty date, invalid date, empty description,
  whitespace-only description, unsupported file extension, oversized file
- `fetchWrapper` utility: mock `window.fetch` to assert `content-type` header and base path
  are set consistently
- `DuplicateConflictAlert` component: RTL with static props — renders description, date, and
  archive reference; renders "Undated" when `date` is `null`
- `FilePickerInput` component: RTL with static props — renders file input, accessibility
- `UploadSuccessMessage` component: RTL with static props — renders description and archive
  reference; renders "Undated" when `date` is `null`

**Tier 2 — Behaviour tests** (Vitest + React Testing Library + MSW):

*UI behaviour — custom hook and form tests*:

- MSW intercepts at the **Hono API route boundary** (e.g. `POST /api/documents/upload`)
- `DocumentUploadForm` hook/state: submitting with empty date shows field error; submitting
  with whitespace-only description shows field error; submitting valid form triggers the
  POST; API 409 response renders `DuplicateConflictAlert` with `response.data.existingRecord`;
  submit button is disabled during submission; server error message shown on 4xx/5xx
- `FilePickerInput` wired with form state: selecting a conforming file pre-populates date
  and description; selecting a non-conforming file leaves fields empty; selecting a file
  with invalid calendar date leaves date empty with no error

*Custom server — route handler tests* (supertest against Hono app):

- MSW intercepts at the **Express boundary** (`http://localhost:4000/api/documents`, etc.)
- `POST /api/documents/upload` route handler: delegates to handler, returns 201 on success,
  propagates 409 with correct envelope on duplicate, propagates error on Express failure

*Custom server — handler tests*:

- Import the composite upload handler directly; mock the request functions
- Three-step orchestration: initiate, upload, finalize in sequence
- Cleanup called on failure of any step after initiate succeeds
- Typed return values on success and each error path

*Custom server — request function tests*:

- Import each request function directly; mock the Ky instance
- Correct URL construction, `x-internal-key` header present, correct body/query params,
  expected error states returned as typed results

**Tier 3 — E2E tests** (Playwright):

- Critical happy path: select file, fill metadata, submit, see success page
- Duplicate detection path: submit duplicate file, see `DuplicateConflictAlert`
- Keep count small; Tier 2 covers the bulk of confidence

---

## Curation UI

### Pages and routes

| Route | Page file | Purpose |
| --- | --- | --- |
| `/curation` | `app/(private)/curation/page.tsx` | Root curation landing page; navigation to sub-sections |
| `/curation/documents` | `app/(private)/curation/documents/page.tsx` | Document curation queue (flagged documents) |
| `/curation/documents/:id` | `app/(private)/curation/documents/[id]/page.tsx` | Individual document detail and metadata edit form |
| `/curation/vocabulary` | `app/(private)/curation/vocabulary/page.tsx` | Vocabulary review queue (LLM candidates) |
| `/curation/vocabulary/new` | `app/(private)/curation/vocabulary/new/page.tsx` | Manual vocabulary term entry form |

The document curation queue and vocabulary review queue are distinct routes and views
(US-079, UR-111). They must never be combined.

The `/curation` root page serves as a navigation hub linking to `/curation/documents` and
`/curation/vocabulary`. It does not display queue data itself.

### Components

#### Layout

- `CurationNav` (Server Component or Client Component) — navigation links between curation
  sections; displayed on all `/curation/*` pages via a shared layout at `app/(private)/curation/layout.tsx`

#### Document curation queue

- `DocumentQueueList` (Client Component) — renders the list of flagged documents; fetches
  queue data on mount via `useSWR`; calls `mutate()` on the SWR key after a flag is cleared
  to re-fetch; displays description, date, flag reason, and submitter identity for each entry
  (US-080, UR-126); ordered by flag timestamp ascending (UR-081)
- `DocumentQueueItem` — a single row or card in the queue list; shows description, date, flag
  reason (full, including failing pages per UR-051, UR-055), and submitter identity; provides a
  "Clear flag" action button and a "Edit metadata" link to `/curation/documents/:id`.
  **Null date display**: if `date` is `null`, display "Undated" in place of the date value.
- `ClearFlagButton` (Client Component) — posts a flag-clear request to the API; on success,
  triggers re-fetch of the queue; displays a loading state during the request; on error,
  displays an inline error message

#### Document metadata edit

- `DocumentMetadataForm` (Client Component) — editable form for document type, date, people,
  organisations, land references, and description (US-082, UR-114); pre-populated from the
  document record fetched via the API; on submit, PATCHes the metadata via the API; does not
  trigger re-embedding (UR-062); displays a success message or error message on completion.
  **Null date display**: the date field is pre-populated from the API response; if `date` is
  `null`, the field is left empty (undated documents are valid). The form must handle a `null`
  initial value without treating it as a validation error on render.
- `MetadataEditFields` — controlled inputs for each editable field; uses the same `date` input
  pattern as the intake form for the date field; description uses a `<textarea>`; document type
  uses a text input (free-text string, per OQ-003 resolution); people, organisations, and land
  references use comma-separated text inputs that the form handler splits into JSON string
  arrays before submission and joins for display (per OQ-002 resolution — stored as PostgreSQL
  `text[]`, transmitted as JSON string arrays)

**OQ-002 resolved**: `people`, `organisations`, and `land_references` are stored as PostgreSQL
`text[]` (text arrays). The Express API accepts and returns them as JSON string arrays. The
frontend renders them as comma-separated text inputs, splitting into arrays on submit and
joining for display.

**OQ-003 resolved**: `document_type` is a free-text string field in Phase 1 (not a controlled
enumeration). The pattern-based metadata extraction step produces a detected document type as
a string; the curator can correct it to any value via the metadata edit form.

#### Vocabulary review queue

- `VocabularyQueueList` (Client Component) — renders the list of pending vocabulary candidates
  (`source: llm_extracted` terms awaiting accept/reject); fetches on mount; ordered by
  step-completion timestamp ascending (UR-090, US-063); each candidate shows term, category,
  confidence score, and the source document description; re-fetches after accept or reject
  to remove the item from the queue
- `VocabularyQueueItem` — a single row in the queue; shows term name, category, confidence
  (numeric), and source document description; provides Accept and Reject action buttons
- `AcceptCandidateButton` (Client Component) — posts an accept request to the API; on success,
  triggers re-fetch; on error, displays an inline error message
- `RejectCandidateButton` (Client Component) — posts a reject request to the API; on success,
  triggers re-fetch; on error, displays an inline error message

#### Manual vocabulary term entry

- `AddVocabularyTermForm` (Client Component) — form for manually entering a new vocabulary
  term (US-062, UR-089); fields: term name (string, required), category (free-text string,
  required), description (string, optional), aliases (multi-value input, string array, optional),
  relationships (multi-value input linking to existing terms via
  `{ targetTermId: string, relationshipType: string }`, optional); on submit, POSTs to the API;
  displays success or error on completion
- `TermRelationshipsInput` — sub-component of `AddVocabularyTermForm`; allows the user to
  specify relationships between the new term and existing vocabulary terms; relationship types
  are free-text strings matching the indicative types from ADR-038 (owned_by, transferred_to,
  witnessed_by, adjacent_to, employed_by, referenced_in, performed_by, succeeded_by)

**OQ-004 resolved**: The vocabulary term schema follows ADR-028. `term` (string, required),
`category` (free-text string, required — not a controlled enumeration in Phase 1),
`description` (string, optional), `aliases` (string array, optional, defaults to empty array),
`relationships` (array of `{ targetTermId: string, relationshipType: string }`, optional —
relationship types are free-text strings per ADR-028/ADR-038).

### Data fetching and state

**Document curation queue** (`/curation/documents`):

Data is fetched client-side on page mount and after mutations. The page uses `useSWR` for
client-side data fetching rather than React Server Component streaming, because the queue must
re-render without full page navigation after flag-clear actions.

Fetch: `GET /api/curation/documents` -> Hono route handler -> Express backend.
After `ClearFlagButton` succeeds: call `mutate()` on the SWR key to re-fetch the queue list.
After `DocumentMetadataForm` save succeeds: display success message; no queue re-fetch needed
(metadata edit does not affect queue membership unless the document was removed).

**Document metadata edit** (`/curation/documents/:id`):

The page component fetches the document record server-side using React Server Component data
fetching (`fetch` in the page component body). The returned data is passed as props to
`DocumentMetadataForm`. On metadata save, the form submits via a client-side PATCH; success
state is local to the form.

**Vocabulary review queue** (`/curation/vocabulary`):

Same pattern as the document queue — `useSWR` for client-side fetch on mount; `mutate()`
after accept/reject to remove the item.

**Manual term entry** (`/curation/vocabulary/new`):

No data fetching on load. The form submits client-side on user action. After a successful
submission, the user is redirected to `/curation/vocabulary` or shown an inline success
message (implementation choice for the Implementer, either is acceptable).

**State management approach**: Local React state only. No global state store (Redux, Zustand,
etc.) is required for Phase 1. The curation UI is used by a single user in a single session
(UR-120). All queue data is fetched fresh on each page load and after each mutation; stale
data is not a concern in this single-user context.

### API calls required

#### Document curation queue

| Call | Method | Hono route | Forwards to | Purpose | Contract |
| --- | --- | --- | --- | --- | --- |
| Fetch document queue | `GET` | `/api/curation/documents` | Express `GET /api/curation/documents` | List all flagged documents, ordered by flag timestamp | DOC-006 |
| Clear a flag | `POST` | `/api/curation/documents/:id/clear-flag` | Express `POST /api/documents/:id/clear-flag` | Clear the flag on a document, marking it ready to resume | DOC-008 |
| Fetch document detail | `GET` | `/api/curation/documents/:id` | Express `GET /api/documents/:id` | Retrieve a single document record for the metadata edit form | DOC-007 |
| Update document metadata | `PATCH` | `/api/curation/documents/:id/metadata` | Express `PATCH /api/documents/:id/metadata` | Save corrected metadata fields | DOC-009 |

#### Vocabulary review queue

| Call | Method | Hono route | Forwards to | Purpose | Contract |
| --- | --- | --- | --- | --- | --- |
| Fetch vocabulary queue | `GET` | `/api/curation/vocabulary` | Express `GET /api/curation/vocabulary` | List pending vocabulary candidates | VOC-001 |
| Accept a candidate | `POST` | `/api/curation/vocabulary/:termId/accept` | Express `POST /api/curation/vocabulary/:termId/accept` | Accept a candidate term into the vocabulary | VOC-002 |
| Reject a candidate | `POST` | `/api/curation/vocabulary/:termId/reject` | Express `POST /api/curation/vocabulary/:termId/reject` | Reject a candidate term (adds to rejected list) | VOC-003 |
| Add a manual term | `POST` | `/api/curation/vocabulary/terms` | Express `POST /api/curation/vocabulary/terms` | Create a new vocabulary term manually | VOC-004 |

The Ky instance in `server/requests/` sets the `x-internal-key` header on every call to
Express (ADR-044). The browser never sees or sends this header.

### Validation

#### `MetadataEditSchema` (Zod schema, `apps/frontend/src/lib/schemas.ts`)

Applied in `DocumentMetadataForm` before the PATCH call:

- `date` — if provided, must be a valid calendar date in `YYYY-MM-DD` format; may be empty
  (undated documents are valid)
- `description` — must be a non-empty, non-whitespace-only string
- `documentType` — free-text string; any non-empty value is valid (per OQ-003 resolution)
- `people` — JSON string array (`string[]`); each element must be a non-empty string; the form
  handler splits a comma-separated text input into the array before submission (per OQ-002
  resolution)
- `organisations` — JSON string array (`string[]`); each element must be a non-empty string;
  same comma-separated input pattern as `people` (per DOC-007/DOC-009 contract)
- `landReferences` — JSON string array (`string[]`); each element must be a non-empty string;
  same comma-separated input pattern as `people` (per OQ-002 resolution)

`MetadataEditSchema` is derived from the shared `UpdateDocumentMetadataRequest` schema
imported from `@institutional-knowledge/shared`. It may extend the shared shape with
frontend-specific transformation rules (e.g. comma-separated string splitting). It must not
redefine the shared fields independently.

#### `AddTermSchema` (Zod schema, `apps/frontend/src/lib/schemas.ts`)

Applied in `AddVocabularyTermForm` before the POST call (per OQ-004 resolution):

- `term` — string, required; must be non-empty
- `category` — string, required; free-text (not an enumeration in Phase 1)
- `description` — string, optional
- `aliases` — array of strings, optional (defaults to empty array)
- `relationships` — array of `{ targetTermId: z.uuid(), relationshipType: string }`, optional;
  relationship types are free-text strings. Use `z.uuid()` (Zod v4 form) — not
  `z.string().uuid()`.

`AddTermSchema` is derived from the shared `AddVocabularyTermRequest` schema imported from
`@institutional-knowledge/shared`.

#### API response validation

All API responses consumed by the curation UI are **imported from `@institutional-knowledge/shared`**
and must not be redefined in the frontend. The response schemas for DOC-006, DOC-007, DOC-008,
DOC-009, VOC-001, VOC-002, VOC-003, and VOC-004 are all defined in the shared package.

The `src/lib/schemas.ts` file contains only `UploadFormSchema`, `MetadataEditSchema`, and
`AddTermSchema` — the three frontend form validation schemas. A comment at the top of the
file notes that all response schemas are imported from `@institutional-knowledge/shared`.

### Testing approach

The curation UI follows the three-tier testing model defined in
`documentation/process/development-principles-frontend.md`. The tiers and their
coverage for this area are:

**Tier 1 — Unit tests** (Vitest, no React Testing Library):

- Pure utility functions: flag timestamp sort order, queue item display formatting
- `MetadataEditSchema` Zod schema: valid inputs, empty description, missing required fields,
  comma-separated array parsing
- `AddTermSchema` Zod schema: valid inputs, missing required fields, UUID validation via
  `z.uuid()` for `targetTermId`
- Presentational component tests (RTL, static props):
  - `DocumentQueueItem`: renders description, date, flag reason, submitter identity; renders
    "Undated" when `date` is `null`
  - `VocabularyQueueItem`: renders term, category, confidence, source document description
  - `ClearFlagButton`, `AcceptCandidateButton`, `RejectCandidateButton`: rendering and
    accessibility in default state

**Tier 2 — Behaviour tests** (Vitest + React Testing Library + MSW):

*UI behaviour — custom hook tests*:

- MSW intercepts at the **Hono API route boundary**
  (e.g. `/api/curation/documents`, `/api/curation/vocabulary`)
- `DocumentQueueList` hook: fetches on mount; shows empty state when queue is empty; shows
  error state with retry on fetch failure
- `ClearFlagButton` hook: shows loading state during request; triggers queue re-fetch on
  success via `mutate()`; shows inline error on API failure
- `DocumentMetadataForm` hook: pre-populates fields from document record prop; rejects empty
  description on submit; shows success message on save; shows error on API failure; handles
  `null` initial date without treating it as a validation error
- `VocabularyQueueList` hook: fetches on mount; shows empty state; re-fetches after accept
  or reject
- `AcceptCandidateButton` and `RejectCandidateButton` hooks: loading state; success removes
  item via `mutate()`; error shown inline
- `AddVocabularyTermForm` hook: submits form data to API; shows validation errors for required
  fields; shows success on completion

*Custom server — route handler tests* (supertest against Hono app):

- MSW intercepts at the **Express boundary** (`http://localhost:4000/api/curation/*`, etc.)
- Each curation Hono route handler: correct status propagation, error propagation from Express

*Custom server — handler and request function tests*:

- Same pattern as C1: import handlers directly, mock request functions; import request
  functions directly, mock the Ky instance

**Tier 3 — E2E tests** (Playwright):

- Critical happy path: view document queue, clear a flag, verify item removed
- Metadata edit: open document detail, edit description, save, verify success
- Vocabulary queue: accept candidate, verify removed; reject candidate, verify removed
- Keep count small

---

## Cross-cutting concerns

### Configuration

The Hono custom server reads its own scoped configuration file at startup via `nconf`. It does
not read the Express or Python configuration files. The configuration follows the pattern
defined in the configuration-patterns skill: a base `config.json5` in `apps/frontend/` built
into the Docker image, and an optional `config.override.json5` volume-mounted at runtime.

**nconf keys required by the frontend**:

| Key | Type | Purpose | Example value |
| --- | --- | --- | --- |
| `server.port` | `number` | Port the Hono custom server listens on | `3000` |
| `express.baseUrl` | `string` | Internal URL of the Express backend | `http://backend:4000` |
| `express.internalKey` | `string` | Shared key for Hono -> Express calls (ADR-044) | `change-me-in-production` |
| `upload.maxFileSizeMb` | `number` | Maximum file size accepted at the client boundary | `50` |
| `upload.acceptedExtensions` | `string[]` | Accepted file extensions for the file picker and client-side validation | `[".pdf", ".tif", ".tiff", ".jpg", ".jpeg", ".png"]` |

The `express.internalKey` must never be sent to the browser. It is set once on the
pre-configured Ky instance in `server/requests/` and is used only by the request functions
layer (server-side code). The browser submits to Hono routes only; the internal key is
added server-side within the request functions.

**Config class pattern**: A `Config` class in `apps/frontend/server/config/index.ts` loads
and validates the merged configuration using nconf and Zod at startup (fail-fast on invalid
config). The validated config singleton is imported by Hono route handlers, handlers, and
request functions. It must never be imported into Client Components, because Client Component
code is bundled into the browser.

**OQ-005 deferred to Phase 2**: The C3 query proxy infrastructure (ADR-045) is not scaffolded
in Phase 1. No `python.baseUrl` or `python.internalKey` config keys are required. If the web
UI query page is delivered in Phase 2, these keys will be added at that time.

### Authentication

Phase 1 has no user authentication (UR-121, ADR-044). The Hono custom server performs no
auth checks on incoming browser requests. The auth middleware is wired as a no-op in Phase 1
so that it is in place when Phase 2 requires it.

The shared-key header (`x-internal-key`) is applied to all outbound calls from the Hono
custom server to Express and (in future phases) to the Python service (ADR-044). This header
is set by the pre-configured Ky instance in `server/requests/` — not per-call in route
handlers, and never by browser-side code.

All request functions in `server/requests/` use the pre-configured Ky instance. The Ky
instance sets `express.baseUrl` and `x-internal-key` once, so the header injection cannot
be accidentally omitted from individual request functions.

### Error handling

**Client-side validation errors**: Displayed inline per field via `ValidationFeedback` or
`MetadataEditFields`. The submit button remains enabled until the user corrects the error,
at which point re-validation runs.

**Server-side rejection (4xx)**: The API returns a structured error body. The frontend
displays the server error message inline. Specifically:

- HTTP 409 (duplicate): renders `DuplicateConflictAlert` with `response.data.existingRecord`
- HTTP 400 / 422 (validation failure): displays the field-level or top-level error message
  from the response body; must be actionable (UR-135)
- HTTP 413 (file too large, if the server enforces a lower limit than the client): displays
  a size error message

**Server-side errors (5xx)**: Display a generic message: "Something went wrong. Please try
again." Do not expose internal server details. Log the error using Pino (server-side logger
in Hono route handlers).

**Network errors (fetch failure)**: Display a message indicating that the server could not
be reached. Provide a retry option where appropriate.

**Queue fetch failures** (curation pages): If the initial data fetch fails, display an error
state with a retry button rather than an empty queue, to distinguish "no items" from "failed
to load".

**Pino logging**: The Hono custom server and route handlers log using Pino. Log levels:

- `info`: successful submissions, flag clears, term actions
- `warn`: client-side validation bypass attempts (submission that passed client but failed
  server), unexpected 4xx responses
- `error`: 5xx responses from Express, network failures, config validation failures at startup

Pino is a server-side dependency only. It must not be bundled into Client Components.

### Dependency injection

The frontend has two distinct sub-systems, each with its own composition pattern:

**Custom server** (`server/`):

- A `Config` singleton (validated at startup) is imported by server-side code only.
- A **pre-configured Ky instance** in `server/requests/` sets `express.baseUrl` and the
  `x-internal-key` header once. All request functions use this shared instance rather than
  constructing HTTP calls directly. This is the single point where the internal key is
  injected — centralising it ensures consistent auth and makes request functions testable
  by mocking the Ky instance.
- Request functions are imported by handlers; handlers are imported by route handlers.
  Route handlers are thin: parse request, call handler, shape response. Business logic
  does not appear in route handlers.

**UI** (`src/`):

- Client Components receive data as props from Server Components (for initial render) or
  via client-side fetch through the Hono API routes (for mutations and re-fetches).
- `useSWR` and `useSWRMutation` are called only within custom hook files — never directly
  in components. Hooks call through `fetchWrapper`, not directly through any HTTP client.
  `fetchWrapper` is a thin project utility function in `src/lib/fetchWrapper.ts`.
- The SWR key for each queue is the Hono route path (e.g. `/api/curation/documents`).
  After mutations, the relevant SWR key is invalidated via `mutate()` to trigger a re-fetch.

---

## Open questions

| ID | Question | Status | Resolution |
| --- | --- | --- | --- |
| OQ-001 | Does the browser call three separate Hono routes (initiate, upload, finalize) or a single route that the Hono handler decomposes internally? | Resolved | Single browser POST to `/api/documents/upload` (DOC-004); Hono handler orchestrates three Express calls internally (DOC-001, DOC-002, DOC-003). |
| OQ-002 | What is the storage shape for `people` and `land references` metadata fields? | Resolved | PostgreSQL `text[]` arrays; Express API accepts/returns JSON string arrays; frontend uses comma-separated text inputs. |
| OQ-003 | What is the valid set of values for `documentType`? | Resolved | Free-text string in Phase 1; not a controlled enumeration. |
| OQ-004 | What is the exact schema for a vocabulary term? | Resolved | Per ADR-028: term (string, required), category (free-text string, required), description (string, optional), aliases (string array, optional), relationships (array of `{ targetTermId, relationshipType }`, optional; types are free-text strings). |
| OQ-005 | Should the C3 query proxy infrastructure (ADR-045) be scaffolded in Phase 1? | Deferred to Phase 2 | No Phase 1 action required. Config keys `python.baseUrl` and `python.internalKey` will be added when the web UI query page is delivered. |

---

## Handoff checklist

- [x] Integration Lead has reviewed all flagged API calls (all 12 calls listed in this plan)
- [x] OQ-001 resolved: single browser POST; Hono handler orchestrates Express lifecycle internally
- [x] OQ-002 resolved: `people` and `land_references` are PostgreSQL `text[]`, JSON string arrays
- [x] OQ-003 resolved: `document_type` is a free-text string in Phase 1
- [x] OQ-004 resolved: vocabulary term schema per ADR-028; category and relationship types are free-text strings
- [x] OQ-005 deferred to Phase 2; no Phase 1 action required
- [x] Developer has approved this plan (2026-03-03)
- [x] Plan revised 2026-03-23: Hono custom server architecture, three-tier testing model,
  framework agnosticism constraints, corrected `DuplicateConflictResponse` wire shape,
  nullable `date` fields, response schemas imported from shared package

---

## User story coverage

This section maps each in-scope Phase 1 user story to the plan components that address it.

| Story | Coverage |
| --- | --- |
| US-001 (upload via web form) | `DocumentUploadForm`, `/upload` page, API call: DOC-004 (composite browser upload) |
| US-002 (date and description at intake) | `MetadataFields` inside `DocumentUploadForm` |
| US-003 (reject invalid date) | `UploadFormSchema` (client), server-side rejection handling in `ValidationFeedback` |
| US-003b (reject empty description) | `UploadFormSchema` (client), server-side rejection handling in `ValidationFeedback` |
| US-004 (pre-populate from filename) | `parseFilename` utility, `FilePickerInput` |
| US-005 (restrict and validate file format) | `FilePickerInput` `accept` attribute, `UploadFormSchema` extension check, `DuplicateConflictAlert` / `ValidationFeedback` for server-side rejection |
| US-006 (upload atomicity) | Handled by the composite upload (DOC-004); atomicity is an Express concern; the frontend displays the error state if any step fails |
| US-078 (minimal curation web UI) | `/curation` pages, `DocumentQueueList`, `VocabularyQueueList`, `ClearFlagButton`, `DocumentMetadataForm` |
| US-079 (distinct queue views) | `/curation/documents` and `/curation/vocabulary` are separate pages and components; `CurationNav` links to both |
| US-080 (view document curation queue) | `DocumentQueueList`, `DocumentQueueItem` |
| US-081 (clear a flag) | `ClearFlagButton`, API call: DOC-008 |
| US-082 (correct metadata) | `DocumentMetadataForm`, `/curation/documents/:id` page, API call: DOC-009 |
| US-083 (no in-app document removal) | No delete/remove UI component exists anywhere in this plan |
| US-086 (single web application) | All pages under a single Next.js application; `AppNav` in `app/(private)/layout.tsx` links `/upload` and `/curation`; `CurationNav` links within curation |
| US-087 (single session) | No concurrent session handling required; acknowledged limitation per requirement |
| US-062 (add vocabulary terms manually) | `AddVocabularyTermForm`, `/curation/vocabulary/new` page, API call: VOC-004 |
| US-063 (surface candidates in review queue) | `VocabularyQueueList` — displays candidates from API |
| US-066 (accept or reject a candidate) | `AcceptCandidateButton`, `RejectCandidateButton`, API calls: VOC-002, VOC-003 |
