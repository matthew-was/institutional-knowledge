# Task List — Frontend Service

## Status

Draft — 2026-03-04

## Source plan

`documentation/tasks/senior-developer-frontend-plan.md` (Approved 2026-03-03)

## Flagged issues

None. All open questions (OQ-001 to OQ-004) are resolved in the approved plan. OQ-005
(C3 query proxy) is deferred to Phase 2 and requires no Phase 1 action.

---

## Tasks

### Task 1: Next.js project scaffolding and custom server setup

**Description**: Create the `apps/frontend/` directory and initialise a Next.js application
using the App Router. The project must use TypeScript. Biome must be configured for
linting and formatting (ADR-046). The custom Next.js server file (`server.ts`) must be
created at the root of `apps/frontend/` — this is required by ADR-044. The custom server
wraps Next.js and must be the entry point (i.e. `node server.ts` or equivalent, not
`next start`). Configure the `package.json` scripts (`dev`, `build`, `start`) to use
the custom server. Add `swr` as a production dependency for client-side data fetching
in the curation UI. Add `pino` as a production dependency for server-side logging. The
project must sit within the pnpm monorepo workspace defined at the repository root.
Do not configure any application routes, components, or API routes in this task — only
the project skeleton, tooling, and server entry point.

**Depends on**: none

**Complexity**: S

**Acceptance condition**: Running `pnpm dev` (or equivalent) from `apps/frontend/` starts
the Next.js custom server without errors. A Biome config file exists in `apps/frontend/`
and `pnpm biome check` passes on the scaffolded files. The `server.ts` file exists and is
the entry point for `start` and `dev` scripts. Confirmed by a developer running these
commands locally.

**Condition type**: manual

**Status**: not_started

---

### Task 2: Frontend configuration module

**Description**: Create the `Config` class in `apps/frontend/src/config/index.ts`. This
class loads and validates the merged nconf configuration at startup using nconf and Zod.
It must fail fast on invalid or missing configuration (i.e. throw at startup, not at
first use). The validated config singleton must be importable by server-side code
(API route handlers and Server Components). It must never be imported into Client
Components; this is an architectural constraint, not enforced at runtime but must be
documented in a comment.

The following nconf keys must be defined and validated:

- `server.port` — `number`, required
- `express.baseUrl` — `string`, required
- `express.internalKey` — `string`, required
- `upload.maxFileSizeMb` — `number`, required, must be positive
- `upload.acceptedExtensions` — `string[]`, required, must be non-empty

Create `apps/frontend/config.json` with sensible development defaults:
`server.port: 3000`, `express.baseUrl: "http://localhost:4000"`,
`express.internalKey: "change-me-in-development"`, `upload.maxFileSizeMb: 50`,
`upload.acceptedExtensions: [".pdf", ".tif", ".tiff", ".jpg", ".jpeg", ".png"]`.

The config module must support an optional `config.override.json` file that is
merged over `config.json` at startup (volume-mounted at runtime per the
configuration-patterns skill).

**Depends on**: Task 1

**Complexity**: S

**Acceptance condition**: A Vitest unit test exists that (a) confirms the Config class
throws at construction when a required key is missing or invalid (e.g. negative
`maxFileSizeMb`), and (b) confirms it returns correct typed values when given a valid
config object. The test does not read from disk — it injects config values directly.

**Condition type**: automated

**Status**: not_started

---

### Task 3: Internal API client helper

**Description**: Create `apps/frontend/src/lib/apiClient.ts`. This module exports a
helper function that wraps the native `fetch` API and automatically injects the
`x-internal-key` header (value read from Config) and the `express.baseUrl` base URL
on every call to the Express backend. All Next.js API route handlers must use this
helper rather than calling `fetch` directly, so that the internal key is never
accidentally omitted.

The helper must accept: a path string (relative to `express.baseUrl`), an options
object compatible with the `fetch` RequestInit type, and return a `Promise<Response>`.

This module is server-side only. It imports Config; it must not be imported into
Client Components.

**Depends on**: Task 2

**Complexity**: S

**Acceptance condition**: A Vitest unit test exists that mocks `fetch` and confirms:
(a) the `x-internal-key` header is present on every call, (b) the base URL from config
is prepended to the path, (c) any additional headers passed by the caller are merged
and not overwritten. Three test cases minimum: GET with no additional headers, POST
with a custom header, POST with a body.

**Condition type**: automated

**Status**: not_started

---

### Task 4: Zod schemas for upload and duplicate response

**Description**: Create `apps/frontend/src/lib/schemas.ts` and define the following
Zod schemas for the C1 upload flow:

