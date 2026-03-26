# Development Principles — Frontend

This file covers frontend-specific implementation patterns for `apps/frontend/`.
Read it alongside `development-principles.md` (universal principles), which defines the
principles that apply across all services.

---

## Frontend framework agnosticism

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
  migration to `Temporal` is deferred to Phase 2 (see ADR-050).

---

## Frontend testing strategy — three tiers

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

---

## Hono custom server — thin validation and security proxy

The Hono custom server is a validation and security layer, not a business logic layer. Its
responsibilities are:

1. Validate that required inputs are present and well-formed (e.g. file is a `File`, date
   is a string)
2. Enforce authentication and authorisation (Phase 2)
3. Call the handler layer and map the result to an HTTP response

It is not the Hono server's job to re-classify, enrich, or make decisions about backend
error responses. Backend `ServiceResult` error outcomes are passed through faithfully to the
client using the `ERROR_STATUS` map — the error type and message come from the backend and
are not modified. Business logic belongs in Express.

Concretely:

- Route handlers are short: input validation, one handler call, response mapping
- The `ERROR_STATUS: Record<UploadErrorType, number>` map is the only place HTTP status
  codes are decided for backend errors — no ad-hoc status code selection in handlers
- No conditional logic based on backend response content beyond what is needed to shape
  the response envelope (e.g. including `errorData` for `duplicate_detected`)
- If a route handler is growing business logic, that logic belongs in the Express service
  layer instead
- Route handlers must wrap all async calls that may re-throw in a try/catch block. Unhandled
  promise rejections must not propagate to Hono's default error handler — they produce
  unstructured responses with no Pino logging. Catch unexpected throws, log with
  `deps.log.error`, and return a structured error response

---

## Component state separation

Any Client Component that owns state must separate state logic from rendering using a
custom hook. This applies to all stateful components — not just forms. The component
file is a pure rendering layer; the hook owns all state, async operations, and event
handlers.

- Hook file: `use[ComponentName].ts` co-located with the component in the same directory
  (e.g. `src/components/DocumentUploadForm/useDocumentUpload.ts`,
  `src/app/(private)/curation/documents/components/useClearFlag.ts`)
- Hook returns the values and handlers the component needs — `control`, `errors`,
  `formState`, `handleSubmit`, `handleClear`, `isClearing`, `error`, etc.
- Component file: imports the hook, destructures its return value, passes values to
  child components as props — no `useState`, no `useForm`, no async logic, no event
  handler definitions
- Co-location rule: if the hook is tightly coupled to a single component, it lives next
  to that component. If the hook is shared across a page's components (e.g. a data
  fetching hook for a page), it lives in a `_hooks/` directory co-located with the page.

This separation makes components easier to test in isolation (render with static props),
makes hooks independently testable via `renderHook`, and keeps the state/rendering
boundary explicit. See ADR-052.

**Optional inner split — shell + content**:

When the rendering layer itself has conditional logic worth testing in isolation (e.g.
conditional display values, dynamic links, branching render paths), split the component
into two parts:

- **Shell** (`ComponentName.tsx`): calls the hook, spreads the return value as props onto
  the content component. No rendering logic of its own.
- **Content** (`ComponentNameContent` — inner function or separate file): receives all
  values as plain props; no hook calls. This is the part that is tested with static props.

```tsx
// Shell — calls hook, delegates rendering
export function DocumentQueueItem({ id }: { id: string }) {
  const props = useDocumentQueueItem(id);
  return <DocumentQueueItemContent {...props} />;
}

// Content — pure props, testable in isolation
function DocumentQueueItemContent({ date, description, ... }: ContentProps) {
  return <div>...</div>;
}
```

Apply this split when:

- The content component has conditional rendering (e.g. `date ?? 'Undated'`, flag reason
  text, dynamic hrefs) that is worth asserting with multiple static prop combinations
- You want to test rendering edge cases without involving the hook or data fetching layer

Do not apply this split when the rendering layer is a pure prop passthrough with no
conditional logic — the extra indirection adds complexity without test value.

---

## Next.js bundler constraints

**Local import extensions**:

Relative imports within `src/` must not use explicit `.js` extensions (e.g. `'./temporal'`
not `'./temporal.js'`). The project uses `moduleResolution: bundler` in `tsconfig.json`,
which means Next.js resolves TypeScript source files directly — it does not perform Node-style
extension substitution. An explicit `.js` suffix causes a "module not found" error at dev-server
startup because no compiled `.js` file exists in the source tree. Vitest uses its own resolver
and tolerates `.js` extensions, so the error only surfaces when running the dev server —
making it easy to miss in automated checks.

