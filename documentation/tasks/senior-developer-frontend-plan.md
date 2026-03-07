# Senior Developer Plan — Frontend Service

## Status

Approved — 2026-03-03

---

## Integration Lead contracts notice

All 12 API calls in this plan have been matched to approved contracts in
`documentation/tasks/integration-lead-contracts.md` (Approved 2026-03-03). Open questions
OQ-001 through OQ-004 are resolved. Implementation may proceed.

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
status or report download. The
Next.js custom server requirement (ADR-044) is in scope as a structural concern; the C3 query
proxy path (ADR-045) is noted as a server-side concern but not planned here because no Phase 1
query UI is delivered.

---

## C1 — Document Intake UI

### Pages and routes

| Route | Page file | Purpose |
| --- | --- | --- |
| `/` | `app/page.tsx` | Root redirect to `/upload` |
| `/upload` | `app/upload/page.tsx` | Single document upload form |
| `/upload/success` | `app/upload/success/page.tsx` | Confirmation after a successful submission |

The application uses the Next.js App Router. All pages are React Server Components by default;
interactive components (form, file picker, validation feedback) are Client Components
(`"use client"`). The root page at `/` redirects to `/upload` so that the application opens
directly on the intake form.

### Components

All components live in `apps/frontend/src/components/`. Shared layout primitives (navigation
header, page shell) live in `apps/frontend/src/components/layout/`.

#### `AppNav` (Server Component)

Responsibility: top-level application navigation header rendered on every page via
`app/layout.tsx`. Links `/upload` (Document Intake) and `/curation` (Curation). Satisfies
the single-application requirement of US-086. Has no props and no client-side state — it is
a static Server Component.

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

#### `DuplicateConflictAlert` (Client Component)

Responsibility: displayed inside `ValidationFeedback` when the API returns a duplicate
detection error. Shows the existing record's description, date, and archive reference so the
user understands which document is already in the archive. This gives the user an actionable
response (UR-135).

Props:

- `existingRecord: { description: string; date: string; archiveReference: string }` — the
  conflicting document's details as returned by the API

### Data fetching and state

All state for the upload form is local to `DocumentUploadForm`. No server-side data fetching
is required to render the upload page. The page component is a React Server Component that
reads `maxFileSizeMb` from the frontend config at render time (see Configuration section) and
passes it to `DocumentUploadForm` as a prop.

The submission sequence when the user clicks Submit:

1. `DocumentUploadForm` runs the Zod client-side schema against all fields; if errors exist
   it sets `clientErrors` and stops.
2. If validation passes, `submitting` is set to `true` and a `multipart/form-data` POST is
   sent to the Next.js API route `/api/documents/upload`.
3. The Next.js API route handler decomposes this into the three Express calls internally
   (initiate via DOC-001, upload file bytes via DOC-002, finalize via DOC-003) per the
   composite browser upload contract DOC-004. The browser does not call three separate
   Next.js routes.
4. On success (HTTP 201), the page navigates to `/upload/success` with the returned document
   record passed via query parameters or session storage.
5. On a duplicate detection error (HTTP 409), `serverError` is set and `DuplicateConflictAlert`
   is rendered with the existing record data from the response body.
6. On any other error (HTTP 400, 422, 5xx), `serverError` is set with the error message from
   the response body.
7. `submitting` is set back to `false` on completion regardless of outcome.

**Note on the four-status upload lifecycle**: The architecture (ADR-007, ADR-017) defines an
`initiated -> uploaded -> stored -> finalized` lifecycle for web UI uploads. Per OQ-001
resolution, the four-status lifecycle is an Express-internal concern. The browser sends a
single `multipart/form-data` POST to the Next.js API route `/api/documents/upload` (contract
DOC-004). The Next.js handler orchestrates the three Express calls (DOC-001, DOC-002, DOC-003)
internally. If any Express step fails, the Next.js handler calls the cleanup endpoint
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