- `UploadFormSchema` — validates client-side form state before submission. Fields:
  - `file` — must be present (`File` object, non-null); extension must be one of
    `.pdf`, `.tif`, `.tiff`, `.jpg`, `.jpeg`, `.png` (case-insensitive); size must
    not exceed `maxFileSizeMb` megabytes (the schema must accept `maxFileSizeMb` as
    a parameter, e.g. via a factory function, so it is testable without config access)
  - `date` — non-empty string, must match `YYYY-MM-DD` format and be a valid
    calendar date (e.g. `1962-13-32` is invalid)
  - `description` — non-empty, non-whitespace-only string

- `DuplicateResponseSchema` — validates the response body when the API returns HTTP
  409. Fields:
  - `existingRecord.description` — string
  - `existingRecord.date` — string
  - `existingRecord.archiveReference` — string

**Depends on**: Task 1

**Complexity**: S

**Acceptance condition**: Vitest unit tests exist for `UploadFormSchema` covering: valid
input passes; empty date fails; syntactically invalid date (e.g. `"1962-13-32"`)
fails; empty description fails; whitespace-only description fails; unsupported file
extension fails; file exceeding size limit fails; file within size limit passes.
`DuplicateResponseSchema` is tested with a valid payload (passes) and a payload missing
`archiveReference` (fails). All edge cases listed must have a corresponding test case.

**Condition type**: automated

**Status**: not_started

---

### Task 5: Filename parsing utility

**Description**: Create the `parseFilename` pure utility function in
`apps/frontend/src/lib/parseFilename.ts`. The function accepts a filename string
(including extension) and returns `{ date: string | null; description: string | null }`.

Parsing rules (from the approved plan):

1. Strip the file extension from the filename stem.
2. Match the stem against the pattern `YYYY-MM-DD - <description>` (a hyphen-separated
   date followed by ` - ` followed by a non-empty description segment).
3. If the pattern matches, attempt to construct a `Date` object from the parsed date
   parts. If it is a valid calendar date, return the ISO date string (`YYYY-MM-DD`) in
   `date`; if it is not a valid calendar date (e.g. month 13), return `null` for `date`.
4. If the description segment is present and non-empty, return it in `description`;
   otherwise return `null` for `description`.
5. If the pattern does not match, return `{ date: null, description: null }`.

The function must be a pure function with no side effects and no imports other than
from the TypeScript standard library.

**Depends on**: Task 1

**Complexity**: S

**Acceptance condition**: Vitest unit tests exist covering: a conforming filename with
valid calendar date returns correct date and description; a conforming filename with
invalid calendar date (e.g. month 13) returns `null` for date and the description for
description; a non-conforming filename returns `{ date: null, description: null }`;
an empty string returns `{ date: null, description: null }`; a filename with only an
extension (no stem) returns `{ date: null, description: null }`. Minimum five test
cases, each covering a distinct branch.

**Condition type**: automated

**Status**: not_started

---

### Task 6: Application layout, navigation, and root redirect

**Description**: Create the root Next.js App Router layout at
`apps/frontend/src/app/layout.tsx`. This layout wraps every page and renders the
`AppNav` Server Component in a persistent navigation header. Create the `AppNav`
component at `apps/frontend/src/components/layout/AppNav.tsx`. `AppNav` is a static
Server Component with no props and no client-side state. It renders navigation links
to `/upload` (labelled "Document Intake") and `/curation` (labelled "Curation").

Create the root page at `apps/frontend/src/app/page.tsx`. This page must redirect to
`/upload` using Next.js `redirect()` so that the application opens on the intake form
when the root URL is visited.

Create the curation sub-layout at `apps/frontend/src/app/curation/layout.tsx` that
renders `CurationNav`. Create `CurationNav` at
`apps/frontend/src/components/layout/CurationNav.tsx`. `CurationNav` renders navigation
links to `/curation/documents` (labelled "Document Queue") and `/curation/vocabulary`
(labelled "Vocabulary Queue"). `CurationNav` may be a Server Component or Client
Component — the plan does not mandate a choice.

**Depends on**: Task 1

**Complexity**: S

**Acceptance condition**: A developer visiting `http://localhost:3000/` in a browser is
redirected to `http://localhost:3000/upload`. The `AppNav` header is visible on the
`/upload` page with links to `/upload` and `/curation`. Visiting `/curation` shows the
`CurationNav` with links to `/curation/documents` and `/curation/vocabulary`. Verified
by a developer running the application locally and navigating these routes.

**Condition type**: manual

**Status**: not_started

---

### Task 7: Document upload form — components and client-side logic

**Description**: Implement the C1 upload form components. All components live under
`apps/frontend/src/components/`.

Create the following components:

- `FilePickerInput` (Client Component, `intake/FilePickerInput.tsx`) — a file `<input>`
  restricted to `accept=".pdf,.tif,.tiff,.jpg,.jpeg,.png"`. On file selection, calls
  `parseFilename` on the selected file's name and emits the selected `File` object plus
  the parsed `{ date, description }` to the parent via a callback prop. If parsing
  returns non-null values, the parent form pre-populates its state.

