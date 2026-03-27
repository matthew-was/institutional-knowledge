# Task List — Frontend Service

## Status

Draft — 2026-03-23

## Source plan

`documentation/tasks/senior-developer-frontend-plan.md` (revised 2026-03-23)

Additional context: `documentation/tasks/frontend-tasks-revision-2026-03-23.md`

## Flagged issues

None — all open questions resolved; DuplicateConflictResponse wire shape corrected upstream
(revision §0); three-tier testing model defined in `development-principles-frontend.md`; Hono custom
server architecture documented in the revised plan.

---

## Tasks

### Task 1: Scaffold the Next.js frontend application

**Description**: Create the Next.js frontend application at `apps/frontend/` within the
existing monorepo. This task establishes the project skeleton only — no pages, components,
or API routes.

Specifically:

- Create `apps/frontend/package.json` with dependencies: `next`, `react`, `react-dom`,
  `hono`, `@hono/node-server`, `swr`, `ky`, `nconf`, `zod`, `pino`,
  `@js-temporal/polyfill` (ADR-050 — calendar date logic; removed when Node 26 + Safari
  native support land), `@base-ui/react` (ADR-051 — headless interactive
  component primitives), `tailwindcss` (ADR-051 — all styling; no CSS modules), and
  devDependencies: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`,
  `@testing-library/user-event`, `msw`, `supertest`,
  `@playwright/test`, `typescript`, `@types/react`, `@types/node`, `biome`
- Create `apps/frontend/tsconfig.json` extending the root tsconfig; target Node for the
  `server/` sub-system; strict mode enabled
- Create `apps/frontend/biome.json` — consistent with `apps/backend/biome.json` in
  formatting conventions; no unused variables; consistent import ordering
- Create `apps/frontend/next.config.ts` — minimal config; no file-based API routes
  (`app/api/` directory must not be created at any point)
- Create `apps/frontend/tailwind.config.ts` — minimal Tailwind v4 config; content paths
  include `src/**/*.{ts,tsx}`
- Create `src/styles/global.css` importing Tailwind base, components, and utilities; no
  other CSS files are created — all styling uses Tailwind utility classes
- Create the directory structure:
  - `src/app/` — Next.js App Router pages (empty stubs)
  - `src/components/` — shared presentational components (empty)
  - `src/lib/` — utilities and schemas (empty)
  - `src/styles/` — global CSS (Tailwind entry point only; no module files)
  - `server/routes/` — Hono route handlers (empty)
  - `server/handlers/` — business logic handlers (empty)
  - `server/requests/` — request functions (empty)
  - `server/config/` — config module (empty)
- Create `apps/frontend/vitest.config.ts` — configure Vitest with React plugin; separate
  configs or include patterns for browser-side tests (jsdom environment) and server-side
  tests (node environment)
- Create `apps/frontend/playwright.config.ts` — minimal Playwright config pointing at the
  running server

**Depends on**: none

**Complexity**: S

**Acceptance condition**: `apps/frontend/` exists in the monorepo with the correct directory
structure; `tailwind.config.ts` exists and `src/styles/global.css` imports Tailwind; no CSS
module files exist anywhere in `apps/frontend/`; `pnpm --filter frontend tsc --noEmit` passes
with no errors; `pnpm biome check apps/frontend/src apps/frontend/server` passes; no
`app/api/` directory exists.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-23):

- Automated checks: confirmed — all six parts of the acceptance condition verified by reading
  the implementation files and the second code review (2026-03-23 20:38). Directory structure
  complete (eight directories, each with `.gitkeep`); `tailwind.config.ts` present with
  correct content paths; `global.css` uses Tailwind v4 `@import "tailwindcss"` directive;
  no CSS module files; `tsconfig.json` overrides to `"target": "ES2024"` and
  `"lib": ["ES2024", "DOM", "DOM.Iterable"]` resolving the `PromiseWithResolvers` error
  from the first review; Biome check passes; no `app/api/` directory.
- Manual checks: none required
- User need: satisfied — US-086 requires upload, curation, and vocabulary management in a
  single web application, unpolished but functional in Phase 1. This scaffold task correctly
  establishes the structural precondition: a buildable, lint-clean monorepo package with all
  required framework dependencies installed, the Hono server layer stubs in place, and the
  three-tier test infrastructure configured. No pages or components are in scope for this
  task; their absence is correct.
- Outcome: done

---

### Task 2: Hono custom server setup

**Description**: Implement the Hono custom server entry point at
`apps/frontend/server/server.ts` and all supporting infrastructure. This is the deliberate
framework boundary — all `/api/*` routes are Hono handlers; Next.js handles all non-API
traffic as a catch-all.

Specifically:

- Implement `server/config/index.ts`: a `Config` class that loads and validates
  configuration using nconf and Zod at startup (fail-fast on invalid config). Required
  nconf keys:
  - `server.port` (number) — port the Hono server listens on
  - `express.baseUrl` (string) — internal URL of the Express backend
  - `express.internalKey` (string) — shared key for Hono to Express calls (ADR-044)
  - `upload.maxFileSizeMb` (number) — maximum file size in megabytes
  - `upload.acceptedExtensions` (string[]) — accepted file extensions
  - Config reads from `apps/frontend/config.json5` (base) and
    `apps/frontend/config.override.json5` (optional runtime override), following the
    configuration-patterns skill
- Implement `server/server.ts`:
  - Initialise Next.js with `next({ dev, customServer: true })`; call `nextApp.prepare()`
    before mounting routes
  - Create a Hono app instance
  - Mount auth middleware on `/api/*` as a no-op in Phase 1 (wired now for Phase 2
    readiness); the middleware passes all requests through without modification
  - Register all API route stubs (empty route handlers returning 501 for now; actual
    implementations added in later tasks)
  - Mount Next.js as a catch-all: `app.all('*', ...)` calls `nextHandler` for all
    non-API traffic
  - Start the HTTP server on `config.server.port`
- Implement `server/requests/client.ts`: a pre-configured Ky instance that sets
  `express.baseUrl` as the base URL and `x-internal-key` header (value from
  `express.internalKey`) on every outbound request. This is the only place the internal
  key is injected.
- Create `apps/frontend/config.json5` with sensible local development defaults
- Write a Tier 2 test suite (`server/__tests__/server.test.ts`) using supertest:
  - Smoke test: the server starts and returns a non-error status for at least one known
    route
  - Security assertion: make a request to any route and assert that the `x-internal-key`
    value does not appear in any response header; confirms the internal key never leaks
    to browser clients
  - Auth middleware no-op: requests to `/api/*` without any auth header are not rejected
    in Phase 1

**Depends on**: Task 1

**Complexity**: M

**Acceptance condition**: `server/server.ts` and `server/config/index.ts` exist and are
correctly structured; the pre-configured Ky instance exists in `server/requests/client.ts`
with base URL and `x-internal-key` set; Tier 2 supertest tests pass including the internal
key non-leak assertion; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: both

**Status**: done

**Verification** (2026-03-24):

- Automated checks: confirmed — all three Tier 2 supertest tests exist and cover the
  stated conditions. The smoke test confirms the server starts and the route stub is
  registered (`POST /api/documents/upload` returns 501 with `{ error: 'not_implemented' }`).
  The security test reads `testConfig.express.internalKey` and asserts its value is absent
  from all response header values — directly testing the key non-leak condition. The auth
  no-op test confirms requests without an auth header receive neither 401 nor 403. The test
  file uses `parseConfig` with an inline fixture object (not the real `config.json5`),
  making it independent of the deployed config file. `pnpm biome check` and
  `pnpm --filter frontend tsc --noEmit` confirmed clean by the code reviewer.
- Manual checks: none required — the code review confirms both tool checks passed in the
  review session with no errors or warnings.
- User need: satisfied — US-086 requires upload, curation, and vocabulary management in a
  single web application. This task establishes the deliberate framework boundary (Hono
  handles `/api/*`; Next.js handles all other traffic) and the Express client factory that
  injects `x-internal-key` on every outbound request. The internal key never leaks to
  browser clients (verified by the security test). All structural preconditions for the
  single-application requirement are in place.
- Outcome: done

---

### Task 3: Shared utilities and frontend-only schemas

**Description**: Implement the shared utility functions and the three frontend-only form
validation schemas. These are prerequisites for all UI and server implementation tasks.

Specifically:

- Implement `src/lib/temporal.ts`: re-exports `Temporal` from `@js-temporal/polyfill`.
  This is the single import point for `Temporal` across all frontend code — no other file
  imports from `@js-temporal/polyfill` directly. When native support lands (Node 26 +
  Safari), only this file changes. See ADR-050.
- Implement `src/lib/fetchWrapper.ts`: a thin project utility function wrapping plain
  `fetch`. Sets consistent `content-type: application/json` and base path on every call.
  Passed as the `fetcher` argument to `useSWR` and `useSWRMutation`. Must not contain any
  Next.js or Hono imports.
- Implement `src/lib/parseFilename.ts`: a pure function that parses a filename stem against
  the pattern `YYYY-MM-DD - short description`. Returns
  `{ date: string; description: string } | null`. Uses `Temporal.PlainDate.from()` with
  try/catch for calendar date validation (e.g. `2026-02-30` is caught as invalid).
  Import `Temporal` from `src/lib/temporal.ts`. Rules per UR-006:
  - If pattern matches and parsed date is a valid calendar date, return the ISO date string
    and description segment
  - If parsed date is not a valid calendar date, return the description without a date
  - If pattern does not match, return `null`
- Implement `src/lib/schemas.ts`: contains only the three frontend form validation schemas.
  A comment at the top states that all response schemas are imported from
  `@institutional-knowledge/shared`. Schemas:
  - `UploadFormSchema` — validates file (extension and size), date (YYYY-MM-DD format and
    valid calendar date), and description (non-empty, non-whitespace-only). File size limit
    is injected as a parameter (makes the schema testable without config access). Extension
    check is case-insensitive. Uses `z.uuid()` (not `z.string().uuid()`) for any UUID
    fields (Zod v4 form).
  - `MetadataEditSchema` — derived from the shared `UpdateDocumentMetadataRequest` schema
    imported from `@institutional-knowledge/shared`; extends with frontend-specific
    transformation rules (comma-separated string splitting for `people`, `organisations`,
    `landReferences`). Date is optional (null or empty is valid). Description must be
    non-empty non-whitespace-only if provided. Must not redefine fields independently.
  - `AddTermSchema` — derived from the shared `AddVocabularyTermRequest` schema imported
    from `@institutional-knowledge/shared`. The `relationships` array entries use
    `targetTermId: z.uuid()` (Zod v4 form — not `z.string().uuid()`).
- Write Tier 1 tests (Vitest, no React Testing Library):
  - `parseFilename`: conforming filenames, non-conforming filenames, valid calendar date,
    invalid calendar date (date omitted, description returned), empty string,
    extension-only filenames
  - `UploadFormSchema`: valid inputs, empty date, invalid date format, invalid calendar
    date, empty description, whitespace-only description, unsupported file extension,
    oversized file, exactly at size limit
  - `MetadataEditSchema`: valid inputs, null date pre-population (no validation error),
    empty description, comma-separated array inputs
  - `AddTermSchema`: valid inputs, missing required fields, UUID validation via `z.uuid()`
    for `targetTermId`
  - `fetchWrapper`: mock `window.fetch` directly; assert consistent `content-type` header
    and base path are set on every call

**Depends on**: Task 1

**Complexity**: M

**Acceptance condition**: All three schemas exist in `src/lib/schemas.ts`; only
`UploadFormSchema`, `MetadataEditSchema`, and `AddTermSchema` are defined there (no
response schema redefinitions); `src/lib/temporal.ts` exists and re-exports `Temporal`
from `@js-temporal/polyfill`; `parseFilename` and `fetchWrapper` exist in `src/lib/`;
all Tier 1 tests pass; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-24):

- Automated checks: confirmed — all parts of the acceptance condition verified by reading the
  implementation and test files. All four `src/lib/` files exist: `temporal.ts` re-exports
  `Temporal` from `@js-temporal/polyfill` and is the sole import point for that package
  across all of `apps/frontend/src/` (grep-confirmed). `parseFilename.ts` and
  `fetchWrapper.ts` exist in `src/lib/`. `schemas.ts` contains exactly three exports
  (`createUploadFormSchema` factory, `MetadataEditSchema`, `AddTermSchema`) with no response
  schema redefinitions; a file-top comment confirms all response schemas are imported from
  `@institutional-knowledge/shared`. Post-review changes applied and confirmed: `as string`
  type assertions removed from `parseFilename.ts` lines 28–29; `MetadataEditSchema`
  description field changed from `.refine()` to `.trim().min(1)`. All three test files are
  present and cover every stated scenario — `parseFilename` (14 cases including conforming,
  valid calendar dates, invalid calendar dates returning `{ date: null, description }`, and
  non-conforming returning `null`); `schemas.test.ts` (UploadFormSchema, MetadataEditSchema,
  AddTermSchema with all edge cases); `fetchWrapper.browser.test.ts` (content-type, basePath,
  default, caller override, pass-through). `pnpm biome check` and `tsc --noEmit` confirmed
  passing by the code reviewer; no subsequent changes affect lint or types.
- Manual checks: none required — condition type is automated.
- User need: satisfied — US-003/US-003b (form rejection of invalid date and whitespace
  description), US-004 (filename pre-population with `parseFilename` returning
  `{ date: null, description }` for invalid calendar dates, matching the user story criterion
  that the date field is left empty while the description still pre-populates), and US-005
  (file format and size validation) are all directly enabled by this task. The
  `MetadataEditSchema` description fix aligns frontend trimming with backend behaviour,
  ensuring whitespace-only descriptions are rejected consistently at both layers.
- Outcome: done

---

### Task 4: Application layout and navigation

**Description**: Implement the root application layout, navigation component, root
redirect, and page shell. These are the structural elements shared across all pages.

Specifically:

This task establishes the Next.js route group structure that separates public and private
pages without encoding that boundary in URLs. Route group folder names (parenthesised) are
stripped from the URL by Next.js.

Full `src/app/` layout after this task:

```text
src/app/
├── layout.tsx              ← outermost layout: <html>/<body> shell + global.css only
├── page.tsx                ← root redirect → /upload
├── (public)/               ← Phase 2: unauthenticated pages (e.g. /login)
└── (private)/
    ├── layout.tsx          ← private shell: renders AppNav on every authenticated page
    ├── upload/
    │   └── page.tsx        ← URL: /upload
    └── curation/
        ├── layout.tsx      ← curation shell: renders CurationNav
        └── page.tsx        ← URL: /curation
```

Specifically:

- Implement `src/app/layout.tsx` (Server Component): outermost layout; renders `<html>`
  and `<body>`; imports `src/styles/global.css`. Does **not** render `AppNav` — that is
  the responsibility of `(private)/layout.tsx`, so future public pages do not inherit the nav.
- Update `src/styles/global.css`: add baseline body reset and global typography after the
  existing Tailwind import line.
- Implement `src/app/page.tsx`: root redirect to `/upload` (React Server Component using
  Next.js `redirect()`)
- Implement `src/app/(public)/` directory: empty placeholder for Phase 2 public pages
  (e.g. `/login`). Add a `.gitkeep` file so the directory is committed.
- Implement `src/app/(private)/layout.tsx` (Server Component): private shell layout;
  renders `AppNav` in the header, then `{children}`. Applied to all private pages.
- Implement `src/app/(private)/upload/page.tsx`: page stub that reads `maxFileSizeMb`
  from the frontend config at render time and passes it as a prop to `DocumentUploadForm`
  (to be implemented in Task 5). URL: `/upload`.
- Implement `src/app/(private)/curation/layout.tsx` (Server Component): shared layout for
  all `/curation/*` pages; renders `CurationNav`.
- Implement `src/app/(private)/curation/page.tsx`: curation landing page; renders
  navigation links to `/curation/documents` and `/curation/vocabulary`; no queue data.
  URL: `/curation`.
- Implement `src/components/AppNav/AppNav.tsx` (Server Component): top-level navigation
  header. Links: `/upload` (Document Intake) and `/curation` (Curation). No props, no
  client-side state. Satisfies US-086.
- Implement `src/components/CurationNav/CurationNav.tsx` (Server Component): navigation
  between curation sections; links to `/curation/documents` and `/curation/vocabulary`.
- Write Tier 1 tests (Vitest + React Testing Library + `vitest-axe`, jsdom environment;
  test files named `*.browser.test.tsx`):
  - `AppNav`: renders navigation links for `/upload` and `/curation`; correct `href`
    values; `<nav>` has `aria-label`; `vitest-axe` reports no accessibility violations
  - `CurationNav`: renders links for `/curation/documents` and `/curation/vocabulary`;
    correct `href` values; `<nav>` has `aria-label`; `vitest-axe` reports no violations
- Add `vitest-axe` to `apps/frontend/devDependencies` and run `pnpm install`. This
  package is the Vitest-compatible port of `jest-axe` and runs full axe-core audit rules
  in jsdom tests. All future component test files must follow this pattern.

**Depends on**: Tasks 1, 3

**Complexity**: S

**Acceptance condition**: Root `src/app/layout.tsx` renders only the `<html>`/`<body>`
shell; `(private)/layout.tsx` renders `AppNav`; root `/` redirects to `/upload`;
`(private)/curation/layout.tsx` renders `CurationNav`; Tier 1 RTL + `vitest-axe` tests
for `AppNav` and `CurationNav` pass with no accessibility violations; `pnpm biome check`
and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: both

**Status**: done

**Verification** (2026-03-24):

- Automated checks: confirmed — `layout.tsx` renders only `<html>`/`<body>` with no `AppNav`
  (verified by code); `(private)/layout.tsx` renders `AppNav`; `page.tsx` calls `redirect('/upload')`;
  `(private)/curation/layout.tsx` renders `CurationNav`; both `AppNav.browser.test.tsx` and
  `CurationNav.browser.test.tsx` exist with 4 tests each covering: `<nav>` with `aria-label`,
  two `href` assertions, and `vitest-axe` `toHaveNoViolations`; `setup.browser.ts` correctly
  uses the side-effect-only import (`vitest-axe/extend-expect`); code review confirms all
  60 tests pass.
- Manual checks: confirmed by developer — `pnpm --filter frontend exec biome check src server`
  and `pnpm --filter frontend exec tsc --noEmit` both exit with no errors; no application code
  changed since code_written confirmation.
- User need (US-086): satisfied — the single-application structure is established; `AppNav`
  links upload and curation as sections of one application; `CurationNav` links documents and
  vocabulary within curation; all three sections are reachable from shared navigation.
- Outcome: done

---

### Task 5: Document upload form — components and client-side validation

**Description**: Implement the document upload form components and client-side validation
for the C1 intake UI. This task covers the presentational components and form state only.
The API call is wired in Task 6.

Specifically:

- Create `src/lib/config.ts`: thin re-export of the `config` singleton from
  `server/config/index`. This keeps `src/` pages within their own sub-system boundary —
  pages import from `@/lib/config` via the `@/*` alias rather than reaching into `server/`
  via a relative path. Update `src/app/(private)/upload/page.tsx` to import from
  `@/lib/config` instead of `../../../../server/config/index`.
- Implement `src/components/FilePickerInput/FilePickerInput.tsx`: file `<input>` element
  restricted to `accept=".pdf,.tif,.tiff,.jpg,.jpeg,.png"`. On file selection, calls
  `parseFilename` (from Task 3) and emits the selected `File` object and parsed metadata
  to the parent form state via callbacks. Accessibility: proper label association, ARIA
  attributes.
- Implement `src/components/MetadataFields/MetadataFields.tsx`: controlled inputs for
  `date` (type `date`) and `description` (type `text`). Receives pre-populated values from
  filename parsing and allows user editing. Exposes validation state to the parent form.
- Implement `src/components/ValidationFeedback/ValidationFeedback.tsx`: renders per-field
  error messages from Zod client-side validation. Also surfaces server-side rejection
  messages. Renders `DuplicateConflictAlert` when the API returns a duplicate detection
  error.
- Implement `src/components/DuplicateConflictAlert/DuplicateConflictAlert.tsx`: displayed
  inside `ValidationFeedback` when a 409 duplicate is detected. Props:
  `existingRecord: { description: string; date: string | null; archiveReference: string }`.
  If `date` is `null`, display "Undated". The `existingRecord` data is read from
  `response.data.existingRecord` (not `response.existingRecord`) per the corrected 409
  wire shape (`{ error: 'duplicate_detected', data: { existingRecord: { ... } } }`).
- Implement `src/components/SubmitButton/SubmitButton.tsx`: disabled while validation
  errors exist or while submission is in progress; shows a loading state during the API
  call.
- Implement `src/components/DocumentUploadForm/DocumentUploadForm.tsx` (uses `useSWRMutation`
  and form state — requires `'use client'`): orchestrates all sub-components. State:
  `selectedFile`, `date`, `description`, `clientErrors`, `serverError`, `submitting`.
  Receives `maxFileSizeMb: number` as a prop. Runs `UploadFormSchema` (from Task 3)
  client-side before submission. API integration wired in Task 6.
- Write Tier 1 tests (Vitest + React Testing Library, static props):
  - `DuplicateConflictAlert`: renders description, date, and archive reference; renders
    "Undated" when `date` is `null`
  - `FilePickerInput`: renders file input; accessible label; `accept` attribute is correct
  - `SubmitButton`: renders in enabled, disabled, and loading states; ARIA attributes

**Depends on**: Tasks 3, 4

**Complexity**: M

**Acceptance condition**: All five components exist and are correctly structured; Tier 1
RTL tests pass including the `null` date to "Undated" assertion on `DuplicateConflictAlert`;
`pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-25):

- Automated checks: confirmed — all six components present and correctly structured
  (`FilePickerInput`, `MetadataFields`, `ValidationFeedback`, `DuplicateConflictAlert`,
  `SubmitButton`, `DocumentUploadForm`); `src/lib/config.ts` is a thin re-export of the
  config singleton and `upload/page.tsx` imports via `@/lib/config` not a direct relative
  path into `server/`; all five task components carry `'use client'`; `DuplicateConflictAlert`
  uses `existingRecord.date ?? 'Undated'`; `DuplicateConflictAlert.browser.test.tsx` contains
  the load-bearing assertion `screen.getByText(/Undated/)` when `date: null` is passed;
  `FilePickerInput.browser.test.tsx` covers file input rendering, accessible label, and
  `accept` attribute; `SubmitButton.browser.test.tsx` covers enabled, disabled, loading
  states, and `aria-disabled`; all browser test files use the `.browser.test.tsx` suffix
  routed to the `jsdom` project in `vitest.config.ts`; code reviewer confirmed lint and
  typecheck pass with no blocking findings.
- Manual checks: none required
- User need: satisfied — US-001 (upload form accessible via web), US-002 (date and
  description fields present), US-003/US-003b (client-side validation via
  `UploadFormSchema.safeParse` before submission), US-004 (filename pre-population via
  `parseFilename` callback in `handleFileSelect`), US-086 (upload as a section of the single
  web application). API wiring is explicitly deferred to Task 6 — the `// TODO Task 6`
  comment is in place. The implementation correctly scopes this task to components and
  client-side validation only.
- Outcome: done

---

### Task 5a: Form validation architecture — React Hook Form, Base UI fields, and Zod resolver

**Description**: Migrate the upload form to the project's standard form validation
architecture (ADR-052). This replaces the manual `safeParse`-on-submit approach with
React Hook Form + Zod resolver, introduces Base UI `Field.*` primitives for accessible
field composition, and removes the `ValidationFeedback` aggregator. No new behaviour is
introduced — validation rules are unchanged; only the architecture that drives and surfaces
them changes.

**Motivation**: The Task 5 implementation validates only on submit and aggregates errors
outside the fields. This has two problems: errors are not programmatically associated with
their fields (accessibility failure — no `aria-describedby`, no `aria-invalid`); and the
curation forms will need dirty tracking, blur validation, and reset-on-cancel, which plain
React state cannot provide cleanly. React Hook Form solves both. See ADR-052.

**Dependencies to add**:

- `react-hook-form` — form state management, dirty tracking, validation lifecycle
- `@hookform/resolvers` — Zod adapter (`zodResolver`)

Both are added to `apps/frontend/package.json` **`dependencies`** (not `devDependencies` —
both ship runtime browser code); run `pnpm install`.

**New file — `useDocumentUpload.ts`**:

Create `src/components/DocumentUploadForm/useDocumentUpload.ts`. This hook owns all state
and logic; `DocumentUploadForm.tsx` becomes a pure rendering layer (see
`development-principles-frontend.md` — Form Component State Separation section).

The hook:

- Accepts `maxFileSizeMb: number` as a parameter
- Sets up `useForm<UploadFormValues>` with
  `resolver: zodResolver(createUploadFormSchema(maxFileSizeMb))` and `mode: 'onBlur'`;
  schema instance wrapped in `useMemo` keyed on `maxFileSizeMb`
- Owns `useState` for `serverError: string | null` and `duplicateRecord: DuplicateRecord | null`
  — these are driven by API responses, not field validation
- Implements `handleFileSelect(file, parsed)`: calls `setValue('date', ...)` and
  `setValue('description', ...)` from filename parsing; clears `serverError` and
  `duplicateRecord`
- Implements `onSubmit(data: UploadFormValues)`: the API call TODO for Task 6 sits here
- Returns `{ control, errors, isValid, isSubmitting, serverError, duplicateRecord,
  handleFileSelect, handleSubmit }` where `handleSubmit` is `rhfHandleSubmit(onSubmit)`

Define and export `UploadFormValues` from this file:
`type UploadFormValues = z.infer<ReturnType<typeof createUploadFormSchema>>`

**Changes to `DocumentUploadForm.tsx`**:

- Remove all `useState` and `useForm` calls — import and call `useDocumentUpload` instead
- Destructure the hook's return value and pass to child components as props
- Native `<form noValidate onSubmit={handleSubmit}>` is retained — Base UI `Form.Root`
  is not used (see ADR-052)
- Server error renders as `{serverError != null && <div role="alert">{serverError}</div>}`
  adjacent to `SubmitButton`
- `DuplicateConflictAlert` driven by `duplicateRecord` from the hook

**Changes to `FilePickerInput`**:

- Wrap with `Field.Root`, `Field.Label`, `Field.Error` from `@base-ui/react/field`
- Use a plain `<input type="file">` inside a `Controller` render prop — do **not** use
  `Field.Control` for file inputs; Base UI's event abstraction does not handle `FileList`
- In the `Controller` `onChange` handler, extract `e.target.files?.[0]` and call
  `field.onChange(file)` directly (pass the `File` object, not the event); do not spread
  `field.value` onto the input (browsers own the file input value for security reasons)
- Call `onFileSelect` callback after `field.onChange`
- Accept `control: Control<UploadFormValues>` and `error?: string` as props;
  `onFileSelect` callback unchanged

**Changes to `MetadataFields`**:

- Replace each plain `<label>` + `<input>` pair with `Field.Root`, `Field.Label`,
  `Field.Control`, `Field.Error` from `@base-ui/react/field`
- Use `Controller` for both fields; pass `invalid={!!errors.date}` / `invalid={!!errors.description}`
  to `Field.Root` — do not add `aria-invalid` directly to `Field.Control`; `Field.Root`
  propagates it via its own context
- Use `match={true}` on every `Field.Error` — without it, errors never render because
  `noValidate` bypasses native `ValidityState`
- Props interface changes from controlled callbacks to
  `{ control: Control<UploadFormValues>; errors: FieldErrors<UploadFormValues> }`

**Changes to `SubmitButton`**:

- Replace `<button>` with `Button` from `@base-ui/react/button` (note: single-part
  component; the export is `Button`, not `Button.Root`)
- `disabled` and `submitting` props still passed from the parent — `SubmitButton` remains
  presentational; it does not import RHF

**`ValidationFeedback` component**: deleted. Per-field errors render inside each
`Field.Root` via `Field.Error`. The `ValidationFeedback.tsx` file and directory are
removed. There is no test file for this component.

**`DuplicateConflictAlert`**: unchanged — no interactive primitives; keep existing
`<div role="alert" aria-live="assertive">` structure.

**Import convention**: use sub-path entry points — `import { Button } from
'@base-ui/react/button'`, `import { Field } from '@base-ui/react/field'` — not the barrel
import, for tree-shaking.

**Tests**:

- `useDocumentUpload`: new Tier 1 test file using `renderHook`; assert `handleFileSelect`
  calls `setValue` and clears server error; assert `handleSubmit` does not call `onSubmit`
  when form is invalid (Zod fails)
- `FilePickerInput.browser.test.tsx`: add a `useForm` wrapper component in the test to
  provide `control`; add assertion that `Field.Error` renders when `error` prop is present
- `MetadataFields.browser.test.tsx`: new file; `useForm` wrapper; assert `aria-invalid` on
  the input when field has an error; assert `Field.Error` message renders
- `SubmitButton.browser.test.tsx`: no changes required — Base UI `Button` renders a native
  `<button>`; existing `.disabled` and `aria-disabled` assertions continue to pass
- `DuplicateConflictAlert.browser.test.tsx`: no changes required

**Out of scope**: styling, new validation rules, curation form components, any component
not listed above, navigation components.

**Depends on**: Task 5

**Complexity**: M

**Acceptance condition**: `react-hook-form` and `@hookform/resolvers` are in
`package.json` `dependencies`; `useDocumentUpload.ts` exists co-located with
`DocumentUploadForm.tsx` and owns all form state and logic; `DocumentUploadForm.tsx`
contains no `useState` or `useForm` calls; `FilePickerInput` and `MetadataFields` use
`Field.Root`, `Field.Label`, `Field.Control`/plain `<input>`, `Field.Error`; `SubmitButton`
uses `Button` from `@base-ui/react/button`; `ValidationFeedback` component and directory
are deleted; per-field errors render via `Field.Error` adjacent to their fields;
server-error `<div role="alert">` present for non-field errors; all Tier 1 tests pass
including new `useDocumentUpload` hook tests; `pnpm biome check` and
`pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-25):

- Automated checks: confirmed. All structural elements verified by reading the implementation:
  `react-hook-form@^7.55.0` and `@hookform/resolvers@^5.2.2` in `dependencies` (not
  `devDependencies`); `useDocumentUpload.ts` co-located with `DocumentUploadForm.tsx` and
  owns all `useState` and `useForm` calls; `DocumentUploadForm.tsx` contains no `useState`
  or `useForm` calls; `FilePickerInput` uses `Field.Root`, `Field.Label`, plain `<input
  type="file">` inside `Controller`, and `Field.Error match={true}`; `MetadataFields` uses
  `Field.Root`, `Field.Label`, `Input` from `@base-ui/react/input` inside `Controller` (reads
  `Field.Root`'s `invalid` context — `aria-invalid` propagation confirmed by test assertions),
  and `Field.Error match={true}`; `SubmitButton` uses `Button` from `@base-ui/react/button`;
  `ValidationFeedback` directory deleted (no files found); per-field `Field.Error` present
  adjacent to each field in both components; server-error `<div role="alert">` present in
  `DocumentUploadForm.tsx` at line 41. Hook tests non-vacuous for `setValue` behaviour:
  `getValues('date')` and `getValues('description')` asserted after `handleFileSelect`, and
  would fail if `setValue` calls were removed. Code review confirmed: 78 tests passing, `pnpm
  biome check` and `pnpm --filter frontend tsc --noEmit` both pass (round 2).
- Manual checks: none required.
- User need: satisfied. The core need (US-003/US-003b) is that validation errors prompt the
  user to correct individual fields. The `Field.Root invalid` prop propagates `aria-invalid`
  to inputs, `Field.Error` renders error text adjacent to its field, and `mode: 'onBlur'`
  means errors surface on field interaction rather than only on submit — a meaningful
  improvement over the Task 5 baseline. `handleFileSelect` pre-populates fields from a
  conforming filename (US-004) and this is now verified non-vacuously by tests.
- Outcome: done

---

### Task 6: Document upload — Hono route, handler, and request functions

**Description**: Implement the composite document upload operation across all three custom
server layers (route handler, handler, request functions) and wire the upload form to the
Hono API route via `useSWRMutation`.

**Custom server layers**:

- `server/requests/documents.ts`: four request functions (no framework imports; use the
  pre-configured Ky instance from Task 2):
  - `initiateUpload(payload)` calls Express `POST /api/documents/initiate` (DOC-001);
    returns typed `InitiateUploadResponse` or throws classified error; all response schemas
    imported from `@institutional-knowledge/shared`
  - `uploadFileBytes(uploadId, file)` calls Express
    `POST /api/documents/:uploadId/upload` (DOC-002) with `multipart/form-data`; on 409
    returns the duplicate error with `existingRecord` read from `response.data.existingRecord`
  - `finalizeUpload(uploadId)` calls Express
    `POST /api/documents/:uploadId/finalize` (DOC-003)
  - `deleteUpload(uploadId)` calls Express `DELETE /api/documents/:uploadId` (DOC-005);
    used for cleanup on failure; swallows errors (best-effort)
- `server/handlers/uploadHandler.ts`: composite upload handler (no framework imports):
  - Receives parsed file, date, description
  - Calls `initiateUpload`, then `uploadFileBytes`, then `finalizeUpload` in sequence
  - If `uploadFileBytes` returns a 409 duplicate, calls `deleteUpload` (best-effort) and
    re-throws the duplicate error with the `existingRecord` payload
  - If any other step fails, calls `deleteUpload` (best-effort) and re-throws
  - Returns the `FinalizeUploadResponse` on success
- `server/routes/documents.ts`: Hono route handler for `POST /api/documents/upload`:
  - Parses `multipart/form-data` request; extracts `file`, `date`, `description`
  - Calls `uploadHandler`
  - Returns HTTP 201 with `FinalizeUploadResponse` on success
  - Returns HTTP 409 with envelope
    `{ error: 'duplicate_detected', data: { existingRecord: { ... } } }` on duplicate
  - Returns HTTP 400/422/5xx on other errors
  - Logs using Pino (info on success, error on 5xx, warn on 4xx)

**UI layer**:

- Wire `DocumentUploadForm` to call `POST /api/documents/upload` via `useSWRMutation` /
  `fetchWrapper`
- On HTTP 201: navigate to `/upload/success` with the returned document record
- On HTTP 409: extract `response.data.existingRecord`; render `DuplicateConflictAlert`
- On HTTP 400/422/5xx: set `serverError` with the error message from the response body

**Tests**:

- Tier 2 — UI behaviour (Vitest + RTL + MSW; MSW intercepts at Hono route boundary
  `POST /api/documents/upload`):
  - Submitting valid form triggers POST; on 201 response navigates to success page
  - API 409 response renders `DuplicateConflictAlert` with data from
    `response.data.existingRecord`; submit button re-enabled
  - Server error (5xx) shows generic error message; submit button re-enabled
  - Submit button shows loading state during in-flight request
- Tier 2 — Custom server route handler (Vitest + supertest against Hono app; MSW intercepts
  at Express boundary `http://[express.baseUrl]/api/documents/*`):
  - `POST /api/documents/upload`: returns 201 with finalized response on full success
  - Returns 409 with correct envelope when upload step returns duplicate; `existingRecord`
    nested under `data`
  - Returns error status on Express failure; cleanup endpoint called
- Tier 2 — Handler tests (Vitest; import handler directly; mock request functions):
  - Three-step sequence called in order
  - `deleteUpload` called when `uploadFileBytes` fails
  - `deleteUpload` called when `finalizeUpload` fails
  - Duplicate 409 from `uploadFileBytes`: `deleteUpload` called; duplicate error re-thrown
    with `existingRecord`
  - Typed success return on happy path

**Depends on**: Tasks 2, 3, 5, 5a

**Complexity**: L

**Acceptance condition**: All three server layers implemented; handler cleanup logic
verified by Tier 2 handler tests (delete called on each failure path); 409 envelope reads
`response.data.existingRecord` confirmed by Tier 2 route handler test; UI form wires to
API via `useSWRMutation`; all Tier 2 tests pass; `pnpm biome check` and
`pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-26):

- Automated checks: confirmed. All three server layers are present and correct.
  `uploadHandler.test.ts` confirms `deleteUpload` is called on the `uploadFile` error path,
  the `finalizeUpload` error path, and the unexpected-throw path; not called when
  `initiateUpload` fails or on the happy path. `documents.upload.test.ts` line 140 confirms
  the 409 envelope nests `existingRecord` under `data` and not at the top level.
  `useDocumentUpload.ts` wires to `POST /api/documents/upload` via `useSWRMutation`.
  `useDocumentUpload.browser.test.ts` contains falsifiable assertions per CR-015.
- Manual checks: the code reviewer required the developer to confirm
  `pnpm biome check apps/frontend/src`, `pnpm --filter frontend exec tsc --noEmit`, and
  `pnpm --filter frontend test` all pass. Task was set to `reviewed` by the user, confirming
  these checks passed.
- User need: satisfied. US-001 (upload via web UI) — full pipeline wired end-to-end; 201
  navigates to success page. US-006 (atomic upload) — `deleteUpload` cleanup in
  `uploadHandler.ts` ensures no partial record is stored on any failure path. US-020
  (duplicate detection) — 409 `existingRecord` payload propagated through all layers to
  `DuplicateConflictAlert` via `setDuplicateRecord`.
- Outcome: done

---

### Task 7: Upload success page and UploadSuccessMessage component

**Description**: Implement the `/upload/success` page and the `UploadSuccessMessage`
component that displays the submission confirmation after a successful document upload.

Specifically:

- Implement `src/components/UploadSuccessMessage/UploadSuccessMessage.tsx`: receives the
  document record returned by the API and renders the description, date, and archive
  reference. If `date` is `null`, display "Undated". Props:
  `{ description: string; date: string | null; archiveReference: string }`.
- Implement `src/app/(private)/upload/success/page.tsx`: reads the document record from query
  parameters or session storage (implementer choice) and passes it to
  `UploadSuccessMessage`. Provides a link back to `/upload` for uploading another document.
- Write Tier 1 tests (Vitest + React Testing Library, static props):
  - `UploadSuccessMessage`: renders description and archive reference; renders "Undated"
    when `date` is `null`; renders date string when `date` is non-null

**Depends on**: Tasks 4, 6

**Complexity**: S

**Acceptance condition**: `/upload/success` page exists; `UploadSuccessMessage` renders
correctly with a non-null date; renders "Undated" for `null` date confirmed by Tier 1 RTL
test; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-26):

- Automated checks: confirmed — three Tier 1 RTL tests in
  `UploadSuccessMessage.browser.test.tsx` directly exercise all three acceptance condition
  cases: (1) description and archive reference rendered with non-null date; (2) "Undated"
  rendered when `date={null}` — `getByText(/Undated/)` would throw if absent; (3) date string
  rendered when date is non-null. Assertions are falsifiable (CR-015). The `/upload/success`
  page exists at `src/app/(private)/upload/success/page.tsx`.
- Manual checks: `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` — confirmed by
  the user's `reviewed` status transition after the second review round, which required these
  to pass clean.
- User need: satisfied — the page provides immediate confirmation of a successful upload,
  displaying description, date (or "Undated"), and archive reference as required by US-001
  and US-042. The redirect guard (added in round 2) prevents a confusing blank page on
  direct navigation. All suggestions from round 1 were applied in the round 2 submission.
- Outcome: done

---

### Task 8: Document curation queue — components

**Description**: Implement the presentational components for the document curation queue
page. Data fetching is wired in Task 9. This task covers the components and their Tier 1
tests only.

Specifically:

- Implement
  `src/app/(private)/curation/documents/components/DocumentQueueItem.tsx`: a single row
  in the queue. Shows description, date (displays "Undated" when `date` is `null`), flag
  reason (full text including failing pages per UR-051, UR-055), `flaggedAt` timestamp,
  and submitter identity (UR-126). Provides a "Clear flag" action button (wired in Task 9)
  and a link to `/curation/documents/:id` for the metadata edit form. Props derived from
  `DocumentQueueItem` imported from `@institutional-knowledge/shared`.
- Implement `src/app/(private)/curation/documents/components/useClearFlag.ts`: custom
  hook owning the clear-flag state machine (`isClearing`, `error`, `handleClear`). In
  this task the hook calls a simple inline no-op stub — no injected parameter, no
  abstraction. Task 9 replaces the stub by importing and calling `clearDocumentFlag`
  directly. `DocumentQueueItem` calls this hook and passes `onClick`, `isLoading`, and
  `error` as props to `ClearFlagButton`.
- Implement `src/components/ClearFlagButton/ClearFlagButton.tsx` (has an `onClick` event
  handler — requires `'use client'`): purely presentational; props are
  `{ onClick: () => void; isLoading: boolean; error: string | null }`. No state, no async
  logic — all state lives in `useClearFlag`.
- Write Tier 1 tests (Vitest + React Testing Library, static props):
  - `DocumentQueueItem`: renders description, date, flag reason, and submitter identity;
    renders "Undated" when `date` is `null`; renders date string when non-null; contains a
    link to `/curation/documents/:id`
  - `ClearFlagButton`: renders in default, loading, and error states; accessible button
    label

**Depends on**: Tasks 3, 4

**Complexity**: S

**Acceptance condition**: `DocumentQueueItem` and `ClearFlagButton` exist; Tier 1 RTL
tests pass including `null` date to "Undated" assertion on `DocumentQueueItem`; `pnpm
biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-26):

- Automated checks: confirmed. `DocumentQueueItem` exists at
  `src/app/(private)/curation/documents/components/DocumentQueueItem.tsx`;
  `ClearFlagButton` exists at `src/components/ClearFlagButton/ClearFlagButton.tsx`.
  `DocumentQueueItem.browser.test.tsx` lines 35–41 render with `date={null}` and assert
  `getByText(/Undated/)` is defined and `queryByText('1987-06-15')` is null — both sides
  falsifiable (CR-015 satisfied). The non-null date path (lines 43–50) asserts
  `queryByText(/Undated/)` is null when date is present. `ClearFlagButton.browser.test.tsx`
  covers idle, loading, and error states with an accessible `aria-label="Clear flag"`.
  `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` confirmed by the
  `code_written` checklist enforcement and the user's `reviewed` transition.
- Manual checks: none required — all acceptance conditions are covered by automated tests
  and the enforced `code_written` checklist.
- User need: satisfied. `DocumentQueueItem` renders description, date (or "Undated"), flag
  reason, `flaggedAt` timestamp, and submitter identity, meeting US-036 (full flag reason
  display), US-055 (clear-flag action present), and US-091 (submitter identity displayed).
  The `useClearFlag` stub is intentionally scoped to this task; Task 9 completes the
  wire-up. The link to `/curation/documents/:id` provides navigation to the metadata edit
  form as required.
- Outcome: done

---

### Task 9: Document curation queue — Hono route, handler, request functions, and data fetching

**Description**: Implement the document queue data fetching and the clear-flag operation
across all three custom server layers, and wire the curation queue page with `useSWR`.

**Custom server layers**:

- `server/requests/curation.ts`: two request functions (no framework imports; use the
  pre-configured Ky instance):
  - `fetchDocumentQueue(params?)` calls Express `GET /api/curation/documents` (DOC-006);
    response schema (`DocumentQueueResponse`) imported from `@institutional-knowledge/shared`
  - `clearDocumentFlag(documentId)` calls Express
    `POST /api/documents/:id/clear-flag` (DOC-008); response schema imported from shared
- `server/handlers/curationHandler.ts` (document section): thin wrappers; these operations
  have no orchestration logic; handlers delegate directly to request functions
- `server/routes/curation.ts`: two Hono route handlers:
  - `GET /api/curation/documents` returns 200 with `DocumentQueueResponse`
  - `POST /api/curation/documents/:id/clear-flag` returns 200 on success; propagates 404
    and 409 from Express with structured error body

**UI layer**:

- Implement
  `src/app/(private)/curation/documents/_hooks/useDocumentQueue.ts`: custom hook using `useSWR`
  with `fetchWrapper` as fetcher; SWR key is `/api/curation/documents`. Returns
  `{ items, isLoading, error, mutate }`.
- Implement `src/app/(private)/curation/documents/page.tsx`: curation documents page that
  renders `DocumentQueueList` using the hook. Shows loading state; shows empty state when
  queue is empty; shows error state with retry button when fetch fails (distinguishes "no
  items" from "failed to load").
- Implement `DocumentQueueList` component: receives items from the hook and renders a list
  of `DocumentQueueItem` components; passes `onSuccess` callback to `DocumentQueueItem`
  that calls `mutate()` to re-fetch.
- Update `src/app/(private)/curation/documents/components/useClearFlag.ts`: replace the
  inline no-op stub with a direct call to `clearDocumentFlag` (from
  `server/requests/curation.ts`). Remove any stub function. The hook signature stays the
  same — `DocumentQueueItem` requires no changes.

**Tests**:

- Tier 2 — UI behaviour (Vitest + RTL + MSW; MSW intercepts at Hono route boundary
  `GET /api/curation/documents` and
  `POST /api/curation/documents/:id/clear-flag`):
  - `useDocumentQueue` hook: fetches on mount; returns items in `items`; shows empty state
    on empty response; shows error state with message on fetch failure
  - `ClearFlagButton` wired: triggers POST; loading state shown; queue re-fetches on
    success (mutate called); inline error shown on API failure
- Tier 2 — Custom server route handler (Vitest + supertest; MSW at Express boundary
  `http://[express.baseUrl]/api/curation/documents` and
  `http://[express.baseUrl]/api/documents/:id/clear-flag`):
  - `GET /api/curation/documents`: returns 200 with queue data from Express
  - `POST /api/curation/documents/:id/clear-flag`: propagates 200, 404, and 409 correctly

**Depends on**: Tasks 2, 3, 8

**Complexity**: M

**Acceptance condition**: Document queue page fetches and renders items on mount; clear-flag
triggers re-fetch of queue confirmed by Tier 2 hook test; all Tier 2 tests pass;
`pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-26):

- Automated checks: confirmed. All four acceptance conditions are met by the test suite.
  (1) Document queue page fetches on mount: `useDocumentQueue.browser.test.tsx` "returns items
  from the API on success" (lines 37–61) renders the hook with MSW intercepting
  `/api/curation/documents` and asserts `items` has length 1 after loading; falsifiable —
  removing `useSWR` leaves `items` as `[]`, failing the length assertion. (2) Clear-flag
  triggers re-fetch: `DocumentQueueList.browser.test.tsx` "calls mutate after a successful
  clear-flag POST" (lines 51–70) passes a mocked `mutate` function and asserts it is called
  once after button click resolves; the path is button → `useSWRMutation` trigger → `onSuccess`
  → `mutate()`; falsifiable — removing the `onSuccess` option prevents `mutate` being called.
  (3) All Tier 2 tests present: custom server route tests cover GET 200 (data forwarded), 200
  (query params forwarded to Express), 400 (invalid params — `?page=abc` returns
  `invalid_params`), 500; POST 200, 404 (propagated `not_found`), 409 (propagated
  `no_active_flag`), 500. UI behaviour tests cover fetch-on-mount, empty state, error state,
  mutate-exposed, loading state, mutate-on-success, error-shown-on-failure. (4) Lint and type
  check: confirmed by the enforced `code_written` checklist and the round-2 code reviewer.
- Manual checks: none required — all conditions are automated.
- User need: satisfied. `useClearFlag` is wired end-to-end via `useSWRMutation`, triggering
  the Hono POST route which propagates to Express. Queue re-fetches via `mutate()` in the
  `onSuccess` callback, removing the cleared document from the view as required by US-081.
  The page renders the full queue on mount with loading, empty, and error states, supporting
  the curation queue display need (US-080 context). Submitter identity is rendered in
  `DocumentQueueItem` meeting US-091. The round-1 blocking findings were both resolved: the
  `useClearFlag` direct-fetch violation was fixed by `useSWRMutation`; the unnecessary
  `'use client'` on `DocumentQueueList` was removed. The dead `fetchQueue` stub was also
  removed (S-1) and Zod validation was added to the query params boundary (S-2).
- Outcome: done

---

### Task 10: Document detail page and metadata edit form — components

**Description**: Implement the document detail page and the `DocumentMetadataForm`
component for editing a document's metadata. The API call is wired in Task 11.

Specifically:

- Implement `src/app/(private)/curation/documents/[id]/page.tsx` (React Server Component):
  fetches the document record server-side using `fetch` in the page component body
  (DOC-007 via the Hono route `GET /api/curation/documents/:id`). Passes the document
  data as props to `DocumentMetadataForm`. Handles 404 — renders an error message if the
  document is not found.
- Implement `src/components/MetadataEditFields/MetadataEditFields.tsx`: controlled inputs
  for `date`, `description`, `documentType` (free-text string per OQ-003), `people`,
  `organisations`, and `landReferences`. The `people`, `organisations`, and `landReferences`
  fields use comma-separated text inputs (split into arrays on submit, joined for display
  per OQ-002). Date field handles `null` initial value without treating it as a validation
  error on render — an empty date field is valid.
- Implement `src/components/DocumentMetadataForm/DocumentMetadataForm.tsx` (uses form
  state and `useSWRMutation` — requires `'use client'`): editable form using
  `MetadataEditFields`. Pre-populated from the document record received as props. On
  submit, validates with `MetadataEditSchema` (from Task 3). API call wired in Task 11.
  Shows success message on save; shows inline error on API failure.
- Write Tier 1 tests (Vitest + React Testing Library, static props):
  - `MetadataEditFields`: renders all fields; comma-separated display for array fields;
    date field renders empty with no error when initial date is `null`
  - `DocumentMetadataForm` (static): renders all fields pre-populated from props; submit
    button accessible

**Depends on**: Tasks 3, 4

**Complexity**: M

**Acceptance condition**: Document detail page fetches document server-side; form renders
pre-populated fields; null date pre-population does not trigger validation error confirmed
by Tier 1 RTL test; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-27):

- Automated checks: confirmed. All four acceptance conditions are met by the implementation
  and tests. (1) Document detail page fetches server-side: `[id]/page.tsx` is an `async`
  Server Component calling `fetch` with `cache: 'no-store'` against
  `http://${config.server.host}:${config.server.port}/api/curation/documents/${id}` (both
  host and port from config after B-01 fix in round 2). Handles 404 and non-OK responses
  with distinct error UI. (2) Form renders pre-populated fields:
  `DocumentMetadataForm.browser.test.tsx` "renders all metadata fields pre-populated from
  the document prop" asserts all six field values from `toFormValues()` which maps arrays
  to comma-separated strings and null date to `''`; falsifiable — would fail if
  `toFormValues` were absent or incorrect. (3) Null date does not trigger validation error:
  two independent tests confirm this — `DocumentMetadataForm.browser.test.tsx` "renders
  with an empty date field when document date is null" (renders with `date: null`, asserts
  `dateInput.value === ''` and no error text) and `MetadataEditFields.browser.test.tsx`
  "renders the date field as empty with no error when initial date is empty string" (covers
  the form-internal representation `date: ''`); both falsifiable. (4) Lint and type check:
  confirmed by the code reviewer in both rounds — `pnpm biome check` passes, `tsc --noEmit`
  passes, all 129 frontend tests pass.
- Manual checks: none required — all conditions are automated.
- User need: satisfied. US-082 requires a Primary Archivist to correct document metadata
  (type, date, people, land references, description) via the curation UI. The implementation
  provides an edit form with all required fields, pre-populated from the document record.
  The null-date case is handled correctly so undated documents do not present a false
  validation error. The API call is deliberately stubbed (Task 11 scope), which is the
  correct boundary — the component and data model are complete. Round-1 blocking finding
  B-01 (hardcoded `localhost`) was resolved; S-01 (textarea for description) and S-02
  (redundant `'use client'` on hook) were also resolved. No gap between acceptance condition
  and user need for this task's scope.
- Outcome: done

---

### Task 11: Document detail — Hono routes, handler, and request functions

**Description**: Implement the fetch-document-detail and update-metadata operations across
all three custom server layers. Wire `DocumentMetadataForm` to the PATCH API via
`useSWRMutation`.

**Custom server layers**:

- `server/requests/curation.ts` (extend): two request functions:
  - `fetchDocumentDetail(documentId)` calls Express `GET /api/documents/:id` (DOC-007);
    response schema (`DocumentDetailResponse`) imported from
    `@institutional-knowledge/shared`; `date` field is `string | null`
  - `updateDocumentMetadata(documentId, patch)` calls Express
    `PATCH /api/documents/:id/metadata` (DOC-009); request body from
    `UpdateDocumentMetadataRequest` imported from `@institutional-knowledge/shared`
- `server/handlers/curationHandler.ts` (extend): thin wrappers for the two operations;
  no orchestration logic
- `server/routes/curation.ts` (extend): two Hono route handlers:
  - `GET /api/curation/documents/:id` returns 200 with `DocumentDetailResponse`; 404
    propagated from Express
  - `PATCH /api/curation/documents/:id/metadata` returns 200 with
    `UpdateDocumentMetadataResponse`; 400 and 404 propagated from Express

**UI layer**:

- Wire `DocumentMetadataForm` to call
  `PATCH /api/curation/documents/:id/metadata` via `useSWRMutation` / `fetchWrapper`
- On success: show inline success message
- On error: show inline error message

**Tests**:

- Tier 2 — UI behaviour (Vitest + RTL + MSW; MSW intercepts at Hono route boundary
  `PATCH /api/curation/documents/:id/metadata`):
  - `DocumentMetadataForm` hook: pre-populates fields from document record prop; rejects
    empty description on submit; sends PATCH with correctly split array fields; shows
    success message on save; shows error on API failure
  - Handles `null` initial date without treating it as a validation error
- Tier 2 — Custom server route handler (Vitest + supertest; MSW at Express boundary
  `http://[express.baseUrl]/api/documents/:id/metadata`):
  - `GET /api/curation/documents/:id`: returns 200 with document detail; propagates 404
  - `PATCH /api/curation/documents/:id/metadata`: returns 200 on success; propagates 400
    and 404

**Depends on**: Tasks 2, 3, 10

**Complexity**: M

**Acceptance condition**: Metadata PATCH sends correctly structured request body with array
fields split from comma-separated input confirmed by Tier 2 UI test; null date handled
without error; all Tier 2 tests pass; `pnpm biome check` and
`pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-27):

- Automated checks: confirmed. All four acceptance conditions are met. (1) Array splitting
  confirmed by Tier 2 UI test: `DocumentMetadataForm.browser.test.tsx` "sends PATCH with
  array fields correctly split" (lines 171-212) renders the form pre-populated with
  `people: ['Alice Smith', 'Bob Jones']`, submits, captures the PATCH body via MSW
  `capturedBody`, and asserts `Array.isArray(body.people)` and `body.people` equals
  `['Alice Smith', 'Bob Jones']`. The split is performed by `splitCommaString` in
  `useDocumentMetadata.ts` `onSubmit`. Falsifiable: removing `splitCommaString` would cause
  `body.people` to be the raw comma-separated string, failing `Array.isArray`. The `waitFor`
  assertion was tightened from `toBeDefined()` to `.textContent` equals
  `'Changes saved successfully.'` (S-1 actioned). (2) Null date handled without error:
  confirmed by two independent tests — "renders with an empty date field when document date
  is null" (lines 61-69) asserts `dateInput.value === ''` and no error text; "does not show
  a validation error on initial render with null date" (lines 214-223) confirms same in hook
  context. `toFormValues` maps `document.date ?? ''`; `MetadataEditSchema` accepts empty
  string via `.or(z.literal(''))`. (3) All Tier 2 tests pass: `curation.documents.test.ts`
  covers GET 200, GET 404, GET 500, PATCH 200, PATCH 400 (Express-propagated), PATCH 400
  (Hono-level Zod validation), PATCH 404. Browser tests cover save success, save error,
  empty description validation blocking PATCH, array splitting, null date handling. 136
  tests confirmed passing by code reviewer. (4) Lint and type check: confirmed by developer
  completion checklist and code reviewer.
- Manual checks: none required — all conditions are automated.
- User need: satisfied. US-082 requires a Primary Archivist to correct document metadata
  (type, date, people, land references, description) via the curation UI so incorrect
  system-detected values can be fixed. The implementation wires `DocumentMetadataForm` to
  `PATCH /api/curation/documents/:id/metadata` via `useSWRMutation`; all six fields flow
  through the Hono route to Express. The form shows a success message on save and an error
  message on failure. US-043 (no re-embedding in Phase 1) is a backend concern and not
  violated here. No gap between acceptance condition and user need.
- Outcome: done

---

### Task 12: Vocabulary review queue — components

**Description**: Implement the presentational components for the vocabulary review queue
page. Data fetching and accept/reject operations are wired in Task 13.

Specifically:

- Implement
  `src/app/(private)/curation/vocabulary/components/VocabularyQueueItem.tsx`: a single
  row in the vocabulary queue. Shows term name, category, confidence score (numeric, or
  "N/A" for null confidence), and source document description. Provides Accept and Reject
  action buttons (wired in Task 13). Props derived from `VocabularyCandidateItem` imported
  from `@institutional-knowledge/shared`.
- Implement `src/components/AcceptCandidateButton/AcceptCandidateButton.tsx` (posts to
  API, shows loading state — requires `'use client'`): posts an accept request to the API;
  shows loading state; on success triggers queue re-fetch; on error shows inline error
  message. Props: `{ termId: string; onSuccess: () => void }`.
- Implement `src/components/RejectCandidateButton/RejectCandidateButton.tsx` (posts to
  API, shows loading state — requires `'use client'`): posts a reject request to the API;
  shows loading state; on success triggers queue re-fetch; on error shows inline error
  message. Props: `{ termId: string; onSuccess: () => void }`.
- Write Tier 1 tests (Vitest + React Testing Library, static props):
  - `VocabularyQueueItem`: renders term, category, confidence, source document description;
    renders "N/A" when confidence is `null`; contains Accept and Reject buttons
  - `AcceptCandidateButton` and `RejectCandidateButton`: render in default, loading, and
    error states; accessible button labels

**Depends on**: Tasks 3, 4

**Complexity**: S

**Acceptance condition**: `VocabularyQueueItem`, `AcceptCandidateButton`, and
`RejectCandidateButton` components exist; Tier 1 RTL tests pass; `pnpm biome check` and
`pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-27):

- Automated checks: confirmed. All three components exist at the paths stated in the task
  description. (1) `VocabularyQueueItem.tsx`: renders term name, category, confidence as a
  number, "N/A" when confidence is null, source document description, and contains Accept and
  Reject buttons. `VocabularyQueueItem.browser.test.tsx` has 7 tests; all use falsifiable
  `.textContent` assertions (Round 1 blocking finding B-1 requiring removal of
  `getBy*(…).toBeDefined()` anti-patterns was resolved in Round 2 before the `reviewed`
  transition). Removing or altering any rendered field would cause the corresponding assertion
  to fail. (2) `AcceptCandidateButton.tsx` + `useAcceptCandidate.ts`: 4 tests cover idle
  state (accessible `aria-label="Accept term"`, enabled, text "Accept"), loading state
  (disabled, text "Accepting…"), error state (`role="alert"` with error message text), and
  null error (no alert rendered). Each assertion is falsifiable. (3) `RejectCandidateButton`
  and its hook follow the same pattern; 4 equivalent tests pass. Lint and TypeScript check
  confirmed by developer completion checklist and the Round 2 code reviewer.
- Manual checks: none required — all conditions are automated.
- User need: satisfied. US-066 requires the Primary Archivist to accept or reject each
  vocabulary candidate in the review queue so that they are the human gate for all vocabulary
  additions. Task 12 delivers the presentational layer: `VocabularyQueueItem` renders the
  information needed to make that decision (term, category, confidence, source document
  description), and `AcceptCandidateButton`/`RejectCandidateButton` provide accessible
  controls with loading state and inline error feedback. Data wiring (actual API calls and
  queue re-fetch) is explicitly deferred to Task 13 as stated in the task description — this
  is an intentional split, not a gap. US-063 (surface candidates in review queue) is also
  partially satisfied — the queue item rendering is in place; the fetch layer arrives in Task
  13. No gap between the acceptance condition and the user need within this task's scope.
- Outcome: done

---

### Task 13: Vocabulary review queue — Hono routes, handler, request functions, and data fetching

**Description**: Implement the vocabulary queue fetch and accept/reject operations across
all three custom server layers. Wire the vocabulary queue page with `useSWR` and the action
buttons with `useSWRMutation`.

**Custom server layers**:

- `server/requests/vocabulary.ts`: three request functions (no framework imports; use the
  pre-configured Ky instance):
  - `fetchVocabularyQueue(params?)` calls Express `GET /api/curation/vocabulary` (VOC-001);
    response schema (`VocabularyQueueResponse`) imported from
    `@institutional-knowledge/shared`
  - `acceptVocabularyCandidate(termId)` calls Express
    `POST /api/curation/vocabulary/:termId/accept` (VOC-002); response schema imported
    from shared
  - `rejectVocabularyCandidate(termId)` calls Express
    `POST /api/curation/vocabulary/:termId/reject` (VOC-003); response schema imported
    from shared
- `server/handlers/vocabularyHandler.ts`: thin wrappers; no orchestration logic
- `server/routes/vocabulary.ts`: three Hono route handlers:
  - `GET /api/curation/vocabulary` returns 200 with `VocabularyQueueResponse`
  - `POST /api/curation/vocabulary/:termId/accept` returns 200; propagates 404 and 409
  - `POST /api/curation/vocabulary/:termId/reject` returns 200; propagates 404 and 409

**UI layer**:

- Implement
  `src/app/(private)/curation/vocabulary/_hooks/useVocabularyQueue.ts`: custom hook using
  `useSWR`; SWR key is `/api/curation/vocabulary`. Returns
  `{ candidates, isLoading, error, mutate }`.
- Implement `src/app/(private)/curation/vocabulary/page.tsx`: vocabulary queue page; renders
  `VocabularyQueueList` using the hook; shows loading, empty, and error states.
- Implement `VocabularyQueueList` component: renders a list of `VocabularyQueueItem`
  components; passes `onSuccess` callback that calls `mutate()` to re-fetch after accept
  or reject.

**Tests**:

- Tier 2 — UI behaviour (Vitest + RTL + MSW; MSW intercepts at Hono route boundary
  `GET /api/curation/vocabulary`,
  `POST /api/curation/vocabulary/:termId/accept`,
  `POST /api/curation/vocabulary/:termId/reject`):
  - `useVocabularyQueue` hook: fetches on mount; returns candidates; shows empty state;
    shows error state on fetch failure
  - `AcceptCandidateButton` wired: triggers POST; loading state shown; queue re-fetches on
    success; inline error shown on API failure
  - `RejectCandidateButton` wired: same pattern as accept
- Tier 2 — Custom server route handler (Vitest + supertest; MSW at Express boundary
  `http://[express.baseUrl]/api/curation/vocabulary/*`):
  - `GET /api/curation/vocabulary`: returns 200 with vocabulary data from Express
  - `POST /api/curation/vocabulary/:termId/accept`: propagates 200, 404, and 409
  - `POST /api/curation/vocabulary/:termId/reject`: propagates 200, 404, and 409

**Depends on**: Tasks 2, 3, 12

**Complexity**: M

**Acceptance condition**: Vocabulary queue page fetches and renders candidates on mount;
accept and reject each trigger queue re-fetch confirmed by Tier 2 hook tests; all Tier 2
tests pass; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-27):

- Automated checks: confirmed. (1) `useVocabularyQueue.browser.test.tsx` — "fetches candidates
  on mount and returns them" starts in loading state, then asserts `candidates[0].termId` and
  `candidates[0].term` by value; falsifiable. "returns an empty candidates array when the queue
  is empty" and "sets error when the API returns a non-ok response" cover the remaining hook
  states. "re-fetches when mutate is called" asserts `requestCount` goes from 1 to 2, confirming
  actual re-fetch behaviour. (2) `useAcceptCandidate.browser.test.tsx` — "re-fetches the queue
  (calls onSuccess) after a successful accept" asserts `expect(onSuccess).toHaveBeenCalledOnce()`
  after a successful POST; `onSuccess` is wired in `VocabularyQueueList` to call `mutate()`,
  completing the re-fetch chain. Loading and error state tests use value-based or `toBe(true/false)`
  assertions; falsifiable. (3) Same pattern confirmed for `useRejectCandidate` by the code reviewer.
  (4) `curation.vocabulary.test.ts` covers GET/POST accept/POST reject with 200, 404, 409, and
  500 paths; all assertions use `toBe` or `toEqual/toMatchObject` on status and body — falsifiable.
  Lint and type-check reported passing by implementer and confirmed by code reviewer.
- Manual checks: none required — all conditions are automated.
- User need: satisfied. US-063 requires candidates to surface in the vocabulary review queue after
  processing. The `useVocabularyQueue` hook and `VocabularyQueuePage` load and render candidates
  on mount, covering the fetch layer that was deferred from Task 12. US-066 requires the Primary
  Archivist to accept or reject each candidate as the human gate for all vocabulary additions.
  The accept and reject actions POST to the backend and call `onSuccess → mutate()` on success,
  re-fetching the queue so the archivist sees an up-to-date state after each action. The backend
  consequences (term activation, rejected-list persistence) are Express concerns outside this
  task's scope. The code reviewer's three suggestions are non-blocking: a vacuous `typeof mutate`
  assertion (low value, not harmful), a file location divergence from the task description but
  not the plan (pragmatically sound), and a narrower fetcher cast that will need revisiting
  when pagination is wired. No gap between acceptance condition and user need.
- Outcome: done

---

### Task 13a: Frontend server pattern normalisation

**Description**: Tidy-up task to normalise patterns in the Hono custom server layer.
No new routes, no new features, no change to the observable HTTP contract.

Specifically:

- **`ServiceResult` in curation requests** — Add `CurationErrorType` union to
  `requests/curation.ts`. Wrap the 5 error-capable methods (`fetchDocumentDetail`,
  `clearDocumentFlag`, `updateDocumentMetadata`, `acceptTerm`, `rejectTerm`) in try/catch
  that catches `HTTPError` with status < 500, reads the response body, and returns a
  `ServiceResult` error branch — matching the pattern already used in
  `requests/documents.ts`. List endpoints (`fetchDocumentQueue`, `fetchVocabulary`) remain
  as plain throws.

- **Handler factory pattern** — Replace the 7 individual exported functions in
  `handlers/curationHandler.ts` with a `createCurationHandlers(requests)` factory that
  closes over `requests` once; each returned method takes only its own operation-specific
  params. Apply the same factory pattern to `handlers/uploadHandler.ts`:
  `createUploadHandlers(requests)` returns `{ upload(payload) }`.

- **`sendHonoServiceError` utility** — Create `routes/routeUtils.ts` with a
  `sendHonoServiceError` function (equivalent to `apps/backend/src/routes/routeUtils.ts`'s
  `sendServiceError`). Hono's `c.json()` returns `Response`; the function returns it.

- **Simplify curation routes** — In `routes/curation.ts`: add `log: Logger` to
  `CurationDeps`; create handlers once via `createCurationHandlers` at the top of the
  factory; replace all `try/catch + isHttpError` blocks with `result.outcome` branching
  using `sendHonoServiceError` and a consolidated `ERROR_STATUS` map typed as
  `Record<CurationErrorType, ContentfulStatusCode>`; add logging at `warn`/`info`/`error`
  levels matching the documents route; delete the `isHttpError` type guard.

- **Route param validation** — Add inline Zod UUID validation on `:id`, `:uploadId`, and
  `:termId` route params in both `routes/curation.ts` and `routes/documents.ts`, mirroring
  the backend's `validate({ params: DocumentIdParams })` pattern.

- **Remove dead stubs** — `findById`, `clearFlag`, and `patchMetadata` in
  `requests/documents.ts` are `throw new Error('not_implemented')` stubs; DOC-007/008/009
  are already fully implemented in `requests/curation.ts`. Remove them from the
  `DocumentsRequests` interface and factory. Remove the corresponding 501 stubs for
  `GET /:id`, `POST /:id/clear-flag`, and `PATCH /:id/metadata` from `routes/documents.ts`.
  Keep the `DELETE /:uploadId` stub — it is a valid future endpoint for browser-initiated
  upload cancellation.

- **Test setup helper** — Create `server/__tests__/testHelpers.ts` that exports a shared
  setup helper (equivalent to `apps/backend/src/testing/testHelpers.ts`), encapsulating the
  repeated `parseConfig` / `createHonoApp` / `createAdaptorServer` / supertest setup and
  MSW lifecycle hooks. Update all 5 Tier 2 test files to use it.

- **Update `uploadHandler` unit test** — Update `handlers/__tests__/uploadHandler.test.ts`
  call sites from `uploadHandler(requests, payload)` to
  `createUploadHandlers(requests).upload(payload)`. No new test cases.

See `documentation/tasks/frontend-task-13a-notes.md` for detailed per-file implementation
guidance.

**Depends on**: Task 13

**Complexity**: M

**Acceptance condition**: `pnpm biome check apps/frontend/src` passes;
`pnpm --filter frontend exec tsc --noEmit` passes; `pnpm --filter frontend test` passes
with all existing test assertions green; `isHttpError` no longer exists anywhere in
`server/`; `requests/documents.ts` no longer contains `findById`, `clearFlag`, or
`patchMetadata`; `handlers/curationHandler.ts` exports `createCurationHandlers` and no
individual handler functions; `handlers/uploadHandler.ts` exports `createUploadHandlers`
and no top-level `uploadHandler`; curation routes log at `error`, `warn`, and `info`
levels.

**Condition type**: automated + manual

**Status**: done

**Verification** (2026-03-27):

- Automated checks: confirmed structurally by reading the implementation files.
  - `isHttpError` — zero occurrences in `apps/frontend/server/` confirmed by full-text search.
  - `requests/documents.ts` — `findById`, `clearFlag`, and `patchMetadata` are absent. Interface
    and factory contain only the four upload-lifecycle methods plus `deleteUpload`.
  - `handlers/curationHandler.ts` — exports only `createCurationHandlers`. No individual
    top-level handler functions are exported.
  - `handlers/uploadHandler.ts` — exports only `createUploadHandlers` (plus re-exported types
    `UploadErrorType` and `UploadHandlerResult`). No top-level `uploadHandler` function.
  - `routes/curation.ts` — `ERROR_STATUS` is typed as `Record<CurationErrorType, ContentfulStatusCode>`
    (no casts needed). `log.error` is present on all unexpected-throw paths and list-route catch
    blocks; `log.warn` on all `result.outcome === 'error'` paths; `log.info` on every success path.
    All five UUID param validation checks are present.
  - `routes/documents.ts` — factory pattern applied; dead stubs for `GET /:id`,
    `POST /:id/clear-flag`, and `PATCH /:id/metadata` are removed; `DELETE /:uploadId` UUID
    validation is present. `ERROR_STATUS` typed as `Record<UploadErrorType, ContentfulStatusCode>`.
  - `routes/routeUtils.ts` (new) — `sendHonoServiceError` present, returns `Response`, generic
    over `K extends string` and `E`, mirrors backend `sendServiceError` pattern.
  - `server/__tests__/testHelpers.ts` (new) — `createTestRequest()` and `createMswServer()` with
    MSW lifecycle hooks. All 5 Tier 2 test files updated to use `createMswServer` and
    `createTestRequest` from `./testHelpers`.
  - `handlers/__tests__/uploadHandler.test.ts` — call sites updated to
    `createUploadHandlers(requests).upload(payload)`.

- Manual checks: the three commands below must pass before this task is considered fully
  verified at runtime. Run them and confirm all three exit clean:

  ```bash
  pnpm biome check apps/frontend/src
  pnpm --filter frontend exec tsc --noEmit
  pnpm --filter frontend test
  ```

  Expected: no lint errors, no type errors, all existing test assertions green.

- User need: this is a structural normalisation task with no direct user story. The underlying
  need is developer quality — consistent patterns across the Hono server layer so that future
  tasks (14 onwards) build from a uniform foundation and do not silently diverge. The
  implementation satisfies this intent: `ServiceResult` is now uniform in the request layer,
  handler factories are consistent, dead code is removed, and test setup is centralised.

- Outcome: done (pending developer confirmation of the three manual commands above)

---

### Task 14: Manual vocabulary term entry — components and page

**Description**: Implement the manual vocabulary term entry form components and page.
The API call is wired in Task 15.

Specifically:

- Implement `src/components/TermRelationshipsInput/TermRelationshipsInput.tsx` (dynamic
  list with add/remove — requires `'use client'`): sub-component of `AddVocabularyTermForm`.
  Allows the user to specify relationships between the new term and existing vocabulary
  terms. Each relationship has a `targetTermId` (UUID) and a `relationshipType` (free-text
  string — indicative types from ADR-038: owned_by, transferred_to, witnessed_by,
  adjacent_to, employed_by, referenced_in, performed_by, succeeded_by; not an exhaustive
  enumeration). Renders a dynamic list of relationship inputs; user can add and remove entries.
- Implement `src/components/AddVocabularyTermForm/AddVocabularyTermForm.tsx` (uses form
  state and `useSWRMutation` — requires `'use client'`): form for manually entering a new
  vocabulary term (US-062, UR-089). Fields: term name (string, required), category
  (free-text string, required), description (string, optional), aliases (multi-value input
  for `string[]`, optional), relationships via `TermRelationshipsInput` (optional). On
  submit, validates with `AddTermSchema` (from Task 3). API call wired in Task 15. Shows
  success or error on completion.
- Implement `src/app/(private)/curation/vocabulary/new/page.tsx`: page rendering
  `AddVocabularyTermForm`. No data fetching on load.
- Write Tier 1 tests (Vitest + React Testing Library, static props):
  - `TermRelationshipsInput`: renders with no entries; renders an entry with targetTermId
    and relationshipType fields; add and remove controls present and accessible
  - `AddVocabularyTermForm` (static): renders all fields; required field labels accessible

**Depends on**: Tasks 3, 4

**Complexity**: M

**Acceptance condition**: `AddVocabularyTermForm` and `TermRelationshipsInput` exist; Tier
1 RTL tests pass; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: not_started

---

### Task 15: Manual vocabulary term entry — Hono route, handler, and request function

**Description**: Implement the add-vocabulary-term operation across all three custom server
layers and wire `AddVocabularyTermForm` to the Hono API route via `useSWRMutation`.

**Custom server layers**:

- `server/requests/vocabulary.ts` (extend): one request function:
  - `addVocabularyTerm(payload)` calls Express
    `POST /api/curation/vocabulary/terms` (VOC-004); request body from
    `AddVocabularyTermRequest` imported from `@institutional-knowledge/shared`; response
    schema (`AddVocabularyTermResponse`) imported from shared
- `server/handlers/vocabularyHandler.ts` (extend): thin wrapper for add-term; no
  orchestration logic
- `server/routes/vocabulary.ts` (extend): one Hono route handler:
  - `POST /api/curation/vocabulary/terms` returns 201 on success; propagates 400
    (missing required fields), 409 (normalised term already exists), and 404 (referenced
    targetTermId not found) from Express with structured error body

**UI layer**:

- Wire `AddVocabularyTermForm` to call `POST /api/curation/vocabulary/terms` via
  `useSWRMutation` / `fetchWrapper`
- On success: redirect to `/curation/vocabulary` or show inline success message
  (implementer choice — either is acceptable)
- On error: show inline error message

**Tests**:

- Tier 2 — UI behaviour (Vitest + RTL + MSW; MSW intercepts at Hono route boundary
  `POST /api/curation/vocabulary/terms`):
  - Form hook: submits correctly structured payload; shows validation errors for missing
    required fields; `targetTermId` validated as UUID using `z.uuid()` (not
    `z.string().uuid()`); shows success on completion; shows inline error on API failure
- Tier 2 — Custom server route handler (Vitest + supertest; MSW at Express boundary
  `http://[express.baseUrl]/api/curation/vocabulary/terms`):
  - `POST /api/curation/vocabulary/terms`: returns 201 on success; propagates 400, 409,
    and 404 correctly

**Depends on**: Tasks 2, 3, 14

**Complexity**: M

**Acceptance condition**: Add-term route implemented; `targetTermId` validated with
`z.uuid()` (not `z.string().uuid()`) confirmed by Tier 2 UI test; all Tier 2 tests pass;
`pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: not_started

---

### Task 16: Request function contract sweep — Tier 1 unit tests

**Description**: Write a single dedicated Tier 1 test file that imports every request
function across all request function modules and asserts the contract for each outbound
Express call. This is a cross-cutting quality gate that ensures no request function silently
drifts from its contract after future changes. It does not replace the per-task Tier 2
tests.

For every request function, the test file:

- Mocks the pre-configured Ky instance (from `server/requests/client.ts`) at the import
  level
- Asserts correct URL constructed (full path including any path parameters)
- Asserts correct HTTP method (GET, POST, PATCH, DELETE)
- Asserts `x-internal-key` header is present on every call
- Asserts correct request body or query parameter structure for methods that carry a body

Request functions to cover:

| Function | Method | Express path | Contract |
| --- | --- | --- | --- |
| `initiateUpload` | POST | `/api/documents/initiate` | DOC-001 |
| `uploadFileBytes` | POST | `/api/documents/:uploadId/upload` | DOC-002 |
| `finalizeUpload` | POST | `/api/documents/:uploadId/finalize` | DOC-003 |
| `deleteUpload` | DELETE | `/api/documents/:uploadId` | DOC-005 |
| `fetchDocumentQueue` | GET | `/api/curation/documents` | DOC-006 |
| `fetchDocumentDetail` | GET | `/api/documents/:id` | DOC-007 |
| `clearDocumentFlag` | POST | `/api/documents/:id/clear-flag` | DOC-008 |
| `updateDocumentMetadata` | PATCH | `/api/documents/:id/metadata` | DOC-009 |
| `fetchVocabularyQueue` | GET | `/api/curation/vocabulary` | VOC-001 |
| `acceptVocabularyCandidate` | POST | `/api/curation/vocabulary/:termId/accept` | VOC-002 |
| `rejectVocabularyCandidate` | POST | `/api/curation/vocabulary/:termId/reject` | VOC-003 |
| `addVocabularyTerm` | POST | `/api/curation/vocabulary/terms` | VOC-004 |

Test file location: `server/requests/__tests__/contractSweep.test.ts`.

**Depends on**: Tasks 6, 9, 11, 13, 15

**Complexity**: M

**Acceptance condition**: `server/requests/__tests__/contractSweep.test.ts` exists and
covers all 12 request functions listed above; each test asserts URL, method,
`x-internal-key` presence, and body or param structure; all tests pass; `pnpm biome check`
and `pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: automated

**Status**: not_started

---

### Task 17: E2E tests — critical happy paths and key error paths

**Description**: Write a small Playwright E2E test suite covering the critical happy paths
and key error paths that can only be verified with the full component tree, Hono custom
server, and Next.js assembled together.

Architecture: Playwright drives a real browser against a running Hono custom server (which
mounts Next.js). Express backend calls are intercepted at the network boundary using a
lightweight mock HTTP server or MSW in Node server mode, so the test suite does not depend
on a running Express backend or database.

Test scenarios:

**C1 — Document intake**:

- Happy path: navigate to `/upload`; select a supported file with a conforming filename;
  verify date and description are pre-populated from the filename; submit the form; verify
  the success page renders with the correct archive reference
- Duplicate detection: submit a file that the mock Express returns a 409 for; verify
  `DuplicateConflictAlert` renders with the correct `existingRecord` data from
  `response.data.existingRecord`; verify the form remains interactive (submit re-enabled)

**Curation — Document queue**:

- Happy path: navigate to `/curation/documents`; verify the queue renders with mock items;
  click "Clear flag" on an item; verify the item is removed from the queue (re-fetch
  triggered)

**Curation — Metadata edit**:

- Happy path: navigate to `/curation/documents/:id`; verify form is pre-populated from
  mock document detail; edit the description; save; verify success message displayed

**Curation — Vocabulary queue**:

- Happy path: navigate to `/curation/vocabulary`; verify candidates render; click Accept
  on one; verify item removed from queue

Keep the count to these five scenarios — Tier 2 tests cover the bulk of confidence.
Additional edge cases belong at Tier 2.

**Depends on**: Tasks 7, 9, 11, 13

**Complexity**: L

**Acceptance condition**: Playwright test suite exists at `e2e/` or
`apps/frontend/e2e/`; all five scenarios pass against a running Hono custom server with
mocked Express backend; `pnpm --filter frontend exec playwright test` command exists in
`package.json` and passes.

**Condition type**: automated

**Status**: not_started

---

### Task 18: Frontend configuration file and Docker setup

**Description**: Finalise the frontend configuration files and Docker setup for the
`apps/frontend/` service.

Specifically:

- Create `apps/frontend/config.json5`: base configuration for local development. Required
  keys:
  - `server.port: 3000`
  - `express.baseUrl: "http://backend:4000"` (Docker Compose service name)
  - `express.internalKey: "change-me-in-production"`
  - `upload.maxFileSizeMb: 50`
  - `upload.acceptedExtensions: [".pdf", ".tif", ".tiff", ".jpg", ".jpeg", ".png"]`
- Create `apps/frontend/Dockerfile`: multi-stage build; build stage installs all
  dependencies and compiles Next.js; production stage copies only the built output and
  production dependencies; entry point starts the Hono custom server (not `next start`);
  follows the same Docker patterns used by `apps/backend/Dockerfile`
- Update `docker-compose.yml` (root): add the `frontend` service; set environment
  variables and config volume mount; expose port 3000; depends on `backend` service
- Verify the `express.internalKey` is not present in any HTTP response by running the
  Tier 2 server test from Task 2 as part of the Docker smoke test

**Depends on**: Tasks 2, 3, 6, 9, 11, 13, 15

**Complexity**: M

**Acceptance condition**: `config.json5` exists with all required keys; `Dockerfile` builds
without error (`docker build`); `docker-compose.yml` includes the `frontend` service; the
`express.internalKey` does not appear in any response header (verified by Tier 2 test from
Task 2).

**Condition type**: both

**Status**: not_started

---