| Call | Method | Next.js route | Forwards to | Purpose | Contract |
| --- | --- | --- | --- | --- | --- |
| Browser upload (composite) | `POST` | `/api/documents/upload` | Express DOC-001, DOC-002, DOC-003 internally | Single browser POST; Next.js orchestrates the three-step Express lifecycle | DOC-004 |
| Cleanup incomplete upload | `DELETE` | `/api/documents/:uploadId` | Express `DELETE /api/documents/:uploadId` | Called by the Next.js handler if initiate succeeds but a later step fails | DOC-005 |

The Next.js API route handler adds the `x-internal-key` header (ADR-044) before each Express
call. The browser POST goes to the Next.js server only.

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

#### `DuplicateResponseSchema` (response validation Zod schema)

Applied when the API returns HTTP 409. Validates the shape of the existing record payload
before it is rendered in `DuplicateConflictAlert`:

- `existingRecord.description: string`
- `existingRecord.date: string`
- `existingRecord.archiveReference: string`

All API responses are validated with Zod at the frontend boundary before being used in
component state.

### Testing approach

**Unit tests** (Vitest, no React Testing Library):

- `parseFilename` utility: conforming filenames, non-conforming filenames, valid calendar date,
  invalid calendar date (should leave date empty, per UR-006), empty string, extension-only
  filenames
- `UploadFormSchema` Zod schema: valid inputs, empty date, invalid date, empty description,
  whitespace-only description, unsupported file extension, oversized file

**Component tests** (Vitest + React Testing Library):

- `FilePickerInput`: selecting a conforming file pre-populates date and description; selecting
  a non-conforming file leaves fields empty; selecting a file with invalid calendar date leaves
  date empty with no error
- `DocumentUploadForm`: submitting with empty date shows field error; submitting with
  whitespace-only description shows field error; submitting valid form calls the API; API 409
  response renders `DuplicateConflictAlert`; submit button is disabled during submission;
  server error message is shown on 4xx/5xx responses
- `DuplicateConflictAlert`: renders description, date, and archive reference from props

Integration tests use Mock Service Worker (MSW) to mock the Next.js API routes. No test
database is needed for frontend tests (per pipeline-testing-strategy skill).

---

## Curation UI

### Pages and routes

| Route | Page file | Purpose |
| --- | --- | --- |
| `/curation` | `app/curation/page.tsx` | Root curation landing page; navigation to sub-sections |
| `/curation/documents` | `app/curation/documents/page.tsx` | Document curation queue (flagged documents) |
| `/curation/documents/:id` | `app/curation/documents/[id]/page.tsx` | Individual document detail and metadata edit form |
| `/curation/vocabulary` | `app/curation/vocabulary/page.tsx` | Vocabulary review queue (LLM candidates) |
| `/curation/vocabulary/new` | `app/curation/vocabulary/new/page.tsx` | Manual vocabulary term entry form |

The document curation queue and vocabulary review queue are distinct routes and views
(US-079, UR-111). They must never be combined.

The `/curation` root page serves as a navigation hub linking to `/curation/documents` and
`/curation/vocabulary`. It does not display queue data itself.

### Components

#### Layout

- `CurationNav` (Server Component or Client Component) — navigation links between curation
  sections; displayed on all `/curation/*` pages via a shared layout at `app/curation/layout.tsx`

#### Document curation queue

- `DocumentQueueList` (Client Component) — renders the list of flagged documents; fetches
  queue data on mount via `useSWR`; calls `mutate()` on the SWR key after a flag is cleared
  to re-fetch; displays description, date, flag reason, and submitter identity for each entry
  (US-080, UR-126); ordered by flag timestamp ascending (UR-081)
- `DocumentQueueItem` — a single row or card in the queue list; shows description, date, flag
  reason (full, including failing pages per UR-051, UR-055), and submitter identity; provides a
  "Clear flag" action button and a "Edit metadata" link to `/curation/documents/:id`