- `MetadataFields` (Client Component, `intake/MetadataFields.tsx`) — controlled inputs
  for `date` (type `date`) and `description` (type `text`, or `<textarea>`). Receives
  current values and an `onChange` callback as props. Exposes any per-field validation
  error messages for display.

- `ValidationFeedback` (Client Component, `intake/ValidationFeedback.tsx`) — renders
  per-field error messages from client-side Zod validation. Also renders a top-level
  server-side rejection message (duplicate, server-side format error, network error).
  When the server returns HTTP 409, renders `DuplicateConflictAlert` with the existing
  record data.

- `DuplicateConflictAlert` (Client Component, `intake/DuplicateConflictAlert.tsx`) —
  displayed inside `ValidationFeedback` on HTTP 409. Props:
  `existingRecord: { description: string; date: string; archiveReference: string }`.
  Renders the description, date, and archive reference of the conflicting document.

- `SubmitButton` (Client Component, `intake/SubmitButton.tsx`) — disabled while any
  client-side validation error exists or while `submitting` is `true`. Shows a loading
  indicator (e.g. text change or spinner) during submission.

- `UploadSuccessMessage` (Client Component, `intake/UploadSuccessMessage.tsx`) —
  displays the submission confirmation on `/upload/success`. Receives a document record
  (description, date, archiveReference) and renders these fields.

- `DocumentUploadForm` (Client Component, `intake/DocumentUploadForm.tsx`) — the
  primary interactive component for C1. Composes all the above sub-components. Manages
  the following state internally:
  - `selectedFile: File | null`
  - `date: string`
  - `description: string`
  - `clientErrors: Record<string, string>`
  - `serverError: string | null`
  - `submitting: boolean`

  Props: `maxFileSizeMb: number`.

  On submit: (1) runs `UploadFormSchema` against all fields; if errors, sets
  `clientErrors` and stops; (2) sets `submitting: true`; (3) posts
  `multipart/form-data` to `/api/documents/upload`; (4) on HTTP 201, navigates to
  `/upload/success` passing the document record; (5) on HTTP 409, validates the
  response body with `DuplicateResponseSchema` and renders `DuplicateConflictAlert`;
  (6) on any other error, sets `serverError` with the response body message; (7) sets
  `submitting: false` on completion regardless of outcome.

**Depends on**: Task 4, Task 5, Task 6

**Complexity**: M

**Acceptance condition**: Vitest + React Testing Library component tests exist covering:
(a) selecting a conforming filename pre-populates `date` and `description` in the form;
(b) selecting a non-conforming filename leaves both fields empty; (c) selecting a file
with an invalid calendar date in the filename leaves the date field empty with no error;
(d) submitting with an empty date field shows the date field error; (e) submitting with
a whitespace-only description shows the description field error; (f) submitting a valid
form calls `fetch` with a `multipart/form-data` POST to `/api/documents/upload`;
(g) when the mocked API returns HTTP 409, `DuplicateConflictAlert` is rendered with the
correct existing record fields; (h) the submit button is disabled while `submitting` is
`true`; (i) a 4xx/5xx response shows the server error message; (j) `DuplicateConflictAlert`
renders description, date, and archive reference from its props. Minimum one test per
lettered case above.

**Condition type**: automated

**Status**: not_started

---

### Task 8: Upload pages — server-side page components

**Description**: Create the Next.js page components for the upload flow:

- `apps/frontend/src/app/upload/page.tsx` — React Server Component. Reads
  `upload.maxFileSizeMb` from the Config singleton at render time. Renders
  `DocumentUploadForm` passing `maxFileSizeMb` as a prop.

- `apps/frontend/src/app/upload/success/page.tsx` — React Server Component (or Client
  Component if query parameter reading requires it). Renders `UploadSuccessMessage`
  with the document record passed from the upload form (via query parameters or
  `sessionStorage` — implementation choice for the Implementer, either is acceptable).
  If no document record is present (user navigated directly to this URL without
  submitting), redirect to `/upload`.

**Depends on**: Task 6, Task 7

**Complexity**: S

**Acceptance condition**: A developer can complete a successful upload flow in a running
local application: visit `/upload`, fill in the form, submit, and be redirected to
`/upload/success` where the document description, date, and archive reference are
displayed. Directly visiting `/upload/success` without a prior submission redirects to
`/upload`. Confirmed by manual developer walkthrough.

**Condition type**: manual

**Status**: not_started

---

### Task 9: Next.js API route — composite document upload (DOC-004)

**Description**: Create the Next.js API route handler at
`apps/frontend/src/app/api/documents/upload/route.ts`. This handler implements the
composite browser upload contract DOC-004.