**Node-only server modules**:

Any module that uses Node-only APIs or CJS `require` tricks (e.g. `nconf` loaded via
`createRequire`) must be declared in `serverExternalPackages` in `next.config.ts`. Next.js
attempts to bundle all imports including Server Component dependencies; modules that cannot
be bundled will cause a build failure. `serverExternalPackages` tells Next.js to leave those
modules as runtime `require()` calls instead of inlining them. Vitest does not use the Next.js
bundler, so this failure does not surface in tests — it only appears when the dev server or
production build processes a page that imports the affected module.

---

## Schema placement — frontend rules

See `development-principles-backend.md` (Schema Placement section) for the full table
covering where each schema type lives and why. The rules below are the frontend-specific
additions.

**Frontend schema rule**: the frontend must import contract schemas from
`@institutional-knowledge/shared` rather than redefine them. `apps/frontend/src/lib/schemas.ts`
contains only the three frontend form validation schemas that are purely frontend concerns:

| Schema | Reason |
| --- | --- |
| `UploadFormSchema` | Validates a browser `File` object — not an API contract |
| `MetadataEditSchema` | Derived from `UpdateDocumentMetadataRequest`; extends it with frontend-specific transformation rules (e.g. comma-separated string inputs) |
| `AddTermSchema` | Derived from `AddVocabularyTermRequest`; extends it with frontend-specific rules |

**Frontend schema derivation — preserve source field transformations**: when a frontend
schema overrides a field from a shared schema via `.extend()`, the override must preserve
any transformations the source field applies (`.trim()`, `.toLowerCase()`, coercions). A
`.refine()` check replicates the validation invariant but drops the transformation — the
form will submit a value the server would silently mutate, making round-trip behaviour
inconsistent and harder to reason about.

---

## Frontend sub-system boundary

`apps/frontend/` has two distinct sub-systems:

- `src/` — the Next.js UI (browser + RSC)
- `server/` — the Hono custom server (Node.js)

Files under `src/` must not import directly from `server/` via relative paths (e.g.
`../../../../server/config/index`). If `server/` is restructured, such imports break
silently. Config values or other server-side data needed by pages must be exposed through
a thin re-export in `src/lib/` (e.g. `src/lib/config.ts`).

---

## Server vs Client Components

React Server Components (RSC) are the default in Next.js. A component should
only be marked `'use client'` when it has a concrete reason to run in the
browser.

**Default: Server Component.** Omit `'use client'` unless the component
requires one of:

- React state (`useState`, `useReducer`)
- React effects (`useEffect`, `useLayoutEffect`)
- Browser APIs (`window`, `document`, `localStorage`, etc.)
- Event handlers attached to DOM elements
- A third-party library that itself requires `'use client'`

Presentational components that only receive props and render markup have no
such requirements. Adding `'use client'` to them unnecessarily increases the
client bundle and prevents the component from running at the server rendering
stage.

**Anti-pattern**: adding `'use client'` by default or copying it from an
adjacent component without checking whether it is needed.

---

## What these principles rule out (frontend)

| Anti-pattern | Why prohibited | Principle violated |
| --- | --- | --- |
| Importing Next.js, Hono, or Express in a custom hook, handler, or request function | Couples business logic to the framework | Frontend Framework Agnosticism |
| Calling useSWR or useSWRMutation directly in a component (not inside a custom hook) | Scatters data-fetching logic across components | Frontend Framework Agnosticism |
| Plain `fetch` calls inside a custom hook (bypassing useSWR/useSWRMutation) | Loses caching, deduplication, and revalidation guarantees | Frontend Framework Agnosticism |
| Setting the `x-internal-key` header outside of the request functions layer | The internal key is a server-to-server credential; must never appear in browser-side code | Security / Frontend Framework Agnosticism |
| Importing directly from `server/` via a relative path in any file under `src/` | Couples UI sub-system to Hono custom server sub-system | Frontend Sub-system Boundary |
| Redefining a response schema in `apps/frontend/src/lib/schemas.ts` that is already defined in `packages/shared/src/schemas/` | Creates a duplicate definition that can silently drift from the backend source of truth | Schema Placement / Type Safety |
| Inline `ERROR_STATUS` conditionals (e.g. `errorType === 'not_found' ? 404 : 409`) instead of a `Record<ErrorType, number>` map | The `Record` form is TypeScript-exhaustiveness-checked | Error Response Pattern |
| Adding `'use client'` to a presentational component that has no state, effects, browser APIs, or event handlers | Increases client bundle and prevents server-stage rendering unnecessarily | Server vs Client Components |