- `ClearFlagButton` (Client Component) — posts a flag-clear request to the API; on success,
  triggers re-fetch of the queue; displays a loading state during the request; on error,
  displays an inline error message

#### Document metadata edit

- `DocumentMetadataForm` (Client Component) — editable form for document type, date, people,
  organisations, land references, and description (US-082, UR-114); pre-populated from the
  document record fetched via the API; on submit, PATCHes the metadata via the API; does not
  trigger re-embedding (UR-062); displays a success message or error message on completion
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

Fetch: `GET /api/curation/documents` -> Next.js API route -> Express backend.
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

| Call | Method | Next.js route | Forwards to | Purpose | Contract |
| --- | --- | --- | --- | --- | --- |
| Fetch document queue | `GET` | `/api/curation/documents` | Express `GET /api/curation/documents` | List all flagged documents, ordered by flag timestamp | DOC-006 |
| Clear a flag | `POST` | `/api/curation/documents/:id/clear-flag` | Express `POST /api/documents/:id/clear-flag` | Clear the flag on a document, marking it ready to resume | DOC-008 |
| Fetch document detail | `GET` | `/api/curation/documents/:id` | Express `GET /api/documents/:id` | Retrieve a single document record for the metadata edit form | DOC-007 |
| Update document metadata | `PATCH` | `/api/curation/documents/:id/metadata` | Express `PATCH /api/documents/:id/metadata` | Save corrected metadata fields | DOC-009 |

#### Vocabulary review queue

| Call | Method | Next.js route | Forwards to | Purpose | Contract |
| --- | --- | --- | --- | --- | --- |
| Fetch vocabulary queue | `GET` | `/api/curation/vocabulary` | Express `GET /api/curation/vocabulary` | List pending vocabulary candidates | VOC-001 |
| Accept a candidate | `POST` | `/api/curation/vocabulary/:termId/accept` | Express `POST /api/curation/vocabulary/:termId/accept` | Accept a candidate term into the vocabulary | VOC-002 |
| Reject a candidate | `POST` | `/api/curation/vocabulary/:termId/reject` | Express `POST /api/curation/vocabulary/:termId/reject` | Reject a candidate term (adds to rejected list) | VOC-003 |
| Add a manual term | `POST` | `/api/curation/vocabulary/terms` | Express `POST /api/curation/vocabulary/terms` | Create a new vocabulary term manually | VOC-004 |

All API route handlers in `apps/frontend/src/app/api/` add the `x-internal-key` header before
forwarding to Express (ADR-044). The browser never sees or sends this header.

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

#### `AddTermSchema` (Zod schema)

Applied in `AddVocabularyTermForm` before the POST call (per OQ-004 resolution):

- `term` — string, required; must be non-empty
- `category` — string, required; free-text (not an enumeration in Phase 1)
- `description` — string, optional
- `aliases` — array of strings, optional (defaults to empty array)
- `relationships` — array of `{ targetTermId: string, relationshipType: string }`, optional;
  relationship types are free-text strings

#### API response validation

All API responses consumed by the curation UI are validated with Zod schemas at the frontend
boundary before being stored in component state or rendered. Response schemas match the
TypeScript interfaces defined in the approved contracts (DOC-006, DOC-007, DOC-008, DOC-009,
VOC-001, VOC-002, VOC-003, VOC-004).

### Testing approach

**Unit tests** (Vitest):

- Any pure utility functions derived from curation business rules (e.g., flag timestamp sort
  order, queue item display formatting)

**Component tests** (Vitest + React Testing Library):

- `DocumentQueueList`: renders flagged documents from a mocked API response; shows description,
  date, flag reason, submitter identity; shows empty state when queue is empty
- `ClearFlagButton`: shows loading state during request; removes item from list on success;
  shows inline error on API failure
- `DocumentMetadataForm`: pre-populates fields from document record prop; rejects empty
  description on submit; shows success message on save; shows error message on API failure
- `VocabularyQueueList`: renders candidates with term, category, confidence, source document;
  shows empty state