The handler must:

1. Accept a `multipart/form-data` POST from the browser containing the file and
   metadata fields (date, description).
2. Call Express `POST /api/documents` via `apiClient` to initiate the document record
   (DOC-001). Use the `x-internal-key` header (injected automatically by `apiClient`).
3. Call Express `PUT /api/documents/:uploadId/file` via `apiClient` to upload the
   file bytes (DOC-002).
4. Call Express `POST /api/documents/:uploadId/finalize` via `apiClient` to finalize
   the record (DOC-003).
5. If step 2 or step 3 fails, call Express `DELETE /api/documents/:uploadId` via
   `apiClient` (DOC-005) to clean up the initiated record, then return an appropriate
   error response to the browser.
6. On success, return HTTP 201 with the document record from the finalize response.
7. On HTTP 409 from Express (duplicate detection), return HTTP 409 to the browser with
   the existing record payload from the Express response body.
8. On HTTP 400/422 from Express, return the same status and error body to the browser.
9. On 5xx from Express or network error, log using Pino at `error` level and return
   HTTP 500 with a generic message ("Something went wrong. Please try again.").

The `x-internal-key` header is injected by `apiClient` — the handler must not set it
manually (to ensure the single point of injection is `apiClient`).

**Depends on**: Task 3

**Complexity**: M

**Acceptance condition**: Vitest integration tests using Mock Service Worker (MSW) exist
covering: (a) happy path — MSW returns 201 from all three Express endpoints; handler
returns 201 with document record; (b) duplicate — MSW returns 409 from DOC-001 initiate;
handler returns 409 with existing record payload; (c) DOC-002 file upload fails — MSW
returns 500 from the file upload endpoint; handler calls the DOC-005 cleanup endpoint
and returns 500 to the browser; (d) DOC-003 finalize fails — MSW returns 500; handler
calls cleanup and returns 500; (e) all outbound Express calls from the handler include
the `x-internal-key` header (assert on MSW captured request headers).

**Condition type**: automated

**Status**: not_started

---

### Task 10: Curation document queue — components

**Description**: Implement the document curation queue components under
`apps/frontend/src/components/curation/`.

Create the following components:

- `DocumentQueueList` (Client Component, `curation/DocumentQueueList.tsx`) — fetches
  the document queue on mount using `useSWR` with the SWR key
  `/api/curation/documents`. Renders a list of `DocumentQueueItem` components. Calls
  `mutate()` on the SWR key after a flag is cleared to re-fetch. If the initial fetch
  fails, displays an error state with a retry button (not an empty list). If the queue
  is empty, displays an empty-state message.

- `DocumentQueueItem` (component, `curation/DocumentQueueItem.tsx`) — a single entry
  in the queue. Displays: document description, date, flag reason (full text, including
  failing pages where applicable per UR-051/UR-055), and submitter identity. Provides a
  "Clear flag" action button (rendered as `ClearFlagButton`) and a "Edit metadata" link
  to `/curation/documents/:id`.

- `ClearFlagButton` (Client Component, `curation/ClearFlagButton.tsx`) — posts to
  `/api/curation/documents/:id/clear-flag`. On success, calls a callback prop to
  trigger queue re-fetch (the parent `DocumentQueueList` passes `mutate` as the
  callback). Displays a loading state during the request. On error, displays an inline
  error message.

All Zod response schema validation for the document queue API response
(`GET /api/curation/documents`) must be applied before the data is used in component
state. Define the response schema in `apps/frontend/src/lib/schemas.ts` (alongside the
upload schemas from Task 4) matching the DOC-006 contract shape.

**Depends on**: Task 6

**Complexity**: M

**Acceptance condition**: Vitest + React Testing Library component tests exist covering:
(a) `DocumentQueueList` renders a list of flagged documents from a mocked SWR response,
showing description, date, flag reason, and submitter identity for each; (b) empty queue
shows an empty-state message; (c) fetch failure shows error state with a retry button
(not an empty list); (d) `ClearFlagButton` shows loading state while the request is
in-flight; (e) after a successful clear-flag call, the queue re-fetch callback is
invoked; (f) a failed clear-flag call shows an inline error message.

**Condition type**: automated

**Status**: not_started

---

### Task 11: Curation document queue — page and API routes

**Description**: Create the page and API routes for the document curation queue.

Page:

- `apps/frontend/src/app/curation/page.tsx` — navigation hub page. Renders links to
  `/curation/documents` and `/curation/vocabulary`. Does not display queue data.
- `apps/frontend/src/app/curation/documents/page.tsx` — renders `DocumentQueueList`.
  This is a Client Component page (or a Server Component that renders a Client
  Component) because the queue re-fetches without page navigation.

Next.js API routes:

- `apps/frontend/src/app/api/curation/documents/route.ts` — `GET` handler. Forwards to
  Express `GET /api/curation/documents` via `apiClient` (DOC-006). Returns the queue
  data. On Express error, returns the error status and message.
- `apps/frontend/src/app/api/curation/documents/[id]/clear-flag/route.ts` — `POST`
  handler. Forwards to Express `POST /api/documents/:id/clear-flag` via `apiClient`
  (DOC-008). Returns 200 on success.

All outbound calls must use `apiClient` so the `x-internal-key` header is injected.

**Depends on**: Task 3, Task 10

**Complexity**: S

**Acceptance condition**: Vitest integration tests using MSW exist covering: (a) the GET
`/api/curation/documents` route forwards the request to Express and returns the queue
data on success; (b) the POST `.../clear-flag` route forwards to Express and returns 200
on success; (c) all outbound Express calls include the `x-internal-key` header.

**Condition type**: automated

**Status**: not_started

---

### Task 12: Document metadata edit — components

**Description**: Implement the document metadata edit form components under
`apps/frontend/src/components/curation/`.

Create the following components:

- `MetadataEditFields` (Client Component, `curation/MetadataEditFields.tsx`) —
  controlled inputs for each editable metadata field:
  - `date` — `<input type="date">` (same pattern as the intake form)
  - `description` — `<textarea>`
  - `documentType` — `<input type="text">` (free-text string, per OQ-003 resolution)
  - `people` — `<input type="text">` displaying a comma-separated string; the parent
    form splits on submit and joins for display (per OQ-002 resolution)
  - `organisations` — `<input type="text">`, same comma-separated pattern as `people`
  - `landReferences` — `<input type="text">`, same comma-separated pattern as `people`

  Receives current values and `onChange` callbacks as props. Shows per-field
  validation errors for any failed `MetadataEditSchema` check.

- `DocumentMetadataForm` (Client Component, `curation/DocumentMetadataForm.tsx`) —
  pre-populated from the document record passed as a prop. On submit, validates fields
  with `MetadataEditSchema` (defined in Task 13), then sends a PATCH to
  `/api/curation/documents/:id/metadata`. On success, displays an inline success
  message. On error, displays an inline error message. Does not trigger re-embedding
  (UR-062) — no additional calls are made on save.

Define `MetadataEditSchema` in `apps/frontend/src/lib/schemas.ts` (Task 13 is the
Zod schemas task for curation). For the purposes of this task, the schema file can
be extended from the one created in Task 4.

The `organisations` field is required by the approved plan (added after Integration
Lead review). It must be included alongside `people` and `landReferences` in both
`MetadataEditFields` and the submit handler.

**Depends on**: Task 6

**Complexity**: M

**Acceptance condition**: Vitest + React Testing Library component tests exist covering:
(a) `DocumentMetadataForm` pre-populates all fields (date, description, documentType,
people, organisations, landReferences) from the document record prop; (b) submitting
with an empty description shows the description field error and does not call the API;
(c) a successful PATCH response shows an inline success message; (d) a failed PATCH
response shows an inline error message; (e) comma-separated `people` input is split
into an array in the submitted payload (assert on the fetch body captured by MSW or a
mock); (f) comma-separated `organisations` input is split into an array in the submitted
payload; (g) metadata save does not make any additional API calls beyond the PATCH.

**Condition type**: automated

**Status**: not_started

---

### Task 13: Curation Zod schemas and document metadata API routes

**Description**: This task has two parts that belong together because the API route
schemas and the form schemas must agree on field shapes.

**Part A — Zod schemas for curation** (extend `apps/frontend/src/lib/schemas.ts`):

- `MetadataEditSchema` — validates the metadata edit form before the PATCH call:
  - `date` — optional; if provided, must be a valid calendar date in `YYYY-MM-DD`
    format; may be empty (undated documents are valid)
  - `description` — non-empty, non-whitespace-only string
  - `documentType` — non-empty string
  - `people` — `string[]`; each element must be non-empty
  - `organisations` — `string[]`; each element must be non-empty
  - `landReferences` — `string[]`; each element must be non-empty

- Response schemas for DOC-006 (document queue list item), DOC-007 (single document
  detail), matching the contract shapes defined in `integration-lead-contracts.md`.

**Part B — API routes**:

- `apps/frontend/src/app/api/curation/documents/[id]/route.ts` — `GET` handler.
  Forwards to Express `GET /api/documents/:id` via `apiClient` (DOC-007). Returns
  the document record.
- `apps/frontend/src/app/api/curation/documents/[id]/metadata/route.ts` — `PATCH`
  handler. Forwards to Express `PATCH /api/documents/:id/metadata` via `apiClient`
  (DOC-009). Returns the updated document record on success.

**Depends on**: Task 3, Task 4