- `AcceptCandidateButton` and `RejectCandidateButton`: loading state; success removes item;
  error shown inline
- `AddVocabularyTermForm`: submits form data to API; shows validation errors for required
  fields; shows success on completion

Integration tests use MSW to mock the Next.js API routes.

---

## Cross-cutting concerns

### Configuration

The Next.js frontend reads its own scoped configuration file at startup via `nconf`. It does
not read the Express or Python configuration files. The configuration follows the pattern
defined in the configuration-patterns skill: a base `config.json5` in `apps/frontend/` built
into the Docker image, and an optional `config.override.json5` volume-mounted at runtime.

**nconf keys required by the frontend**:

| Key | Type | Purpose | Example value |
| --- | --- | --- | --- |
| `server.port` | `number` | Port the Next.js custom server listens on | `3000` |
| `express.baseUrl` | `string` | Internal URL of the Express backend | `http://backend:4000` |
| `express.internalKey` | `string` | Shared key for Next.js -> Express calls (ADR-044) | `change-me-in-production` |
| `upload.maxFileSizeMb` | `number` | Maximum file size accepted at the client boundary | `50` |
| `upload.acceptedExtensions` | `string[]` | Accepted file extensions for the file picker and client-side validation | `[".pdf", ".tif", ".tiff", ".jpg", ".jpeg", ".png"]` |

The `express.internalKey` must never be sent to the browser. It is used only in Next.js API
route handlers (server-side code). The browser submits to Next.js API routes only; the
internal key is added server-side.

**Config class pattern**: A `Config` class in `apps/frontend/src/config/index.ts` loads and
validates the merged configuration using nconf and Zod at startup (fail-fast on invalid
config). The validated config singleton is imported by API route handlers and Server
Components. It must never be imported into Client Components, because Client Component code
is bundled into the browser.

**OQ-005 deferred to Phase 2**: The C3 query proxy infrastructure (ADR-045) is not scaffolded
in Phase 1. No `python.baseUrl` or `python.internalKey` config keys are required. If the web
UI query page is delivered in Phase 2, these keys will be added at that time.

### Authentication

Phase 1 has no user authentication (UR-121, ADR-044). The Next.js custom server performs no
auth checks on incoming browser requests.

The shared-key header (`x-internal-key`) is applied to all outbound calls from the Next.js
server to Express and (in future phases) to the Python service (ADR-044). This header is set
in Next.js API route handlers, not by the browser.

All Next.js API route handlers must include a step to attach the `x-internal-key` header
before forwarding to Express. This must be enforced consistently — every API route handler
must include it. A shared helper function in `apps/frontend/src/lib/apiClient.ts` should
centralise the header injection so that it cannot be accidentally omitted.

### Error handling

**Client-side validation errors**: Displayed inline per field via `ValidationFeedback` or
`MetadataEditFields`. The submit button remains enabled until the user corrects the error,
at which point re-validation runs.

**Server-side rejection (4xx)**: The API returns a structured error body. The frontend
displays the server error message inline. Specifically:

- HTTP 409 (duplicate): renders `DuplicateConflictAlert` with the existing record details
- HTTP 400 / 422 (validation failure): displays the field-level or top-level error message
  from the response body; must be actionable (UR-135)
- HTTP 413 (file too large, if the server enforces a lower limit than the client): displays
  a size error message

**Server-side errors (5xx)**: Display a generic message: "Something went wrong. Please try
again." Do not expose internal server details. Log the error using Pino (server-side logger
in API route handlers).

**Network errors (fetch failure)**: Display a message indicating that the server could not
be reached. Provide a retry option where appropriate.

**Queue fetch failures** (curation pages): If the initial data fetch fails, display an error
state with a retry button rather than an empty queue, to distinguish "no items" from "failed
to load".

**Pino logging**: The Next.js custom server and API route handlers log using Pino. Log levels:

- `info`: successful submissions, flag clears, term actions
- `warn`: client-side validation bypass attempts (submission that passed client but failed
  server), unexpected 4xx responses