**Complexity**: S

**Acceptance condition**: (a) Vitest unit tests for `MetadataEditSchema` cover: valid
input with all fields passes; empty description fails; whitespace-only description
fails; invalid date format fails; valid date passes; empty `people` array element fails.
(b) Vitest integration tests using MSW cover: the GET `[id]` route returns the document
record from Express; the PATCH metadata route forwards the body to Express and returns
the updated record; all outbound calls include `x-internal-key`.

**Condition type**: automated

**Status**: not_started

---

### Task 14: Document metadata edit — page

**Description**: Create the document metadata edit page at
`apps/frontend/src/app/curation/documents/[id]/page.tsx`. This page fetches the
document record server-side using `fetch` in the page component body (React Server
Component data fetching pattern). The returned data is passed as props to
`DocumentMetadataForm`. If the fetch returns 404, render a "document not found" message
or redirect to `/curation/documents`.

The fetch in the page component must use `apiClient` — the internal key must be
included.

**Depends on**: Task 12, Task 13

**Complexity**: S

**Acceptance condition**: A developer navigating to `/curation/documents/:id` in a
running local application (with Express returning a mock or seeded document record)
sees the metadata edit form pre-populated with the document's current values. Submitting
a corrected value updates the record and shows a success message. Verified by manual
developer walkthrough with a seeded test document.

**Condition type**: manual

**Status**: not_started

---

### Task 15: Vocabulary review queue — components

**Description**: Implement the vocabulary review queue components under
`apps/frontend/src/components/curation/`.

Create the following components:

- `VocabularyQueueList` (Client Component, `curation/VocabularyQueueList.tsx`) —
  fetches the vocabulary candidate queue on mount using `useSWR` with the SWR key
  `/api/curation/vocabulary`. Renders a list of `VocabularyQueueItem` components.
  After a successful accept or reject action, calls `mutate()` to re-fetch and remove
  the acted-on item. If the fetch fails, shows an error state with a retry button.
  If the queue is empty, shows an empty-state message.

- `VocabularyQueueItem` (component, `curation/VocabularyQueueItem.tsx`) — a single
  row in the queue. Displays: term name, category, confidence score (numeric), and
  source document description. Provides `AcceptCandidateButton` and
  `RejectCandidateButton`.

- `AcceptCandidateButton` (Client Component, `curation/AcceptCandidateButton.tsx`) —
  posts to `/api/curation/vocabulary/:termId/accept`. On success, calls a callback
  prop to trigger queue re-fetch. Displays a loading state during the request. On
  error, displays an inline error message.

- `RejectCandidateButton` (Client Component, `curation/RejectCandidateButton.tsx`) —
  posts to `/api/curation/vocabulary/:termId/reject`. Same pattern as
  `AcceptCandidateButton`.

All API response data must be validated with Zod schemas at the frontend boundary before
being used in component state. Define the VOC-001 response schema in
`apps/frontend/src/lib/schemas.ts`.

**Depends on**: Task 6

**Complexity**: M

**Acceptance condition**: Vitest + React Testing Library component tests exist covering:
(a) `VocabularyQueueList` renders candidates from a mocked SWR response with term name,
category, confidence, and source document description visible for each; (b) empty queue
shows an empty-state message; (c) fetch failure shows error state with a retry button;
(d) `AcceptCandidateButton` shows loading state during the request; (e) a successful
accept triggers the queue re-fetch callback; (f) a failed accept shows an inline error;
(g) `RejectCandidateButton` shows loading state; (h) a successful reject triggers the
re-fetch callback; (i) a failed reject shows an inline error.

**Condition type**: automated

**Status**: not_started

---

### Task 16: Vocabulary review queue — page and API routes

**Description**: Create the vocabulary review queue page and API routes.

Page:

- `apps/frontend/src/app/curation/vocabulary/page.tsx` — renders `VocabularyQueueList`.

Next.js API routes:

- `apps/frontend/src/app/api/curation/vocabulary/route.ts` — `GET` handler. Forwards
  to Express `GET /api/curation/vocabulary` via `apiClient` (VOC-001). Returns the
  candidate list.
- `apps/frontend/src/app/api/curation/vocabulary/[termId]/accept/route.ts` — `POST`
  handler. Forwards to Express `POST /api/curation/vocabulary/:termId/accept` via
  `apiClient` (VOC-002). Returns 200 on success.
- `apps/frontend/src/app/api/curation/vocabulary/[termId]/reject/route.ts` — `POST`
  handler. Forwards to Express `POST /api/curation/vocabulary/:termId/reject` via
  `apiClient` (VOC-003). Returns 200 on success.

All outbound calls must use `apiClient`.

**Depends on**: Task 3, Task 15

**Complexity**: S