- `error`: 5xx responses from Express, network failures, config validation failures at startup

Pino is a server-side dependency only. It must not be bundled into Client Components.

### Dependency injection

The Next.js frontend does not have the same service layer complexity as the Express backend.
The composition pattern is simpler:

- A `Config` singleton (validated at startup) is imported by server-side code only.
- An `apiClient` helper in `apps/frontend/src/lib/apiClient.ts` wraps `fetch` with the
  `x-internal-key` header and base URL from config. All API route handlers use this helper
  rather than calling `fetch` directly.
- API route handlers are thin: they parse the incoming request, call `apiClient`, and return
  the response. Business logic is not placed in API route handlers.
- Client Components receive data as props from Server Components (for initial render) or via
  client-side fetch through the Next.js API routes (for mutations and re-fetches).

The `apiClient` helper is the single point where the internal key is injected. Centralising
it here ensures consistent auth on every internal call and makes it easy to test API route
handlers by mocking `apiClient`.

`useSWR` (`swr` package) is used for client-side queue data fetching in the curation UI.
The SWR key for each queue is the Next.js API route path (e.g. `/api/curation/documents`).
After mutations (`ClearFlagButton`, `AcceptCandidateButton`, `RejectCandidateButton`), the
relevant SWR key is invalidated via `mutate()` to trigger a re-fetch.

---

## Open questions

| ID | Question | Status | Resolution |
| --- | --- | --- | --- |
| OQ-001 | Does the browser call three separate Next.js API routes (initiate, upload, finalize) or a single route that Next.js decomposes internally? | Resolved | Single browser POST to `/api/documents/upload` (DOC-004); Next.js orchestrates three Express calls internally (DOC-001, DOC-002, DOC-003). |
| OQ-002 | What is the storage shape for `people` and `land references` metadata fields? | Resolved | PostgreSQL `text[]` arrays; Express API accepts/returns JSON string arrays; frontend uses comma-separated text inputs. |
| OQ-003 | What is the valid set of values for `documentType`? | Resolved | Free-text string in Phase 1; not a controlled enumeration. |
| OQ-004 | What is the exact schema for a vocabulary term? | Resolved | Per ADR-028: term (string, required), category (free-text string, required), description (string, optional), aliases (string array, optional), relationships (array of `{ targetTermId, relationshipType }`, optional; types are free-text strings). |
| OQ-005 | Should the C3 query proxy infrastructure (ADR-045) be scaffolded in Phase 1? | Deferred to Phase 2 | No Phase 1 action required. Config keys `python.baseUrl` and `python.internalKey` will be added when the web UI query page is delivered. |

---

## Handoff checklist

- [x] Integration Lead has reviewed all flagged API calls (all 12 calls listed in this plan)
- [x] OQ-001 resolved: single browser POST; Next.js orchestrates Express lifecycle internally
- [x] OQ-002 resolved: `people` and `land_references` are PostgreSQL `text[]`, JSON string arrays
- [x] OQ-003 resolved: `document_type` is a free-text string in Phase 1
- [x] OQ-004 resolved: vocabulary term schema per ADR-028; category and relationship types are free-text strings
- [x] OQ-005 deferred to Phase 2; no Phase 1 action required
- [x] Developer has approved this plan

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
| US-086 (single web application) | All pages under a single Next.js application; `AppNav` in `app/layout.tsx` links `/upload` and `/curation`; `CurationNav` links within curation |
| US-087 (single session) | No concurrent session handling required; acknowledged limitation per requirement |
| US-062 (add vocabulary terms manually) | `AddVocabularyTermForm`, `/curation/vocabulary/new` page, API call: VOC-004 |
| US-063 (surface candidates in review queue) | `VocabularyQueueList` — displays candidates from API |
| US-066 (accept or reject a candidate) | `AcceptCandidateButton`, `RejectCandidateButton`, API calls: VOC-002, VOC-003 |