**Acceptance condition**: Vitest integration tests using MSW exist covering: (a) the
GET `/api/curation/vocabulary` route returns the candidate list from Express; (b) the
accept route forwards to Express and returns 200; (c) the reject route forwards to
Express and returns 200; (d) all outbound Express calls include the `x-internal-key`
header.

**Condition type**: automated

**Status**: not_started

---

### Task 17: Manual vocabulary term entry — components and Zod schema

**Description**: Implement the manual vocabulary term entry form components.

Define `AddTermSchema` in `apps/frontend/src/lib/schemas.ts`:

- `term` — string, required, non-empty
- `category` — string, required, non-empty, free-text (not an enumeration)
- `description` — string, optional
- `aliases` — array of strings, optional (defaults to empty array); each element
  must be non-empty if present
- `relationships` — array of `{ targetTermId: string; relationshipType: string }`,
  optional; `targetTermId` and `relationshipType` must each be non-empty strings

Create the following components under `apps/frontend/src/components/curation/`:

- `TermRelationshipsInput` (Client Component, `curation/TermRelationshipsInput.tsx`) —
  allows the user to add, edit, and remove relationship entries. Each entry has a
  `targetTermId` text input and a `relationshipType` text input (free-text string;
  indicative types per ADR-038: owned_by, transferred_to, witnessed_by, adjacent_to,
  employed_by, referenced_in, performed_by, succeeded_by — but any string is valid).
  Emits the current `relationships` array to the parent form via a callback prop.

- `AddVocabularyTermForm` (Client Component, `curation/AddVocabularyTermForm.tsx`) —
  form for manually entering a new vocabulary term. Composes `TermRelationshipsInput`.
  On submit, validates fields with `AddTermSchema`, then posts to
  `/api/curation/vocabulary/terms`. After a successful submission, redirects to
  `/curation/vocabulary` or shows an inline success message (Implementer's choice,
  either is acceptable per the plan). On error, shows an inline error message.

**Depends on**: Task 6

**Complexity**: M

**Acceptance condition**: (a) Vitest unit tests for `AddTermSchema` cover: valid input
with all fields passes; empty `term` fails; empty `category` fails; optional
`description` absent passes; empty `aliases` element fails; relationship with empty
`targetTermId` fails; relationship with empty `relationshipType` fails. (b) Vitest +
React Testing Library component tests for `AddVocabularyTermForm` cover: submitting a
valid form calls fetch with the correct payload; empty `term` shows a validation error
and does not call the API; empty `category` shows a validation error and does not call
the API; successful submission shows success or redirects; failed submission shows an
inline error message.

**Condition type**: automated

**Status**: not_started

---

### Task 18: Manual vocabulary term entry — page and API route

**Description**: Create the manual vocabulary term entry page and API route.

Page:

- `apps/frontend/src/app/curation/vocabulary/new/page.tsx` — renders
  `AddVocabularyTermForm`. No data fetching on load.

Next.js API route:

- `apps/frontend/src/app/api/curation/vocabulary/terms/route.ts` — `POST` handler.
  Forwards to Express `POST /api/curation/vocabulary/terms` via `apiClient` (VOC-004).
  Returns the created term record on success (HTTP 201). On validation error from
  Express, returns the error status and body. On 5xx, logs via Pino and returns HTTP 500
  with a generic message.

**Depends on**: Task 3, Task 17

**Complexity**: S

**Acceptance condition**: Vitest integration tests using MSW exist covering: (a) the
POST `/api/curation/vocabulary/terms` route forwards the request body to Express and
returns 201 with the created term; (b) an Express validation error (422) is forwarded
to the browser; (c) an Express 5xx causes a 500 response to the browser with a generic
message; (d) the outbound Express call includes the `x-internal-key` header. A manual
walkthrough confirms that a developer can navigate to `/curation/vocabulary/new`, fill
in the form, submit, and either be redirected to `/curation/vocabulary` or see a success
message.

**Condition type**: both

**Status**: not_started

---

### Task 19: Pino logging in API route handlers

**Description**: Add Pino structured logging to all Next.js API route handlers. Pino
is a server-side dependency only — it must not be imported into Client Components.

Create a shared logger instance in `apps/frontend/src/lib/logger.ts` that exports a
configured Pino logger. All API route handlers import from this module rather than
creating their own Pino instances.

Apply the following log levels consistently across all API route handlers:

- `info` — successful document submission, successful flag clear, successful term
  accept/reject, successful metadata save, successful manual term creation
- `warn` — unexpected 4xx responses from Express (responses that should not occur given
  client-side validation), client-side validation bypass attempts
- `error` — 5xx responses from Express, network failures reaching Express, config
  validation failures at startup

This task applies logging to all API route handlers created in Tasks 9, 11, 13, 16,
and 18. Each handler must be updated to use the shared logger.

**Depends on**: Task 9, Task 11, Task 13, Task 16, Task 18

**Complexity**: S

**Acceptance condition**: A code review confirms that: (a) every API route handler file
imports from `apps/frontend/src/lib/logger.ts` and logs at the correct level for each
outcome (info/warn/error per the rules above); (b) Pino is not imported in any Client
Component file; (c) a 5xx response path in at least one handler logs at `error` level
(verified by reading the code). No automated test is required for log output in Phase 1;
this is a code-quality verification by reading the implementation.

**Condition type**: manual

**Status**: not_started

---

### Task 20: Error handling — queue fetch failure states and 5xx browser messages

**Description**: Ensure consistent error handling across all curation queue pages and
the upload flow, for cases not covered by the component tests in earlier tasks.

Verify and, where not already implemented, add:

1. **Queue fetch failure**: `DocumentQueueList` and `VocabularyQueueList` must show a
   distinct error state with a retry button when the initial SWR fetch fails, not an
   empty queue. This distinguishes "no items in queue" from "failed to load". (This
   is required by the approved plan and must be present in the final implementation.)

2. **5xx browser messages**: All client-side error handlers (in `DocumentUploadForm`,
   `ClearFlagButton`, `AcceptCandidateButton`, `RejectCandidateButton`,
   `AddVocabularyTermForm`, `DocumentMetadataForm`) must display "Something went wrong.
   Please try again." for 5xx responses. Internal server details must not be exposed
   to the browser.

3. **Network error (fetch failure)**: All client-side forms and buttons that call
   Next.js API routes must handle `fetch` throwing (network unreachable) and display
   a message indicating the server could not be reached.

This task is a cross-cutting sweep. If the earlier component tasks (7, 10, 12, 15, 17)
already implement these behaviours correctly, this task confirms it by reading the code
and adding any missing cases.

**Depends on**: Task 7, Task 10, Task 12, Task 15, Task 17

**Complexity**: S

**Acceptance condition**: Vitest + React Testing Library tests exist (or are added in
this task) for: (a) `DocumentQueueList` shows a retry button on fetch failure, not an
empty list; (b) `VocabularyQueueList` shows a retry button on fetch failure; (c)
`DocumentUploadForm` shows a generic error message on a 5xx response; (d)
`DocumentUploadForm` shows a "server could not be reached" message when `fetch` throws.
Cases (a) and (b) may already be covered by Tasks 10 and 15 — if so, this task
confirms they exist; no duplication required.

**Condition type**: automated

**Status**: not_started

---

### Task 21: End-to-end MSW integration test suite

**Description**: Write an MSW-based integration test suite that exercises the full
request/response flow through the Next.js API routes for all major happy-path and
error-path scenarios. Tests run in Vitest. No test database or running Express server
is needed — MSW intercepts all outbound `fetch` calls to Express.

The suite must cover at minimum:

- C1 upload happy path: browser POST to `/api/documents/upload` → three Express calls
  (DOC-001, DOC-002, DOC-003) → 201 returned to browser with document record
- C1 upload duplicate: DOC-001 returns 409 → handler returns 409 with existing record
- C1 upload partial failure with cleanup: DOC-002 returns 500 → cleanup DOC-005 is
  called → 500 returned to browser
- Document queue fetch: GET `/api/curation/documents` → DOC-006 response forwarded
- Clear flag: POST `.../clear-flag` → DOC-008 forwarded → 200 returned
- Document detail fetch: GET `/api/curation/documents/:id` → DOC-007 forwarded
- Metadata PATCH: PATCH `.../metadata` → DOC-009 forwarded → updated record returned
- Vocabulary queue fetch: GET `/api/curation/vocabulary` → VOC-001 forwarded
- Accept candidate: POST `.../accept` → VOC-002 forwarded → 200 returned
- Reject candidate: POST `.../reject` → VOC-003 forwarded → 200 returned
- Add manual term: POST `/api/curation/vocabulary/terms` → VOC-004 forwarded → 201
- All scenarios: assert that `x-internal-key` header is present on each outbound
  Express call (captured by MSW request handlers)

Tests in earlier tasks (9, 11, 13, 16, 18) cover individual routes. This task
assembles a consolidated suite that verifies the end-to-end contract compliance
including the internal key assertion on every route.

**Depends on**: Task 9, Task 11, Task 13, Task 16, Task 18

**Complexity**: M

**Acceptance condition**: The Vitest integration test suite runs to completion with all
scenarios listed above passing. Each scenario asserts on: correct HTTP status code
returned to the browser, correct response body shape (validated against the Zod
response schemas), and presence of `x-internal-key` on the forwarded Express call.
Confirmed by running `pnpm test` (or equivalent) in `apps/frontend/`.

**Condition type**: automated

**Status**: not_started

---
